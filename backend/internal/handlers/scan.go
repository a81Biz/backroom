package handlers

import (
	"backroom/internal/db"
	"backroom/internal/models"
	"encoding/json"
	"net/http"
)

// ScanItemHandler processes a scanned barcode/SKU
func ScanItemHandler(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Code        string `json:"code"`
		POID        *uint  `json:"po_id,omitempty"` // Context: Receiving against this PO
		SkipPOCheck bool   `json:"skip_po_check"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}

	if payload.Code == "" {
		http.Error(w, "Code is required", http.StatusBadRequest)
		return
	}

	var product models.Product
	// Try to find by SKU OR Barcode
	if err := db.DB.Where("sku = ? OR barcode = ?", payload.Code, payload.Code).First(&product).Error; err != nil {
		// Product not found in DB - Create it dynamically for ad-hoc receiving
		product = models.Product{
			SKU:         payload.Code,
			Barcode:     payload.Code,
			Title:       "Ad-hoc Scanned " + payload.Code, // Placeholder title
			Status:      models.StatusDraft,
			StockOnHand: 0, // Will be incremented below
		}
		if err := db.DB.Create(&product).Error; err != nil {
			http.Error(w, "Failed to dynamically create scanned product: "+err.Error(), http.StatusInternalServerError)
			return
		}
	}

	response := map[string]interface{}{
		"product": product,
		"status":  "scanned",
	}

	// Try to resolve PO Context if not provided
	if (payload.POID == nil || *payload.POID == 0) && !payload.SkipPOCheck {
		var pendingItems []models.POItem
		db.DB.Where("sku = ? AND status IN (?, ?)", product.SKU, models.POItemStatusPending, models.POItemStatusPartial).Find(&pendingItems)

		type poOption struct {
			POID         uint   `json:"po_id"`
			SupplierName string `json:"supplier_name"`
			MissingQty   int    `json:"missing_qty"`
		}
		var options []poOption

		for _, item := range pendingItems {
			var po models.PurchaseOrder
			if err := db.DB.First(&po, item.POID).Error; err == nil {
				if po.Status != models.POStatusReceived {
					options = append(options, poOption{
						POID:         po.ID,
						SupplierName: po.SupplierName,
						MissingQty:   item.QtyOrdered - item.QtyReceived,
					})
				}
			}
		}

		if len(options) > 1 {
			response["status"] = "multiple_pos"
			response["po_options"] = options
			json.NewEncoder(w).Encode(response)
			return
		} else if len(options) == 1 {
			poid := options[0].POID
			payload.POID = &poid
		}
	}

	// Logic: Receiving Mode - Update PO if applicable
	if payload.POID != nil && *payload.POID > 0 {
		var poItem models.POItem
		// Find Item in PO
		if err := db.DB.Where("po_id = ? AND sku = ?", *payload.POID, product.SKU).First(&poItem).Error; err != nil {
			response["warning"] = "Item not found in this PO"
		} else {
			// Update PO Item
			poItem.QtyReceived++

			// Recalculate Status
			if poItem.QtyReceived < poItem.QtyOrdered {
				poItem.Status = models.POItemStatusPartial
			} else if poItem.QtyReceived == poItem.QtyOrdered {
				poItem.Status = models.POItemStatusCompleted
			} else {
				poItem.Status = models.POItemStatusOverfilled
			}

			db.DB.Save(&poItem)
			response["po_item"] = poItem
		}
	}

	// Update Global Stock
	product.StockOnHand++
	db.DB.Save(&product)
	response["product"] = product
	response["status"] = "received"

	json.NewEncoder(w).Encode(response)
}
