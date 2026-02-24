package handlers

import (
	"backroom/internal/db"
	"backroom/internal/models"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"
)

// GetOrdersHandler returns all Purchase Orders
func GetOrdersHandler(w http.ResponseWriter, r *http.Request) {
	var orders []models.PurchaseOrder
	// Preload Items and their associated Products for the itemized modal
	db.DB.Preload("Items.Product").Preload("Items").Order("created_at desc").Find(&orders)
	json.NewEncoder(w).Encode(orders)
}

// CreateOrderHandler processes an uploaded Excel file to create a Purchase Order
func CreateOrderHandler(w http.ResponseWriter, r *http.Request) {
	// 1. Parse File & Supplier
	err := r.ParseMultipartForm(10 << 20) // 10MB
	if err != nil {
		http.Error(w, "File too big", http.StatusBadRequest)
		return
	}

	supplierID := r.FormValue("supplier_id")
	if supplierID == "" {
		http.Error(w, "Supplier ID required", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "Invalid file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Get Supplier & Mapping
	var supplier models.Supplier
	if err := db.DB.First(&supplier, "id = ?", supplierID).Error; err != nil {
		http.Error(w, "Supplier not found", http.StatusNotFound)
		return
	}

	var mapping models.MappingConfig
	if len(supplier.MappingConfig) > 0 {
		if err := json.Unmarshal(supplier.MappingConfig, &mapping); err != nil {
			http.Error(w, "Invalid Mapping Config in Supplier", http.StatusInternalServerError)
			return
		}
	} else {
		http.Error(w, "Supplier has no template/mapping defined. Please configure supplier first.", http.StatusBadRequest)
		return
	}

	// 2. Open Excel
	f, err := excelize.OpenReader(file)
	if err != nil {
		http.Error(w, "Failed to read Excel", http.StatusBadRequest)
		return
	}
	defer f.Close()

	// 3. Parse Rows
	rows, err := f.GetRows(f.GetSheetName(0))
	if err != nil {
		http.Error(w, "Failed to get rows", http.StatusInternalServerError)
		return
	}

	// 4. Create PO using Mapping
	var items []models.POItem
	var missingSKUs []string
	var foundSKUs []string

	startRow := mapping.HeaderRow + 1

	for i := startRow; i < len(rows); i++ {
		row := rows[i]

		// Bounds Check
		if mapping.ColSKU >= len(row) {
			continue
		}

		sku := strings.TrimSpace(row[mapping.ColSKU])
		if sku == "" {
			continue
		}

		// Get Qty
		qty := 0
		if mapping.ColQty < len(row) {
			val := strings.TrimSpace(row[mapping.ColQty])
			if val != "" {
				if q, err := strconv.Atoi(val); err == nil {
					qty = q
				} else {
					if fVal, err := strconv.ParseFloat(val, 64); err == nil {
						qty = int(fVal)
					}
				}
			}
		}

		// FILTER: Strictly > 0
		if qty <= 0 {
			continue
		}

		// Calculate Status immediately
		status := models.POItemStatusPending

		// Extract Barcode
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

		// Extract Title
		title := "Imported " + sku
		if mapping.ColTitle >= 0 && mapping.ColTitle < len(row) {
			titleVal := strings.TrimSpace(row[mapping.ColTitle])
			if titleVal != "" {
				title = titleVal
			}
		}

		// Verify Product
		var product models.Product
		if err := db.DB.Where("sku = ?", sku).First(&product).Error; err != nil {
			missingSKUs = append(missingSKUs, sku)
			// Create placeholder tied to supplier?
			newProduct := models.Product{
				SKU:        sku,
				Barcode:    barcode,
				Title:      title,
				SupplierID: &supplier.ID,
				Status:     models.StatusDraft,
			}
			db.DB.Create(&newProduct)
			foundSKUs = append(foundSKUs, sku+" (created)")
		} else {
			// Update the barcode if the existing product doesn't have it
			if product.Barcode == "" && barcode != "" {
				product.Barcode = barcode
				db.DB.Save(&product)
			}
			foundSKUs = append(foundSKUs, sku)
		}

		items = append(items, models.POItem{
			SKU:         sku,
			QtyOrdered:  qty,
			QtyReceived: 0,
			Status:      status,
		})
	}

	if len(items) == 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": fmt.Sprintf("No valid items found using Supplier Mapping (Head:%d, SKU:%d, Qty:%d).", mapping.HeaderRow, mapping.ColSKU, mapping.ColQty),
		})
		return
	}

	// 5. Handle Duplicate File and Overwrite Logic
	overwriteReq := r.FormValue("overwrite") == "true"
	var existingPO models.PurchaseOrder

	err = db.DB.Preload("Items").Where("supplier_name = ? AND file_name = ?", supplier.Name, header.Filename).First(&existingPO).Error

	if err == nil {
		// Found a duplicate PO file name
		if !overwriteReq {
			// Reject with 409 Conflict if overwrite is not explicitly requested
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusConflict) // 409 Conflict
			json.NewEncoder(w).Encode(map[string]interface{}{
				"duplicate": true,
				"message":   "A Purchase Order from this file already exists.",
			})
			return
		} else {
			// Overwrite requested.
			// 1. Map existing received quantities by SKU to preserve them.
			receivedMap := make(map[string]int)
			for _, oldItem := range existingPO.Items {
				if oldItem.QtyReceived > 0 {
					receivedMap[oldItem.SKU] = oldItem.QtyReceived
				}
			}

			// 2. Delete old items
			db.DB.Where("po_id = ?", existingPO.ID).Delete(&models.POItem{})

			// 3. Restore received quantities to the new items array
			for idx, newItem := range items {
				if recQty, exists := receivedMap[newItem.SKU]; exists {
					items[idx].QtyReceived = recQty
					// Update status if it's fully or partially received
					if recQty >= newItem.QtyOrdered {
						items[idx].Status = models.POItemStatusCompleted
					} else if recQty > 0 {
						items[idx].Status = models.POItemStatusPartial
					}
				}
			}

			// 4. Update the existing PO with the new items
			existingPO.Items = items
			existingPO.UpdatedAt = time.Now()

			if err := db.DB.Save(&existingPO).Error; err != nil {
				http.Error(w, "Failed to update PO: "+err.Error(), http.StatusInternalServerError)
				return
			}

			// Return Summary
			json.NewEncoder(w).Encode(map[string]interface{}{
				"po_id":           existingPO.ID,
				"items_count":     len(items),
				"found_skus":      len(foundSKUs),
				"found_skus_list": foundSKUs,
				"missing_skus":    missingSKUs,
				"action":          "updated",
			})
			return
		}
	}

	// Create New PO (No duplicate found)
	po := models.PurchaseOrder{
		SupplierName: supplier.Name,
		FileName:     header.Filename,
		Status:       models.POStatusPending,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
		Items:        items,
	}

	if err := db.DB.Create(&po).Error; err != nil {
		http.Error(w, "Failed to create PO: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Return Summary
	json.NewEncoder(w).Encode(map[string]interface{}{
		"po_id":           po.ID,
		"items_count":     len(items),
		"found_skus":      len(foundSKUs),
		"found_skus_list": foundSKUs, // Added for debug
		"missing_skus":    missingSKUs,
		"action":          "created",
	})
}

// GetInventoryHandler returns products with calculated stock stats
func GetInventoryHandler(w http.ResponseWriter, r *http.Request) {
	type InventoryItem struct {
		models.Product
		QtyOrderedTotal  int `json:"qty_ordered_total"`
		QtyReceivedTotal int `json:"qty_received_total"`
	}

	var results []InventoryItem

	// Calculate totals for active POs (Pending or In Transit)
	// We want to know:
	// 1. How many are on order total?
	// 2. How many have we received against those orders?
	query := `
        SELECT p.*, 
        COALESCE(SUM(
            CASE WHEN po.status IN ('PENDING', 'IN_TRANSIT') 
            THEN pi.qty_ordered 
            ELSE 0 END
        ), 0) as qty_ordered_total,
        COALESCE(SUM(
            CASE WHEN po.status IN ('PENDING', 'IN_TRANSIT') 
            THEN pi.qty_received 
            ELSE 0 END
        ), 0) as qty_received_total
        FROM products p
        LEFT JOIN po_items pi ON p.sku = pi.sku
        LEFT JOIN purchase_orders po ON pi.po_id = po.id
        GROUP BY p.id
    `

	if err := db.DB.Raw(query).Scan(&results).Error; err != nil {
		http.Error(w, "DB Error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(results)
}
