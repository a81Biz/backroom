import pandas as pd
import logging

class ExcelIngestor:
    def process(self, file_path, mapping_config):
        """
        Parses Excel/CSV based on mapping_config.
        mapping_config schema:
        {
            "header_row": int (0-based index),
            "col_sku": int,
            "col_qty": int,
            "col_price": int,
            "col_brand": int (optional)
        }
        """
        try:
            # 1. Load Data
            if file_path.endswith('.csv'):
                df = pd.read_csv(file_path, header=mapping_config.get('header_row', 0))
            else:
                df = pd.read_excel(file_path, header=mapping_config.get('header_row', 0))

            standardized_items = []
            unique_brands = set()

            # 2. Iterate and Extract
            for index, row in df.iterrows():
                try:
                    # Helper to safely get value by column index
                    def get_val(col_idx):
                        if col_idx is None or col_idx < 0: return None
                        # pandas row is label-based if header is set, but we want positional
                        # iloc is strictly integer position based
                        if col_idx < len(row):
                            return row.iloc[col_idx]
                        return None

                    sku = get_val(mapping_config.get('col_sku'))
                    qty = get_val(mapping_config.get('col_qty'))
                    price = get_val(mapping_config.get('col_price'))
                    brand = get_val(mapping_config.get('col_brand'))

                    if pd.isna(sku): continue # Skip empty rows

                    item = {
                        "sku": str(sku).strip(),
                        "qty": int(qty) if pd.notna(qty) else 0,
                        "price": float(price) if pd.notna(price) else 0.0,
                        "brand": str(brand).strip() if pd.notna(brand) else None
                    }
                    standardized_items.append(item)
                    
                    if item['brand']:
                        unique_brands.add(item['brand'])

                except Exception as e:
                    logging.warning(f"Skipping row {index}: {e}")
                    continue

            return standardized_items, list(unique_brands)

        except Exception as e:
            logging.error(f"Excel Ingest Error: {e}")
            raise e
