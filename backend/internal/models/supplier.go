package models

import (
	"database/sql/driver"
	"errors"
	"time"

	"gorm.io/gorm"
)

// JSONB is a wrapper for JSONB fields in Postgres
type JSONB []byte

func (j JSONB) Value() (driver.Value, error) {
	if len(j) == 0 {
		return nil, nil
	}
	return string(j), nil
}

func (j *JSONB) Scan(value interface{}) error {
	if value == nil {
		*j = nil
		return nil
	}
	s, ok := value.([]byte)
	if !ok {
		return errors.New("invalid scan source for JSONB")
	}
	*j = append((*j)[0:0], s...)
	return nil
}

// MarshalJSON returns *j as the JSON encoding of j.
func (j JSONB) MarshalJSON() ([]byte, error) {
	if j == nil {
		return []byte("null"), nil
	}
	return j, nil
}

// UnmarshalJSON sets *j to a copy of data.
func (j *JSONB) UnmarshalJSON(data []byte) error {
	if j == nil {
		return errors.New("json.RawMessage: UnmarshalJSON on nil pointer")
	}
	*j = append((*j)[0:0], data...)
	return nil
}

// Supplier Struct
type Supplier struct {
	ID             uint           `gorm:"primarykey" json:"id"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
	Name           string         `json:"name"`
	Notes          string         `json:"notes"`
	Contacts       JSONB          `gorm:"type:jsonb" json:"contacts"`        // Array of contact objects
	MappingConfig  JSONB          `gorm:"type:jsonb" json:"mapping_config"`  // Excel parsing rules
	DetectedBrands JSONB          `gorm:"type:jsonb" json:"detected_brands"` // List of brands
}

// Helper structs for JSON decoding/encoding (not stored directly)
type Contact struct {
	Type  string `json:"type"` // EMAIL | PHONE
	Label string `json:"label"`
	Value string `json:"value"`
}

type MappingConfig struct {
	HeaderRow  int `json:"header_row"`
	ColSKU     int `json:"col_sku"`
	ColTitle   int `json:"col_title"`
	ColBarcode int `json:"col_barcode"`
	ColQty     int `json:"col_qty"`
	ColPrice   int `json:"col_price"`
	ColBrand   int `json:"col_brand"`
}
