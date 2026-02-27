package handlers

import (
	"backroom/internal/db"
	"backroom/internal/models"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
)

type ManifestItem struct {
	UUID                string `json:"uuid"`
	FilePath            string `json:"file_path"`
	SourcePage          int    `json:"source_page"`
	DetectionMethod     string `json:"detection_method"`
	SourcePageImagePath string `json:"source_page_image_path"`
	SourcePageDims      []int  `json:"source_page_dims"`
	Box                 []int  `json:"box"`
	DetectedSKU         string `json:"detected_sku"`
	DetectedName        string `json:"detected_name"`
}

// UploadHandler handles PDF upload and saves it to shared volume with broad permissions
func UploadHandler(w http.ResponseWriter, r *http.Request) {
	// 1. Parse Multipart Form
	err := r.ParseMultipartForm(50 << 20) // 50MB max
	if err != nil {
		http.Error(w, "File too big", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "Invalid file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// 2. Prepare Destination (Staging)
	sharedDir := os.Getenv("SHARED_DIR")
	if sharedDir == "" {
		sharedDir = "./shared" // Fallback for local dev
	}
	uploadsDir := filepath.Join(sharedDir, "uploads")
	os.MkdirAll(uploadsDir, 0777) // Ensure directory exists

	filename := header.Filename
	destPath := filepath.Join(uploadsDir, filename)

	dst, err := os.Create(destPath)
	if err != nil {
		log.Println("Error creating file:", err)
		http.Error(w, "Server Error", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	// 3. Copy Content
	if _, err := io.Copy(dst, file); err != nil {
		http.Error(w, "Server Error", http.StatusInternalServerError)
		return
	}

	// 4. CRITICAL: Set Permissions for Python Worker
	if err := os.Chmod(destPath, 0777); err != nil {
		log.Println("Error setting permissions:", err)
		// Don't fail the request, but log it
	}

	// 5. Save to DB
	sourceFile := models.SourceFile{
		FileName: filename,
		FileSize: header.Size,
		FilePath: destPath,
		Status:   "Uploaded",
	}
	db.DB.Create(&sourceFile)

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"status": "uploaded", "path": destPath})
}

// ProcessManifestHandler triggers the digestion of worker results for a specific file
func ProcessManifestHandler(w http.ResponseWriter, r *http.Request) {
	filename := r.URL.Query().Get("filename")
	if filename == "" {
		http.Error(w, "Filename required", http.StatusBadRequest)
		return
	}

	sharedDir := os.Getenv("SHARED_DIR")
	if sharedDir == "" {
		sharedDir = "./shared"
	}
	// Match the naming convention from worker: manifest_{filename}.json
	manifestPath := filepath.Join(sharedDir, "processed", "manifest_"+filename+".json")
	log.Printf("Attempting to open manifest at: %s", manifestPath)

	file, err := os.Open(manifestPath)
	if err != nil {
		// Check for progress file
		progressPath := filepath.Join(sharedDir, "processed", "progress_"+filename+".json")
		if pFile, pErr := os.Open(progressPath); pErr == nil {
			defer pFile.Close()
			var progress interface{}
			if err := json.NewDecoder(pFile).Decode(&progress); err == nil {
				w.WriteHeader(http.StatusAccepted)
				json.NewEncoder(w).Encode(progress)
				return
			}
		}

		w.WriteHeader(http.StatusAccepted)
		json.NewEncoder(w).Encode(map[string]interface{}{"status": "processing", "message": "Mining data..."})
		return
	}
	defer file.Close()

	// Try to decode as new format (object) or old format (array)
	var manifest struct {
		Items       []ManifestItem `json:"items"`
		MissingSKUs []string       `json:"missing_skus"`
		Mode        string         `json:"mode"`
	}

	// Read file content
	content, err := io.ReadAll(file)
	if err != nil {
		http.Error(w, "Failed to read manifest", http.StatusInternalServerError)
		return
	}

	// Try new format
	if err := json.Unmarshal(content, &manifest); err != nil {
		// Fallback to old format (array)
		var items []ManifestItem
		if err2 := json.Unmarshal(content, &items); err2 != nil {
			http.Error(w, "Invalid manifest format", http.StatusInternalServerError)
			return
		}
		manifest.Items = items
		manifest.Mode = "auto"
	}

	// Generate Preview Response (No DB Insert)
	var previewProducts []models.Product
	for _, item := range manifest.Items {

		// Prepare JSON strings
		dimsBytes, _ := json.Marshal(item.SourcePageDims)
		rectBytes, _ := json.Marshal(item.Box)

		// Determine SKU and Title
		// Ensure UUID slice bounds
		uuidStr := item.UUID
		if len(uuidStr) > 8 {
			uuidStr = uuidStr[:8]
		}
		sku := "DRAFT-" + uuidStr
		if item.DetectedSKU != "" {
			sku = item.DetectedSKU
		}

		title := "Detected Item (Page " + string(rune(item.SourcePage+'0')) + ")"
		if item.DetectedName != "" {
			title = item.DetectedName
		}

		// Parse UUID
		uid, err := uuid.Parse(item.UUID)
		if err != nil {
			uid = uuid.New()
		}

		previewProducts = append(previewProducts, models.Product{
			ID:                  uid,
			SKU:                 sku,
			ImagePath:           strings.Replace(item.FilePath, "/app/shared/processed", "/media", 1),
			Status:              models.StatusDraft,
			StockOnHand:         0,
			Title:               title,
			SourcePageImagePath: strings.Replace(item.SourcePageImagePath, "/app/shared/processed", "/media", 1),
			SourcePageDims:      string(dimsBytes),
			ImageRect:           string(rectBytes),
		})
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":       "preview",
		"products":     previewProducts,
		"missing_skus": manifest.MissingSKUs,
		"mode":         manifest.Mode,
	})
}

// TriggerProcessHandler moves file from uploads to raw to start worker
func TriggerProcessHandler(w http.ResponseWriter, r *http.Request) {
	filename := r.URL.Query().Get("filename")
	if filename == "" {
		http.Error(w, "Filename required", http.StatusBadRequest)
		return
	}

	sharedDir := os.Getenv("SHARED_DIR")
	if sharedDir == "" {
		sharedDir = "./shared"
	}

	srcPath := filepath.Join(sharedDir, "uploads", filename)
	destPath := filepath.Join(sharedDir, "raw", filename)

	// Check if file exists in uploads
	if _, err := os.Stat(srcPath); os.IsNotExist(err) {
		// Fallback: Check if already in raw?
		if _, err := os.Stat(destPath); err == nil {
			// Already in raw, just return OK (Worker might be processing)
			json.NewEncoder(w).Encode(map[string]string{"status": "triggered", "message": "File already processing"})
			return
		}
		http.Error(w, "File not found in staging", http.StatusNotFound)
		return
	}

	// Sidecar for Targeted Extraction
	supplierID := r.URL.Query().Get("supplier_id")
	if supplierID != "" {
		var products []models.Product
		if err := db.DB.Where("supplier_id = ?", supplierID).Find(&products).Error; err == nil {
			var skus []string
			for _, p := range products {
				if p.SKU != "" {
					skus = append(skus, p.SKU)
				}
			}
			// Always write sidecar if supplier selected, even if empty (to indicate specific supplier mode)
			sidecar := map[string]interface{}{
				"target_skus": skus,
				"supplier_id": supplierID,
			}
			sidecarPath := filepath.Join(sharedDir, "raw", "target_skus_"+filename+".json")
			if f, err := os.Create(sidecarPath); err == nil {
				json.NewEncoder(f).Encode(sidecar)
				f.Close()
				os.Chmod(sidecarPath, 0777)
			}
		}
	}

	// Move file
	if err := os.Rename(srcPath, destPath); err != nil {
		log.Printf("Error moving file: %v", err)
		http.Error(w, "Failed to trigger processing", http.StatusInternalServerError)
		return
	}

	// Ensure permissions for worker
	os.Chmod(destPath, 0777)

	json.NewEncoder(w).Encode(map[string]string{"status": "triggered"})
}

// ClearProductsHandler deletes all products (Drafts)
func ClearProductsHandler(w http.ResponseWriter, r *http.Request) {
	db.DB.Exec("DELETE FROM products")
	db.DB.Exec("DELETE FROM source_files") // Optional: clear history too? User said "clean what is loaded"
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "cleared"})
}

// GetSourceFilesHandler returns list of uploaded files
// GetSourceFilesHandler returns list of uploaded files
func GetSourceFilesHandler(w http.ResponseWriter, r *http.Request) {
	var files []models.SourceFile
	db.DB.Order("created_at desc").Find(&files)

	sharedDir := os.Getenv("SHARED_DIR")
	if sharedDir == "" {
		sharedDir = "./shared"
	}

	type FileResponse struct {
		models.SourceFile
		IsReady bool `json:"is_ready"`
	}

	var response []FileResponse
	for _, f := range files {
		manifestPath := filepath.Join(sharedDir, "processed", "manifest_"+f.FileName+".json")
		isReady := false
		if _, err := os.Stat(manifestPath); err == nil {
			isReady = true
		}
		response = append(response, FileResponse{
			SourceFile: f,
			IsReady:    isReady,
		})
	}

	json.NewEncoder(w).Encode(response)
}
