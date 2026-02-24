**Role:** Senior Full-Stack & Computer Vision Engineer.

**Context:**
The infrastructure for "The Backroom" is fully deployed (Docker: `backend`, `worker`, `frontend`, `db`). Services are currently running generic stubs. We need to implement the real logic.

**Task:** Implement the code for the following 3 critical modules.

---

### Module A: Worker Upgrade (Hybrid Detection Strategy)

**File:** `worker/processor.py` & `worker/requirements.txt`

**Goal:** Extract unique product images from PDF catalogs using a combination of AI (YOLO) and Heuristics (OpenCV).

**Requirements:**

1. **Dependencies:** Add `ultralytics`, `opencv-python-headless`, `numpy`, `pdf2image`, `requests` to `requirements.txt`.
2. **Class `HybridDetector`:**
* **Normalization (CRITICAL):** Ensure all detection methods return boxes in the standard format `[x1, y1, x2, y2]` (pixels) before merging. YOLO often returns `[cx, cy, w, h]` normalized; convert it.
* `detect_yolo(image)`: Load `yolov8n.pt`. Threshold > 0.4. Return list of boxes.
* `detect_opencv(image)`: Grayscale -> GaussianBlur -> Canny -> Dilate -> Find Contours. Filter out noise (area < 500px). Return list of boxes.


3. **Merge Logic (`merge_boxes`):**
* Input: `yolo_boxes`, `cv_boxes`.
* Iterate `cv_boxes` against `yolo_boxes`.
* Calculate **IoU (Intersection over Union)**.
* **Rule:** If `IoU > 0.3`, assume YOLO saw it (discard CV box).
* **Rule:** If `IoU <= 0.3`, assume YOLO missed it (keep CV box).
* Return: Combined unique list.


4. **Main Pipeline (`process_pdf`):**
* Iterate through PDF pages using `pdf2image`.
* Run hybrid detection on each page.
* Crop images and save to `/shared_data/processed/images/{uuid}.jpg`.
* **Output:** Generate a `manifest.json` in `/shared_data/processed/` with the following schema:
```json
[
  { "uuid": "...", "file_path": "...", "source_page": 1, "detection_method": "yolo|opencv" }
]

```





---

### Module B: Backend Integration (Ingest & Orders)

**File:** `backend/internal/handlers/ingest.go` & `backend/internal/handlers/orders.go`

**Goal:** Digest the Worker's result and handle Order creation.

**Requirements:**

1. **Structs:** Define the Go struct matching the `manifest.json` schema above.
2. **Handler `ProcessManifestHandler`:**
* Read `/shared_data/processed/manifest.json`.
* Iterate and create records in the `products` table (GORM).
* Set initial status: `'DRAFT'`.
* Set `stock_on_hand: 0`.


3. **Handler `CreateOrderHandler`:**
* Accept JSON payload: `{"supplier": "string", "items": [{"sku": "string", "qty": int}]}`.
* Start a DB Transaction.
* Create `PurchaseOrder`.
* Create associated `POItems`.
* Return 201 Created or 500 Error (with rollback).



---

### Module C: Frontend Wiring

**File:** `frontend/src/components/inventory/NewOrderForm.tsx`

**Goal:** Connect the UI to the API.

**Requirements:**

1. **State Management:** Create a typed interface for the Order payload.
2. **API Call:**
* On Form Submit, execute `fetch('/api/orders', ...)` (POST).
* Use `try/catch` block.
* **On Success:** Show a toast/alert and reset the form.
* **On Error:** Display the error message from the backend.



---