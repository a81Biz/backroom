export const API_BASE = '/api';

export const api = {
    ingest: {
        upload: async (file: File) => {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch(`${API_BASE}/ingest/upload`, {
                method: 'POST',
                body: formData,
            });
            if (!res.ok) throw new Error('Upload failed');
            return res.json();
        }
    },
    products: {
        list: async () => {
            const res = await fetch(`${API_BASE}/products`);
            if (!res.ok) throw new Error('Failed to fetch products');
            return res.json();
        },
        sync: async () => {
            const res = await fetch(`${API_BASE}/products/sync`, { method: 'POST' });
            if (!res.ok) throw new Error('Sync failed');
            return res.json();
        }
    },
    orders: {
        list: async () => {
            const res = await fetch(`${API_BASE}/orders`);
            if (!res.ok) throw new Error('Failed to fetch orders');
            return res.json();
        }
    },
    scan: {
        submit: async (sku: string, poId?: number) => {
            const res = await fetch(`${API_BASE}/scan/item`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sku, po_id: poId }),
            });
            if (!res.ok) throw new Error('Scan failed');
            return res.json();
        }
    }
};
