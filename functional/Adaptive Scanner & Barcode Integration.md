### Prompt: Adaptive Scanner & Barcode Integration

**Role:** Senior Full-Stack Architect.

**Mission:**

1. Integrate **Barcode** data from Excel into the Product Database.
2. Make the Scanner View (`/scanner`) adaptive: **Desktop shows QR** / **Mobile shows Camera**.
3. Enable **Search by Barcode** in the backend.

**CRITICAL CONSTRAINT:** **Do NOT assume file paths or filenames.** You must scan the codebase to locate the components (Models, Handlers, Views) before modifying them.

---

### Phase 1: Data Layer (The Barcode)

* **Target:** Database Models (Go) & Supplier Mapping Logic.
* **Action:**
1. **Model Upgrade:** Find the `Product` struct. Add a field `Barcode` (string, unique index).
2. **Mapping Upgrade:** Find the `Supplier` struct and its `MappingConfig` JSON definition. Add a field `col_barcode` (int) to the configuration.
3. **Parser Upgrade:** Find the Excel Ingestion logic (Worker or Backend). Update it to read the column specified in `col_barcode` and save it to `Product.Barcode`.



### Phase 2: Search Logic (The Lookup)

* **Target:** The Scan/Search Handler (Backend).
* **Action:**
* Modify the product lookup query.
* **Logic:** `SELECT * FROM products WHERE sku = ? OR barcode = ?`.
* *Reason:* The physical product has a barcode, but the system internal logic uses SKU. We need to match either.



### Phase 3: Adaptive Frontend (The UI)

* **Target:** The Scanner View Component (`/scanner`).
* **Action:**
1. **Device Detection:** Implement a check (e.g., check `navigator.userAgent` or window width) to determine if the user is on **Desktop** or **Mobile**.
2. **State A (Desktop):**
* Render a **QR Code** (using `react-qr-code`).
* The QR must encode the **Local IP Address** of the machine (if detectable) or the current `window.location.href`.
* Show text: "Scan this with your phone to start working."


3. **State B (Mobile):**
* Render the operational tools.
* **Tool 1 (Barcode Scanner):** Integrate `html5-qrcode`. When a code is detected, auto-submit to the Scan API.
* **Tool 2 (Photo Capture):** Add a button "Take Product Photo" that triggers the native camera file input (`capture="environment"`).
* **Tool 3 (Manual):** Keep the manual text input as a fallback.





**Execution:**
Apply these changes to the discovered files. Ensure the "Barcode" column is treated as optional during ingest (some products might not have one).

