**Role:** Senior Full-Stack Architect.

**Context:**
The system infrastructure and core AI logic (Worker Hybrid Detection) are **COMPLETE**.
We now need to implement the **Supplier Relationship Management (SRM)** module and the **Deterministic Excel Parser** for Purchase Orders.

**Task:** Implement the following 3 Extension Modules on top of the existing codebase.

---

### Module 1: Robust Supplier Model (Backend)

**File:** `backend/internal/models/supplier.go` & `backend/internal/handlers/supplier.go`

**Requirements:**

1. **Model Definition (GORM):** Create the `Supplier` struct with:
* `Name` (string), `Notes` (text).
* `Contacts` (JSONB Array): `[{ type: "EMAIL"|"PHONE", label: "Sales", value: "..." }]`.
* `MappingConfig` (JSONB): Stores the Excel parsing rules:
`{ "header_row": int, "col_sku": int, "col_qty": int, "col_price": int, "col_brand": int }`.
* `DetectedBrands` (JSONB Array): `["Hasbro", "Konami"]` (Read-only, populated by system).


2. **API Handlers:**
* **CRUD:** `GET /suppliers`, `POST /suppliers`, `PUT /suppliers/{id}`.
* **Preview:** `POST /suppliers/preview-excel`: Receives a file, returns the first 10 rows (JSON array of arrays) so the Frontend can render the Mapping Wizard.



---

### Module 2: Deterministic Excel Parser (Worker)

**File:** `worker/excel_ingestor.py` & `worker/processor.py`

**Requirements:**

1. **Dependencies:** Ensure `pandas` and `openpyxl` are installed.
2. **Class `ExcelIngestor`:**
* Method `process(file_path, mapping_config)`:
* Load Excel/CSV.
* **Skip rows** until `mapping_config.header_row`.
* **Select columns** by index defined in `mapping_config`.
* **Extract:** SKU, Quantity, Price, and **Brand** (if mapped).
* **Return:** List of standardized items + List of unique Brands found.




3. **Integration in `processor.py`:**
* Update the main loop. If the file is `.xlsx/.csv`:
* Get `supplier_id` from metadata (passed via filename or sidecar JSON).
* Fetch `MappingConfig` from DB (or receive it in payload).
* Run `ExcelIngestor`.
* **Update Supplier:** Append new found brands to `Supplier.DetectedBrands` in DB.
* Save standardized Order JSON to `/shared_data/processed/orders/{id}.json`.





---

### Module 3: Supplier Frontend (React)

**Directory:** `frontend/src/components/suppliers/`

**Requirements:**

1. **`SupplierList.tsx`:** Table showing Suppliers and their detected brands (as tags).
2. **`SupplierForm.tsx` (Robust):**
* Inputs for Name & Notes.
* **Dynamic Contacts:** "Add Row" button for Email/Phone/Label.
* **Mapping Wizard (Tab):**
* Upload "Template File".
* **Visual Grid:** Render first 10 rows. Allow user to **click a row** to set it as Header.
* **Column Mapping:** Dropdowns to map "SKU", "Qty", "Price" to the columns detected in the Header.




3. **Integration:**
* Update `InventoryManager.tsx` -> `NewOrderForm`.
* Replace generic file upload with:
1. Select Supplier (Dropdown).
2. Upload File.
3. Submit (Sends File + SupplierID to Backend).





**Execution:**
Generate the code for these specific files. Ensure the `Supplier` model uses correct PostgreSQL JSONB types for GORM.

---