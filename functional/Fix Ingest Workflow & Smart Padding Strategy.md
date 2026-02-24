### Prompt: Adaptive UI/UX & Detection Upgrade

**Role:** Senior Full-Stack Architect & Refactoring Expert.

**Mission:**
We need to upgrade the current "Ingest & Crop" workflow to fix tight cropping issues and add manual correction tools.
**CRITICAL CONSTRAINT:** Do NOT assume file paths or directory names. **You must discover the existing structure first.**

**Phase 1: Reconnaissance & Analysis**

1. **Scan the file tree:** Identify the root directories for the Go Backend, Python Worker, and React Frontend.
2. **Locate the key files:**
* Find the **Python script** responsible for PDF processing/YOLO detection.
* Find the **Go file** defining the HTTP handlers/routes.
* Find the **React Component** responsible for rendering the "Ingest/Draft" image grid.
* Find the **Docker configuration** files.



**Phase 2: Execution (Apply logic to the discovered files)**

**A. Worker Service (The "Smart Crop" Logic)**

* *Target:* The Python processing script identified in Phase 1.
* **Action 1 (Padding):** Modify the cropping logic. Instead of a tight YOLO box, apply **Anisotropic Padding** (Add ~5% top/sides, but **~20% bottom**).
* *Reason:* Capturing product names usually located below the item.


* **Action 2 (Persistence):** Ensure the **Full Original Page** (converted from PDF) is saved to the shared volume, not just the crops.
* **Action 3 (OCR):** Integrate `pytesseract`. Run it on the padded crop to attempt text extraction (SKU/Name) and add it to the JSON output.
* *Target:* The Worker's Dockerfile.
* **Action:** Ensure system dependencies for Tesseract are installed.

**B. Backend Service (The "Data" Logic)**

* *Target:* The Go Handlers file identified in Phase 1.
* **Action 1 (Static Serving):** Ensure the HTTP server exposes the directory containing the processed **Full Pages** so the frontend can load them.
* **Action 2 (New Endpoints):**
* `DELETE`: Remove item logic.
* `UPDATE`: Approve logic.
* `RECROP`: Create a handler that accepts `{x, y, w, h}` and the `page_image_path`. It must open the full page, apply the new crop, and overwrite the product image.



**C. Frontend Service (The "User" Logic)**

* *Target:* The React Grid Component identified in Phase 1.
* **Action 1 (Visuals):** CSS adjustment. Ensure images use `object-fit: contain` (or equivalent Tailwind class) so the full product is visible inside the card.
* **Action 2 (Manual Crop Tool):**
* Create a **New Modal Component** (placed in a logical "components" directory found during recon).
* This modal must load the **Full Page Image**.
* Implement a library like `react-image-crop` to allow the user to draw a correction box.
* On save, call the Backend's `RECROP` endpoint.


* **Action 3 (Toolbar):** Add buttons to the grid items: [Delete], [Edit/Crop], [Approve].

**Instruction:**
Proceed with the implementation by modifying the *existing* files you find. Do not create duplicate structures.
