### Prompt: Inventory Logic Separation & UI Sorting (Blind Architecture)

**Role:** Senior Full-Stack Architect.

**Mission:**
Refactor the Inventory and Purchasing logic to separate "Transaction History" from "Live Stock", and enhance the Frontend Table UI.
**CRITICAL CONSTRAINT:** **Do NOT assume file paths or filenames.** You must scan the codebase to locate the relevant components before modifying them.

---

### Phase 1: Architectural Discovery

1. **Scan for Data Models:** Find the Go file(s) defining the structs for `Product`, `PurchaseOrder`, and `PurchaseOrderItem` (or equivalent names).
2. **Scan for Logic:** Find the Go HTTP Handler responsible for processing "Scans" or "Receiving Items".
3. **Scan for UI:** Find the React Component responsible for rendering the **Inventory/Order Table**.

---

### Phase 2: Implementation (Apply to Discovered Files)

#### Step A: Database Model Refactor (The Separation)

* **Target:** The Database Structs found in Phase 1.
* **Action on `PurchaseOrder` Entity:**
* Add a field for `Status` (e.g., Enum: Draft, Receiving, Completed).


* **Action on `PurchaseOrderItem` Entity (The History):**
* Ensure it has `QtyOrdered` (Total requested from Excel).
* Add/Ensure `QtyReceived` (Total scanned/arrived so far).
* Add `Status` (Calculated: Pending, Partial, Completed, Overfilled).
* *Concept:* This table records **what happened in that specific order**, not what is in the warehouse today.


* **Action on `Product` Entity (The Live Stock):**
* Add/Ensure a field `StockOnHand` (Integer). This is the "Live" counter available for sale.



#### Step B: Scanner/Receiving Logic (The Dual Update)

* **Target:** The Scan Handler found in Phase 1.
* **Logic Upgrade:** When an item is scanned/received via API:
1. **Update History:** Increment `QtyReceived` in the `PurchaseOrderItem` record (linked to the specific PO).
2. **Update Live Stock:** Increment `StockOnHand` in the `Product` record (Global inventory).
3. **Status Calculation:**
* If `QtyReceived` < `QtyOrdered` -> Set Item Status to 'PARTIAL'.
* If `QtyReceived` == `QtyOrdered` -> Set Item Status to 'COMPLETED'.





#### Step C: Frontend Table Enhancements

* **Target:** The Inventory Table Component found in Phase 1.
* **Feature 1: Column Sorting:**
* Implement clickable headers for **Product Name**, **SKU**, **Qty Ordered**, and **Status**.
* Clicking once sorts Ascending (A-Z / 0-9).
* Clicking again sorts Descending.


* **Feature 2: Progress Visualization:**
* In the "Quantity" column, show `Received / Ordered` (e.g., "5/10").
* Apply visual cues:
* **Yellow:** Pending (0/10).
* **Blue:** Partial (5/10).
* **Green:** Completed (10/10).
* **Red:** Overfilled (11/10).





---

**Execution:**
Apply these changes to the existing files found during discovery. Do not create duplicates.

