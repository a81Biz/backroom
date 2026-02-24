**Role:** You are a Senior Principal Software Architect and Full-Stack Developer specialized in Microservices, Go, Python, and React.

**Context & Mission:**
We are building "The Backroom", a PIM/WMS middleware. You have three critical source files that define the absolute truth of this project. You must read and analyze them before generating any code:

1. **Architecture & Stack:** Read `docs/Documento de Especificaciones Técnicas.md` (The TSD). This defines the strict tech stack (Go/Chi, Python/OpenCV, React/Vite, Postgres).
2. **Business Logic:** Read `docs/Documento de Especificación de Negocio.md` (The BRD). This defines *how* the data flows and the rules for inventory.
3. **UI/UX Reference:** Read `functional/code.html`. This is the visual prototype.

**Task:**
Generate the scaffolding and initial implementation of the application. The output must be a modular, production-ready structure. Do not output a single file. Break down the code into the correct directory structure defined in the TSD.

---

### Step 1: Infrastructure (The Foundation)

Create the `docker-compose.yml` and the 3 specific `Dockerfiles` (Backend, Worker, Frontend) exactly as described in the TSD.

* **Constraint:** Ensure the `shared_data` volume is correctly mounted for both Go (API) and Python (Worker).
* **Constraint:** Configure `nginx.conf` for the frontend container to handle React Router history mode (fallback to index.html).

### Step 2: Backend - Go (The Core)

Initialize the Go module in `/backend`.

* **Structure:** Use standard Go layout: `/cmd/server`, `/internal/models`, `/internal/handlers`, `/internal/db`.
* **Database:** Setup GORM with the schema defined in the TSD (`products`, `purchase_orders`, `po_items`).
* **API:** Implement the skeleton handlers for the routes defined in the TSD using `go-chi`.
* **Correction:** Ensure CORS is configured to allow requests from the Frontend container.

### Step 3: Worker - Python (The Miner)

Create the `/worker` directory.

* **Logic:** Create `processor.py` that uses `watchdog` to listen to the `/shared_data/raw` folder.
* **Stub:** Implement a placeholder function `process_pdf(file_path)` that logs "Processing started..." (We will fill the detailed OpenCV logic in the next iteration, just set up the architecture now).

### Step 4: Frontend - React (The Interface)

Initialize a Vite + React + TypeScript project in `/frontend`.

* **Refactoring Directive:** deeply analyze `functional/code.html`. **DO NOT COPY IT AS IS.**
* Break the HTML down into reusable React components in `/src/components` (e.g., `NavHeader`, `IngestGrid`, `OrderTable`, `MobileScanner`).
* Use **Tailwind CSS** exactly as used in the HTML (copy the classes).
* **State Management:** Replace static HTML content with React State/Context hooks to prepare for API integration.


* **Blind Spot Fixes (Critical):**
1. **Ingest Studio:** Add a "Manual Crop" modal stub (UI only for now) to the component.
2. **Inventory:** Create a `NewOrderForm.tsx` component (not present in HTML) to create POs.
3. **Mobile:** Add an input field for "Manual SKU Entry" below the scanner view.



**Execution Rules:**

1. **DRY (Don't Repeat Yourself):** If a UI pattern appears twice in the HTML, make it a component.
2. **Language:** Code comments and variables in **English**. UI Text (what the user sees) in **Spanish** (Translate the English UI from `code.html` to Spanish to match the Business Documents).
3. **Output:** Provide the file tree and the code for the critical files.

---