package handlers

import (
	"backroom/internal/db"
	"backroom/internal/models"
	"encoding/json"
	"image"
	"image/jpeg"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"golang.org/x/image/draw"
	"gorm.io/gorm"
)

// DeleteProductHandler removes a product and its local image file
func DeleteProductHandler(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	var product models.Product
	if err := db.DB.First(&product, id).Error; err != nil {
		http.Error(w, "Product not found", http.StatusNotFound)
		return
	}

	// Delete local file (if it exists)
	// ImagePath is like "/media/processed/images/..."
	// We need to map it back to internal path: "/app/shared/processed/images/..."
	internalPath := strings.Replace(product.ImagePath, "/media", "/app/shared", 1)
	os.Remove(internalPath)

	// Delete from DB
	db.DB.Delete(&product)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
}

// UpdateProductHandler updates a product (e.g. status='PUBLISHED', edit SKU/Title)
func UpdateProductHandler(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	var payload struct {
		SKU    string               `json:"sku"`
		Title  string               `json:"title"`
		Status models.ProductStatus `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}

	var product models.Product
	if err := db.DB.First(&product, id).Error; err != nil {
		http.Error(w, "Product not found", http.StatusNotFound)
		return
	}

	if payload.SKU != "" {
		product.SKU = payload.SKU
	}
	if payload.Title != "" {
		product.Title = payload.Title
	}
	if payload.Status != "" {
		product.Status = payload.Status
	}

	db.DB.Save(&product)
	json.NewEncoder(w).Encode(product)
}

// RecropHandler re-crops the product image from the original full page
func RecropHandler(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	// id could be UUID or generic string for drafts

	var payload struct {
		X float64 `json:"x"`
		Y float64 `json:"y"`
		W float64 `json:"w"`
		H float64 `json:"h"`
		// Context for Drafts (not in DB yet)
		SourcePath string `json:"source_path"` // /media/...
		DestPath   string `json:"dest_path"`   // /media/...
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid crop payload", http.StatusBadRequest)
		return
	}

	var sourcePathInternal, destPathInternal string
	var product models.Product
	inDB := false

	// Try to find in DB
	if id, err := uuid.Parse(idStr); err == nil {
		if err := db.DB.First(&product, id).Error; err == nil {
			inDB = true
			if product.SourcePageImagePath != "" {
				sourcePathInternal = strings.Replace(product.SourcePageImagePath, "/media", "/app/shared", 1)
				destPathInternal = strings.Replace(product.ImagePath, "/media", "/app/shared", 1)
			}
		}
	}

	// Fallback to Payload for Drafts
	if !inDB {
		log.Printf("Recrop: Product not in DB. Payload Source: %s, Dest: %s", payload.SourcePath, payload.DestPath)
		if payload.SourcePath == "" || payload.DestPath == "" {
			http.Error(w, "Product not in DB and paths not provided", http.StatusNotFound)
			return
		}
		// Fix: Map /media back to /app/shared/processed (where pages and images live)
		sourcePathInternal = strings.Replace(payload.SourcePath, "/media", "/app/shared/processed", 1)
		destPathInternal = strings.Replace(payload.DestPath, "/media", "/app/shared/processed", 1)
		log.Printf("Recrop: Resolved Source: %s, Dest: %s", sourcePathInternal, destPathInternal)
	}

	if sourcePathInternal == "" {
		http.Error(w, "Missing source path", http.StatusBadRequest)
		return
	}

	// Open Source Image
	file, err := os.Open(sourcePathInternal)
	if err != nil {
		http.Error(w, "Source image not found: "+sourcePathInternal, http.StatusNotFound)
		return
	}
	defer file.Close()

	_, _, err = image.DecodeConfig(file)
	if err != nil {
		// Try to reopen to decode fully
		return
	}
	// Reopen to decode full image
	file.Seek(0, 0)
	srcImg, _, err := image.Decode(file)
	if err != nil {
		http.Error(w, "Failed to decode source image", http.StatusInternalServerError)
		return
	}

	// Crop
	// If W/H are relative (0-1) or absolute?
	// The payload from react-image-crop usually gives pixels or %
	// Let's assume the frontend sends Absolute Pixels relative to the image's intrinsic size
	// OR the frontend sends values relative to the displayed image.
	// We will assume the frontend sends TRUE PIXEL COORDINATES matching the source image.

	x := int(payload.X)
	y := int(payload.Y)
	width := int(payload.W)
	height := int(payload.H)

	// Validate bounds
	bounds := srcImg.Bounds()
	if x < 0 {
		x = 0
	}
	if y < 0 {
		y = 0
	}
	if x+width > bounds.Max.X {
		width = bounds.Max.X - x
	}
	if y+height > bounds.Max.Y {
		height = bounds.Max.Y - y
	}

	// Perform cropping
	rect := image.Rect(x, y, x+width, y+height)
	// SubImage is supported by most image types in Go
	type SubImager interface {
		SubImage(r image.Rectangle) image.Image
	}

	var croppedImg image.Image
	if si, ok := srcImg.(SubImager); ok {
		croppedImg = si.SubImage(rect)
	} else {
		// Fallback: Create new image and draw
		dst := image.NewRGBA(image.Rect(0, 0, width, height))
		draw.Draw(dst, dst.Bounds(), srcImg, image.Point{x, y}, draw.Src)
		croppedImg = dst
	}

	// Overwrite existing product image
	out, err := os.Create(destPathInternal)
	if err != nil {
		http.Error(w, "Failed to save cropped image", http.StatusInternalServerError)
		return
	}
	defer out.Close()

	// Re-encode (assuming JPEG for now, could detect from extension)
	jpeg.Encode(out, croppedImg, nil)

	// Update ImageRect in DB
	// Update ImageRect in DB if exists
	if inDB {
		newRect := []int{x, y, x + width, y + height}
		rectBytes, _ := json.Marshal(newRect)
		product.ImageRect = string(rectBytes)
		db.DB.Save(&product)
	}

	// Return new image URL (add query param to bust cache)
	// Return new image URL (add query param to bust cache)
	// If it was a draft, we return the same DestPath but accessible via /media
	// Map /app/shared/processed back to /media
	publicURL := strings.Replace(destPathInternal, "/app/shared/processed", "/media", 1)
	json.NewEncoder(w).Encode(map[string]string{
		"message":       "recrop success",
		"new_image_url": publicURL + "?t=" + uuid.NewString(),
	})
}

// GetProductsHandler returns all products
func GetProductsHandler(w http.ResponseWriter, r *http.Request) {
	var products []models.Product
	db.DB.Order("created_at desc").Find(&products)
	json.NewEncoder(w).Encode(products)
}

// SyncProductHandler stub
func SyncProductHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusNotImplemented)
}

// CreateProductHandler saves a product from the preview (Draft)
func CreateProductHandler(w http.ResponseWriter, r *http.Request) {
	var product models.Product
	if err := json.NewDecoder(r.Body).Decode(&product); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	// Basic Validation
	if product.SKU == "" {
		http.Error(w, "SKU is required", http.StatusBadRequest)
		return
	}

	// 1. Check if SKU exists
	var existing models.Product

	// Check by SKU
	err := db.DB.Where("sku = ?", product.SKU).First(&existing).Error

	switch err {
	case nil:
		// --- UPDATE EXISTING ---
		// If exists, we update fields.
		// Especially important if it was PENDING_IMAGE (from Excel) and now we have the Image (from PDF)

		existing.Title = product.Title
		existing.ImagePath = product.ImagePath
		existing.SourcePageImagePath = product.SourcePageImagePath
		existing.SourcePageDims = product.SourcePageDims
		existing.ImageRect = product.ImageRect

		// Map Status logic
		// If it was PENDING_IMAGE, and we are saving, it becomes APPROVED
		// If it was already APPROVED, it stays APPROVED
		existing.Status = "APPROVED"

		existing.UpdatedAt = time.Now()

		if err := db.DB.Save(&existing).Error; err != nil {
			http.Error(w, "Failed to update product: "+err.Error(), http.StatusInternalServerError)
			return
		}

		// Return the Updated object (with the OLD ID)
		json.NewEncoder(w).Encode(existing)
		return

	case gorm.ErrRecordNotFound:
		// --- CREATE NEW ---
		product.ID = uuid.New()
		product.Status = "APPROVED"
		if product.Status == "" {
			product.Status = models.StatusDraft
		}

		if result := db.DB.Create(&product); result.Error != nil {
			http.Error(w, result.Error.Error(), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(product)
		return

	default:
		// DB Error
		http.Error(w, "Database error checking SKU: "+err.Error(), http.StatusInternalServerError)
		return
	}
}
