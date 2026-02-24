package handlers

import (
	"backroom/internal/db"
	"backroom/internal/models"
	"encoding/json"
	"net/http"
)

// GetSyncStatusHandler returns counts of items ready to sync
func GetSyncStatusHandler(w http.ResponseWriter, r *http.Request) {
	var productCount int64
	var orderCount int64

	// Count products (e.g., status = 'Active' or similar, simplified to all for now)
	db.DB.Model(&models.Product{}).Count(&productCount)

	// Count orders (e.g., status = 'Pending')
	db.DB.Model(&models.PurchaseOrder{}).Where("status = ?", models.POStatusPending).Count(&orderCount)

	status := map[string]interface{}{
		"products_ready": productCount,
		"orders_pending": orderCount,
		"last_synced":    "Never", // TODO: Store this in DB
	}

	json.NewEncoder(w).Encode(status)
}
