package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Enums
type ProductStatus string

const (
	StatusDraft     ProductStatus = "DRAFT"
	StatusPending   ProductStatus = "PENDING_IMAGE" // Created via Excel, waiting for PDF match
	StatusPublished ProductStatus = "PUBLISHED"
	StatusArchived  ProductStatus = "ARCHIVED"
)

type POStatus string

const (
	POStatusPending   POStatus = "PENDING"
	POStatusInTransit POStatus = "IN_TRANSIT"
	POStatusReceived  POStatus = "RECEIVED"
)

// Product Table
type Product struct {
	ID                  uuid.UUID     `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	SKU                 string        `gorm:"uniqueIndex;not null" json:"sku"`
	Barcode             string        `gorm:"index" json:"barcode"`                            // Scannable code
	SupplierID          *uint         `json:"supplier_id" gorm:"index"`                        // Link to Supplier
	Supplier            *Supplier     `json:"supplier,omitempty" gorm:"foreignKey:SupplierID"` // Relation
	WooID               *int          `json:"woo_id"`                                          // Nullable
	StockOnHand         int           `gorm:"default:0" json:"stock_on_hand"`
	StockReserved       int           `gorm:"default:0" json:"stock_reserved"`
	ImagePath           string        `json:"image_path"`
	Status              ProductStatus `gorm:"type:varchar(20);default:'DRAFT'" json:"status"`
	Title               string        `json:"title"`
	Description         string        `json:"description"` // New
	Brand               string        `json:"brand"`       // New
	Price               float64       `json:"price"`
	CreatedAt           time.Time     `json:"created_at"`
	UpdatedAt           time.Time     `json:"updated_at"`
	SourcePageImagePath string        `json:"source_page_image_path"` // Path to full page for re-cropping
	SourcePageDims      string        `json:"source_page_dims"`       // JSON [w, h]
	ImageRect           string        `json:"image_rect"`             // JSON [x, y, w, h]
}

// PurchaseOrder Table
type PurchaseOrder struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	SupplierName string    `json:"supplier_name"`
	FileName     string    `json:"file_name"` // Added
	Status       POStatus  `gorm:"type:varchar(20);default:'PENDING'" json:"status"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
	Items        []POItem  `gorm:"foreignKey:POID" json:"items"`
}

// PO Item Status
type POItemStatus string

const (
	POItemStatusPending    POItemStatus = "PENDING"
	POItemStatusPartial    POItemStatus = "PARTIAL"
	POItemStatusCompleted  POItemStatus = "COMPLETED"
	POItemStatusOverfilled POItemStatus = "OVERFILLED"
)

// POItem Table
type POItem struct {
	ID          uint         `gorm:"primaryKey" json:"id"`
	POID        uint         `json:"po_id"`
	SKU         string       `json:"sku"`
	Product     Product      `gorm:"foreignKey:SKU;references:SKU" json:"product,omitempty"`
	QtyOrdered  int          `json:"qty_ordered"`
	QtyReceived int          `json:"qty_received"`
	Status      POItemStatus `gorm:"type:varchar(20);default:'PENDING'" json:"status"`
}

// SourceFile Table
type SourceFile struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	FileName  string    `json:"file_name"`
	FileSize  int64     `json:"file_size"`
	FilePath  string    `json:"file_path"`
	Status    string    `json:"status"` // "Uploaded", "Processed"
	CreatedAt time.Time `json:"created_at"`
}

func Migrate(db *gorm.DB) error {
	// Enable UUID extension
	db.Exec("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";")

	// Migrate tables in order to avoid dependency issues
	if err := db.AutoMigrate(&Product{}); err != nil {
		return err
	}
	if err := db.AutoMigrate(&PurchaseOrder{}); err != nil {
		return err
	}
	if err := db.AutoMigrate(&POItem{}); err != nil {
		return err
	}
	if err := db.AutoMigrate(&SourceFile{}); err != nil {
		return err
	}
	return nil
}
