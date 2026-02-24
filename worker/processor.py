import os
import time
import logging
import json
import uuid
import cv2
import numpy as np
import requests
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from pdf2image import convert_from_path
from ultralytics import YOLO
from excel_ingestor import ExcelIngestor
import pytesseract
import pytesseract
import re
import fitz # PyMuPDF
import math

# Configure logging
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(message)s',
                    datefmt='%Y-%m-%d %H:%M:%S')

SHARED_DIR = os.environ.get('SHARED_DIR', '/app/shared')
RAW_DIR = os.path.join(SHARED_DIR, 'raw')
PROCESSED_DIR = os.path.join(SHARED_DIR, 'processed')
IMAGES_DIR = os.path.join(PROCESSED_DIR, 'images')
PAGES_DIR = os.path.join(PROCESSED_DIR, 'pages')
ORDERS_DIR = os.path.join(PROCESSED_DIR, 'orders')

# Ensure directories exist
for d in [RAW_DIR, PROCESSED_DIR, IMAGES_DIR, PAGES_DIR, ORDERS_DIR]:
    os.makedirs(d, exist_ok=True)

# --- HYBRID DETECTOR (PDF) ---
class HybridDetector:
    def __init__(self):
        # Load YOLO model (will download on first run)
        self.yolo = YOLO('yolov8n.pt') 

    def normalize_box(self, box):
        """Standardize box to [x1, y1, x2, y2]"""
        return [int(b) for b in box]

    def detect_yolo(self, image):
        results = self.yolo(image, verbose=False)
        boxes = []
        for result in results:
            for box in result.boxes.data.tolist():
                x1, y1, x2, y2, score, class_id = box
                if score > 0.4:
                    boxes.append([int(x1), int(y1), int(x2), int(y2)])
        return boxes

    def detect_opencv(self, image):
        gray = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blurred, 50, 150)
        dilated = cv2.dilate(edges, None, iterations=2)
        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        boxes = []
        for c in contours:
            if cv2.contourArea(c) > 500: # Filter noise
                x, y, w, h = cv2.boundingRect(c)
                boxes.append([x, y, x+w, y+h])
        return boxes

    def calculate_iou(self, boxA, boxB):
        xA = max(boxA[0], boxB[0])
        yA = max(boxA[1], boxB[1])
        xB = min(boxA[2], boxB[2])
        yB = min(boxA[3], boxB[3])

        interArea = max(0, xB - xA + 1) * max(0, yB - yA + 1)
        boxAArea = (boxA[2] - boxA[0] + 1) * (boxA[3] - boxA[1] + 1)
        boxBArea = (boxB[2] - boxB[0] + 1) * (boxB[3] - boxB[1] + 1)

        iou = interArea / float(boxAArea + boxBArea - interArea)
        return iou

    def merge_boxes(self, yolo_boxes, cv_boxes):
        final_boxes = []
        # Keep all YOLO boxes
        for yb in yolo_boxes:
            final_boxes.append({'box': yb, 'method': 'yolo'})
        
        # Check OpenCV boxes
        for cb in cv_boxes:
            matched = False
            for yb in yolo_boxes:
                if self.calculate_iou(cb, yb) > 0.3:
                    matched = True
                    break
            if not matched:
                final_boxes.append({'box': cb, 'method': 'opencv'})
        
        return final_boxes

# --- PROCESSORS ---
detector = HybridDetector()
excel_parser = ExcelIngestor()

