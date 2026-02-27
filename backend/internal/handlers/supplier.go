package handlers

import (
	"backroom/internal/db"
	"backroom/internal/models"
	"encoding/json"
	"log"
	"net/http"

	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/xuri/excelize/v2"
	"gorm.io/gorm/clause"
)

// GetSuppliersHandler - List all
func GetSuppliersHandler(w http.ResponseWriter, r *http.Request) {
	var suppliers []models.Supplier
	db.DB.Find(&suppliers)
	json.NewEncoder(w).Encode(suppliers)
}

// GetSupplierHandler - Get single
func GetSupplierHandler(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var supplier models.Supplier
	if err := db.DB.First(&supplier, id).Error; err != nil {
		http.Error(w, "Not Found", http.StatusNotFound)
		return
	}
	json.NewEncoder(w).Encode(supplier)
}

// CreateSupplierHandler - Create new
func CreateSupplierHandler(w http.ResponseWriter, r *http.Request) {
	var supplier models.Supplier
	if err := json.NewDecoder(r.Body).Decode(&supplier); err != nil {
		http.Error(w, "Invalid Body", http.StatusBadRequest)
		return
	}
	var count int64
	db.DB.Model(&models.Supplier{}).Where("name = ?", supplier.Name).Count(&count)
	if count > 0 {
		http.Error(w, "Supplier with this name already exists", http.StatusConflict)
		return
	}

	if result := db.DB.Create(&supplier); result.Error != nil {
		http.Error(w, "DB Error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(supplier)
}

// UpdateSupplierHandler - Update existing
func UpdateSupplierHandler(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var supplier models.Supplier
	if err := db.DB.First(&supplier, id).Error; err != nil {
		http.Error(w, "Not Found", http.StatusNotFound)
		return
	}

	var updateData models.Supplier
	if err := json.NewDecoder(r.Body).Decode(&updateData); err != nil {
		http.Error(w, "Invalid Body", http.StatusBadRequest)
		return
	}

	supplier.Name = updateData.Name
	supplier.Notes = updateData.Notes
	supplier.Contacts = updateData.Contacts
	supplier.MappingConfig = updateData.MappingConfig
	// DetectedBrands is usually read-only or system updated, but allowing update here for simplicity

	db.DB.Save(&supplier)
	json.NewEncoder(w).Encode(supplier)
}

// PreviewExcelHandler - Returns top 10 rows for mapping wizard
func PreviewExcelHandler(w http.ResponseWriter, r *http.Request) {
	file, _, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "Invalid file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Use Excelize to read stream or file
	f, err := excelize.OpenReader(file)
	if err != nil {
		http.Error(w, "Failed to read Excel", http.StatusBadRequest)
		return
	}
	defer f.Close()

	// Get first sheet
	sheetName := f.GetSheetName(0)
	rows, err := f.GetRows(sheetName)
	if err != nil {
		http.Error(w, "Failed to get rows", http.StatusInternalServerError)
		return
	}

	// Return top 15
	limit := 15
	if len(rows) < limit {
		limit = len(rows)
	}

	result := rows[:limit]
	if result == nil {
		result = [][]string{}
	}

	json.NewEncoder(w).Encode(result)
}

// CatalogUploadHandler - Process Supplier Catalog (Excel/CSV)
func CatalogUploadHandler(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")

	// Validate ID is numeric
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid Supplier ID (must be numeric)", http.StatusBadRequest)
		return
	}

	// Fetch Supplier
	var supplier models.Supplier
	if err := db.DB.First(&supplier, uint(id)).Error; err != nil {
		http.Error(w, "Supplier not found", http.StatusNotFound)
		return
	}

	// Parse File
	file, _, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "Invalid file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Open Excel
	f, err := excelize.OpenReader(file)
	if err != nil {
		http.Error(w, "Failed to read Excel", http.StatusBadRequest)
		return
	}
	defer f.Close()

	// Read Mapping
	var mapping models.MappingConfig
	if len(supplier.MappingConfig) > 0 {
		if err := json.Unmarshal(supplier.MappingConfig, &mapping); err != nil {
			http.Error(w, "Invalid Mapping Config", http.StatusInternalServerError)
			return
		}
	} else {
		// Fallback Defaults
		mapping = models.MappingConfig{HeaderRow: 0, ColSKU: 0, ColQty: 1, ColPrice: 2, ColBrand: 3}
	}

	rows, err := f.GetRows(f.GetSheetName(0))
	if err != nil {
		http.Error(w, "Failed to get rows", http.StatusInternalServerError)
		return
	}

	var products []models.Product
	productMap := make(map[string]models.Product)
	brandSet := make(map[string]struct{})

	// Load existing brands
	var existingBrands []string
	if len(supplier.DetectedBrands) > 0 {
		json.Unmarshal(supplier.DetectedBrands, &existingBrands)
		for _, b := range existingBrands {
			brandSet[b] = struct{}{}
		}
	}

	startRow := mapping.HeaderRow + 1

	// Find the maximum index we need to access
	maxCols := mapping.ColSKU
	if mapping.ColTitle > maxCols {
		maxCols = mapping.ColTitle
	}
	if mapping.ColPrice > maxCols {
		maxCols = mapping.ColPrice
	}
	if mapping.ColBrand > maxCols {
		maxCols = mapping.ColBrand
	}
	if mapping.ColBarcode > maxCols {
		maxCols = mapping.ColBarcode
	}
	// mapping.ColQty is ignored now, so we don't strictly need it to be padded

	for i := startRow; i < len(rows); i++ {
		row := rows[i]

		// Pad row if Excel truncated empty trailing columns
		for len(row) <= maxCols {
			row = append(row, "")
		}

		if mapping.ColSKU >= len(row) {
			continue
		}

		sku := strings.TrimSpace(row[mapping.ColSKU])
		if sku == "" {
			continue
		}

		// Parse Price
		price := 0.0
		if mapping.ColPrice < len(row) {
			pStr := strings.ReplaceAll(row[mapping.ColPrice], "$", "")
			pStr = strings.ReplaceAll(pStr, ",", "")
			if val, err := strconv.ParseFloat(strings.TrimSpace(pStr), 64); err == nil {
				price = val
			}
		}

		// Qty is no longer parsed here; SOH is managed by Purchase Orders.

		// Brand
		brand := ""
		if mapping.ColBrand < len(row) {
			brand = strings.TrimSpace(row[mapping.ColBrand])
			if brand != "" {
				brandSet[brand] = struct{}{}
			}
		}

		// Barcode
		barcode := ""
		if mapping.ColBarcode > 0 && mapping.ColBarcode < len(row) {
			rawBarcode := strings.TrimSpace(row[mapping.ColBarcode])
			// If excel treats large numbers as scientific notation or floats:
			if fVal, err := strconv.ParseFloat(rawBarcode, 64); err == nil && strings.Contains(rawBarcode, "E") {
				// Format large sci-notation to full integer string
				barcode = strconv.FormatFloat(fVal, 'f', 0, 64)
			} else {
				barcode = rawBarcode
			}
		}

		// Title
		title := "Imported " + sku
		if mapping.ColTitle >= 0 && mapping.ColTitle < len(row) {
			titleVal := strings.TrimSpace(row[mapping.ColTitle])
			if titleVal != "" {
				title = titleVal
			}
		}

		productMap[sku] = models.Product{
			SKU:         sku,
			Barcode:     barcode,
			SupplierID:  &supplier.ID,
			Title:       title,
			Description: "", // No mapping yet
			Brand:       brand,
			Price:       price,
			StockOnHand: 0,                    // SOH should only be filled by Purchase Orders
			Status:      models.StatusPending, // PENDING_IMAGE
		}
	}

	for _, p := range productMap {
		products = append(products, p)
	}

	if len(products) > 0 {
		// Bulk UPSERT
		// Update: Title, Description, Brand, Price.
		// Ignore: Status, ImagePath, StockOnHand (preserve existing stock from Purchase Orders)
		err := db.DB.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "sku"}},
			DoUpdates: clause.AssignmentColumns([]string{"barcode", "title", "brand", "price", "updated_at"}),
		}).Create(&products).Error

		if err != nil {
			log.Printf("Bulk Upsert Error: %v", err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"error": "Database Error: " + err.Error(),
			})
			return
		}
	}

	// Update Detected Brands
	var newBrands []string
	for b := range brandSet {
		newBrands = append(newBrands, b)
	}
	brandsJSON, _ := json.Marshal(newBrands)
	db.DB.Model(&supplier).Update("detected_brands", brandsJSON)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"count":  len(products),
		"brands": len(newBrands),
	})
}
