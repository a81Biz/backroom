### Prompt: Excel-First Architecture (Upsert & Targeted Extraction)

**Role:** Senior Backend & Data Architect.

**Mission:** Refactor the ingestion workflow to follow a strict **"Data-First, Image-Second"** logic with **Idempotent Data Ingestion**.
**CRITICAL CONSTRAINT:** Do NOT assume file paths. Discover the structure first.

---

### Phase 1: Discovery

1. **Scan the Codebase:** Locate Supplier Handlers, Ingest Handlers, Worker Script, and GORM Models.

---

### Phase 2: Implementation - Step-by-Step

#### Step A: Robust Data Ingestion (The Foundation)

* **Target:** Backend Supplier Handler & Excel Parser.
* **Logic:**
1. **Endpoint:** `POST /api/suppliers/{id}/catalog`. Receives File + Mapping Config.
2. **Parser:** Read Excel/CSV using the mapping (Row X, Col Y).
3. **Database Operation (CRITICAL):** Perform a Bulk **UPSERT** based on `SKU`.
* **Key:** `SKU` + `SupplierID`.
* **On Conflict (Exists):** Update `Name`, `Description`, `Price`, `Brand`. **DO NOT** overwrite `Status` or `ImagePath` if they already exist (preserve previous work).
* **On New:** Insert with `Status = 'PENDING_IMAGE'` and `ImagePath = null`.


4. **Brand Extraction:** Collect all unique brands from the file and append new ones to the Supplier's `DetectedBrands` list.



#### Step B: Targeted PDF Ingestion (The Sniper)

* **Target:** Frontend Ingest View & Backend Ingest Handler.
* **Workflow:**
1. User selects Supplier -> **Frontend** checks API: "Does this supplier have products?"
2. If Yes: Allow PDF Upload.
3. **Backend Action:** When PDF is uploaded, fetch **ALL SKUs** for that Supplier from the DB.
4. **Worker Payload:** Send `pdf_path` AND the list of `TargetSKUs` to the Python Worker.



#### Step C: Worker Logic (Text-Image Matching)

* **Target:** Python Processor.
* **Logic Refactor:**
1. **Text Layer:** Use `pymupdf` to find coordinates of all words in the PDF.
2. **Object Layer:** Use YOLO to find all object boxes.
3. **The Match:**
* Loop through `TargetSKUs`.
* Locate SKU text on page.
* Find the **nearest** YOLO box to that text.
* **Smart Crop:** Apply vertical padding (to catch labels). Save as `{sku}.jpg`.


4. **Manifest:** Return a map of `SKU -> ImagePath` and list of `MissingSKUs`.



#### Step D: The "VoBo" Interface (Frontend)

* **Target:** Ingest Studio Grid.
* **UI Logic:**
* **Group 1 (Found):** Show the matched image. User can [Approve] or [Edit/Crop].
* **Group 2 (Missing):** List SKUs not found in PDF.
* **Manual Crop Tool (CRITICAL):**
* Allow user to click **ANY** product (Found or Missing).
* Open Modal with **Full Original Page**.
* User draws box manually -> Saves -> Updates Product Image.





---

**Execution:**
Generate the code changes to implement this workflow, ensuring the **SKU UPSERT** logic is robust in Go (GORM).