def process_pdf(file_path):
    logging.info(f"Processing PDF: {file_path}")
    try:
        filename = os.path.basename(file_path)
        
        # Check for Target SKUs Sidecar
        target_skus = []
        sidecar_path = os.path.join(RAW_DIR, f"target_skus_{filename}.json")
        if os.path.exists(sidecar_path):
            with open(sidecar_path, 'r') as f:
                data = json.load(f)
                target_skus = data.get('target_skus', [])
                logging.info(f"Targeted Extraction Mode: Searching for {len(target_skus)} SKUs")

        pages = convert_from_path(file_path)
        doc = fitz.open(file_path) # PyMuPDF for text
        
        manifest = []
        found_skus_set = set()

        for i, page in enumerate(pages):
            page_num = i + 1
            logging.info(f"Processing Page {page_num}/{len(pages)}...")
            
            # 1. Detection (Visual)
            yolo_boxes = detector.detect_yolo(page)
            # cv_boxes = detector.detect_opencv(page) # Optional: Skip OpenCV if targeted? Keeping for robustness
            # merged = detector.merge_boxes(yolo_boxes, []) # Just use YOLO for now if targeted, or hybrid?
            # Let's use hybrid for max recall
            cv_boxes = detector.detect_opencv(page)
            merged = detector.merge_boxes(yolo_boxes, cv_boxes)

            # Save Full Page
            page_id = str(uuid.uuid4())
            page_img_path = os.path.join(PAGES_DIR, f"{page_id}.jpg")
            page.save(page_img_path, 'JPEG')
            
            page_np = np.array(page)
            h, w, _ = page_np.shape
            
            # PyMuPDF Page
            pdf_page = doc.load_page(i)
            pdf_w = pdf_page.rect.width
            pdf_h = pdf_page.rect.height
            scale_x = w / pdf_w
            scale_y = h / pdf_h

            if target_skus:
                # --- TARGETED MODE ---
                for sku in target_skus:
                    # Find text occurrences
                    text_instances = pdf_page.search_for(sku)
                    for inst in text_instances:
                        # Convert to Image Coords
                        tx1 = inst.x0 * scale_x
                        ty1 = inst.y0 * scale_y
                        tx2 = inst.x1 * scale_x
                        ty2 = inst.y1 * scale_y
                        
                        t_center_x = (tx1 + tx2) / 2
                        t_center_y = (ty1 + ty2) / 2

                        # Find nearest Visual Box
                        best_box = None
                        min_dist = float('inf')
                        
                        for box_item in merged:
                            bx1, by1, bx2, by2 = box_item['box']
                            b_center_x = (bx1 + bx2) / 2
                            b_center_y = (by1 + by2) / 2
                            
                            dist = math.hypot(b_center_x - t_center_x, b_center_y - t_center_y)
                            if dist < min_dist:
                                min_dist = dist
                                best_box = box_item

                        if best_box and min_dist < (h * 0.2): # Threshold: must be reasonably close (20% page height)
                            # Found match!
                            x1, y1, x2, y2 = best_box['box']
                            
                            # Smart Padding (Vertical emphasis)
                            pad_w = (x2 - x1) * 0.05
                            pad_h_top = (y2 - y1) * 0.05
                            pad_h_bottom = (y2 - y1) * 0.20 # 20% bottom for label
                            
                            x1 = max(0, int(x1 - pad_w))
                            y1 = max(0, int(y1 - pad_h_top))
                            x2 = min(w, int(x2 + pad_w))
                            y2 = min(h, int(y2 + pad_h_bottom))

                            crop = page_np[y1:y2, x1:x2]
                            img_id = str(uuid.uuid4())
                            img_path = os.path.join(IMAGES_DIR, f"{img_id}.jpg")
                            cv2.imwrite(img_path, cv2.cvtColor(crop, cv2.COLOR_RGB2BGR))
                            
                            manifest.append({
                                "uuid": img_id,
                                "file_path": img_path,
                                "source_page": page_num,
                                "source_page_image_path": page_img_path,
                                "source_page_dims": [w, h],
                                "box": [x1, y1, x2, y2],
                                "detection_method": "targeted_match",
                                "detected_sku": sku, # Confirmed SKU
                                "detected_name": f"Matched {sku}"
                            })
                            found_skus_set.add(sku)
            else:
                # --- AUTO DISCOVERY MODE (Legacy) ---
                for item in merged:
                    x1, y1, x2, y2 = item['box']
                    
                    # Smart Padding
                    pad_w = (x2 - x1) * 0.05
                    pad_h_top = (y2 - y1) * 0.05
                    pad_h_bottom = (y2 - y1) * 0.20
                    
                    x1 = max(0, int(x1 - pad_w))
                    y1 = max(0, int(y1 - pad_h_top))
                    x2 = min(w, int(x2 + pad_w))
                    y2 = min(h, int(y2 + pad_h_bottom))

                    crop = page_np[y1:y2, x1:x2]
                    img_id = str(uuid.uuid4())
                    img_path = os.path.join(IMAGES_DIR, f"{img_id}.jpg")
                    cv2.imwrite(img_path, cv2.cvtColor(crop, cv2.COLOR_RGB2BGR))

                    # OCR
                    detected_text = pytesseract.image_to_string(crop).strip()
                    detected_sku = ""
                    if sku_match := re.search(r'\b[A-Z0-9-]{5,12}\b', detected_text):
                        detected_sku = sku_match.group(0)

                    manifest.append({
                        "uuid": img_id,
                        "file_path": img_path,
                        "source_page": page_num,
                        "source_page_image_path": page_img_path,
                        "source_page_dims": [w, h],
                        "box": [x1, y1, x2, y2],
                        "detection_method": item['method'],
                        "detected_text": detected_text,
                        "detected_sku": detected_sku 
                    })

        # Calculate Missing
        missing_skus = []
        if target_skus:
            for sku in target_skus:
                if sku not in found_skus_set:
                    missing_skus.append(sku)
        
        # Create manifest
        safe_name = os.path.basename(file_path)
        manifest_path = os.path.join(PROCESSED_DIR, f"manifest_{safe_name}.json")
        with open(manifest_path, 'w') as f:
            json.dump({
                "items": manifest,
                "missing_skus": missing_skus,
                "mode": "targeted" if target_skus else "auto"
            }, f, indent=2)
        logging.info(f"Manifest created: {manifest_path} (Missing: {len(missing_skus)})")

        # Clean up sidecar
        if target_skus and os.path.exists(sidecar_path):
            os.remove(sidecar_path)

        # Move processed file to PROCESSED_DIR to prevent re-processing
        # Use shutil.move (ensure we import shutil)
        import shutil
        dest_path = os.path.join(PROCESSED_DIR, filename)
        # If exists, overwrite or rename? For now, overwrite
        if os.path.exists(dest_path):
            os.remove(dest_path)
        shutil.move(file_path, dest_path)
        logging.info(f"Moved processed file to: {dest_path}")

    except Exception as e:
        logging.error(f"PDF Error: {e}")

def process_excel(file_path):
    logging.info(f"Processing Excel: {file_path}")
    try:
        # 1. Extract Supplier Metadata (Naive approach: expects separate metadata file or hardcoded for now)
        # In a real app, backend would make an API call to get mapping config using file ID or filename pattern
        # For this Stub, we'll try to fetch ALL suppliers and match via filename or default to first
        
        # NOTE: For MVP, we will assume a sidecar JSON file exists OR just use a default test mapping
        sidecar_path = file_path + ".meta.json"
        mapping_config = { "header_row": 0, "col_sku": 0, "col_qty": 1, "col_price": 2, "col_brand": 3 } # Default
        supplier_id = None

        if os.path.exists(sidecar_path):
            with open(sidecar_path, 'r') as f:
                meta = json.load(f)
                mapping_config = meta.get('mapping_config', mapping_config)
                supplier_id = meta.get('supplier_id')

        items, brands = excel_parser.process(file_path, mapping_config)
        
        # Save result
        output_file = os.path.join(ORDERS_DIR, f"{uuid.uuid4()}.json")
        with open(output_file, 'w') as f:
            json.dump({
                "supplier_id": supplier_id,
                "items": items,
                "detected_brands": brands
            }, f, indent=2)
            
        logging.info(f"Excel processed. {len(items)} items extracted.")

    except Exception as e:
        logging.error(f"Excel Error: {e}")

# --- WATCHDOG ---

class NewFileHandler(FileSystemEventHandler):
    def on_created(self, event):
        if event.is_directory: return
        filename = os.path.basename(event.src_path)
        
        # Debounce
        time.sleep(1)

        if filename.lower().endswith('.pdf'):
            process_pdf(event.src_path)
        elif filename.lower().endswith(('.xlsx', '.csv', '.xls')):
            if "ECV" in filename or "template" in filename.lower():
                logging.info(f"Skipping template event: {filename}")
                return
            process_excel(event.src_path)

if __name__ == "__main__":
    logging.info("Initializing Worker...")
    _ = detector.yolo 
    
    event_handler = NewFileHandler()
    observer = Observer()
    observer.schedule(event_handler, RAW_DIR, recursive=False)
    
    
    logging.info(f"Monitoring {RAW_DIR}...")
    observer.start()

    # Startup scan removed per user request to avoid auto-processing loop
    # The worker will only process new file events.

    try:
        while True: time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()

