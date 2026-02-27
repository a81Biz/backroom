import React, { useState, useEffect, useRef } from 'react';
import NavHeader from '../NavHeader';
import { Upload, Package, FileText, CheckCircle, ShoppingCart, Crop as CropIcon } from 'lucide-react';
import CropModal from '../common/CropModal';
import { PixelCrop } from 'react-image-crop';

interface Product {
    id: string;
    sku: string;
    title: string;
    brand: string;
    image_path: string;
    stock_on_hand: number;
    stock_reserved: number;
    qty_ordered: number;
    qty_ordered_total?: number;
    qty_received_total?: number;
    status: string;
    source_page_image_path?: string;
}

interface Order {
    id: number;
    supplier_name: string;
    file_name?: string;
    status: string;
    created_at: string;
    items?: any[];
}

const InventoryManager = () => {
    const [activeTab, setActiveTab] = useState('inventory');
    const [products, setProducts] = useState<Product[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState<any>(null);
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Order Details Modal State
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

    // Crop Modal State
    const [cropModalOpen, setCropModalOpen] = useState(false);
    const [selectedProductForCrop, setSelectedProductForCrop] = useState<Product | null>(null);

    // Sorting State
    const [sortColumn, setSortColumn] = useState<keyof Product | 'progress'>('title');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    // Order Items Sorting State
    const [orderSortColumn, setOrderSortColumn] = useState<'sku' | 'ordered' | 'received' | 'missing' | 'status'>('sku');
    const [orderSortDirection, setOrderSortDirection] = useState<'asc' | 'desc'>('asc');

    // Image Preview State
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    const handleSort = (column: keyof Product | 'progress') => {
        if (sortColumn === column) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('asc');
        }
    };

    const sortedProducts = [...products].sort((a, b) => {
        let valA: any = a[sortColumn as keyof Product];
        let valB: any = b[sortColumn as keyof Product];

        if (sortColumn === 'progress') {
            const totalA = a.qty_ordered_total || 0;
            const totalB = b.qty_ordered_total || 0;
            const pctA = totalA > 0 ? (a.qty_received_total || 0) / totalA : 100;
            const pctB = totalB > 0 ? (b.qty_received_total || 0) / totalB : 100;
            valA = pctA;
            valB = pctB;
        }

        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    const handleOrderSort = (column: 'sku' | 'ordered' | 'received' | 'missing' | 'status') => {
        if (orderSortColumn === column) {
            setOrderSortDirection(orderSortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setOrderSortColumn(column);
            setOrderSortDirection('asc');
        }
    };

    const sortedOrderItems = selectedOrder?.items ? [...selectedOrder.items].sort((a: any, b: any) => {
        let valA: any;
        let valB: any;

        switch (orderSortColumn) {
            case 'ordered':
                valA = a.qty_ordered || 0;
                valB = b.qty_ordered || 0;
                break;
            case 'received':
                valA = a.qty_received || 0;
                valB = b.qty_received || 0;
                break;
            case 'missing':
                valA = (a.qty_ordered || 0) - (a.qty_received || 0);
                valB = (b.qty_ordered || 0) - (b.qty_received || 0);
                break;
            case 'status':
                const isCompleteA = (a.qty_received || 0) >= (a.qty_ordered || 0);
                valA = a.status || (isCompleteA ? 'COMPLETED' : 'PENDING');
                const isCompleteB = (b.qty_received || 0) >= (b.qty_ordered || 0);
                valB = b.status || (isCompleteB ? 'COMPLETED' : 'PENDING');
                break;
            case 'sku':
            default:
                valA = a.sku || '';
                valB = b.sku || '';
                break;
        }

        if (valA < valB) return orderSortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return orderSortDirection === 'asc' ? 1 : -1;
        return 0;
    }) : [];

    useEffect(() => {
        if (activeTab === 'inventory') fetchInventory();
        else fetchOrders();
        fetchSuppliers();
    }, [activeTab]);

    const fetchSuppliers = async () => {
        try {
            const res = await fetch('/api/suppliers');
            if (res.ok) {
                const data = await res.json();
                setSuppliers(data || []);
            }
        } catch (err) {
            console.error("Failed to fetch suppliers", err);
        }
    };

    const fetchInventory = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/inventory');
            if (!res.ok) throw new Error("Failed to fetch inventory");
            const data = await res.json();
            setProducts(data || []);
        } catch (err) {
            console.error("Failed to fetch inventory", err);
        } finally {
            setLoading(false);
        }
    };

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/orders');
            if (!res.ok) throw new Error("Failed to fetch orders");
            const data = await res.json();
            setOrders(data || []);
        } catch (err) {
            console.error("Failed to fetch orders", err);
        } finally {
            setLoading(false);
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!selectedSupplierId) {
            alert("Please select a Supplier first.");
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }
        if (e.target.files && e.target.files[0]) {
            await uploadOrder(e.target.files[0]);
        }
    };

    const uploadOrder = async (file: File, overwrite: boolean = false) => {
        setUploading(true);
        setUploadResult(null);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('supplier_id', selectedSupplierId);
        if (overwrite) {
            formData.append('overwrite', 'true');
        }

        try {
            const res = await fetch('/api/orders', {
                method: 'POST',
                body: formData,
            });

            const data = await res.json();

            // Handle 409 Conflict for Duplicates
            if (res.status === 409 && data.duplicate) {
                const confirmUpdate = window.confirm(`File "${file.name}" already exists for this supplier. Do you want to overwrite it and update the order? (Previously received quantities will be preserved.)`);
                if (confirmUpdate) {
                    return uploadOrder(file, true); // Retry with overwrite=true
                } else {
                    return; // Cancelled by user
                }
            }

            if (!res.ok) throw new Error(data.error || "Upload failed");

            setUploadResult(data);
            if (activeTab === 'inventory') fetchInventory();
            else fetchOrders();
        } catch (err: any) {
            console.error("Upload failed", err);
            alert("Upload failed: " + err.message);
        } finally {
            setUploading(false);
            if (fileInputRef.current && !overwrite) fileInputRef.current.value = '';
        }
    };

    const getImageUrl = (path: string | undefined) => {
        if (!path) return '';
        if (path.startsWith('/media')) return path;
        if (path.startsWith('/app/shared/processed')) {
            return `/media${path.replace('/app/shared/processed', '')}`;
        }
        if (path.startsWith('http')) return path;
        const cleanPath = path.startsWith('/') ? path : `/${path}`;
        return `/media${cleanPath}`;
    };

    const openCropModal = (product: Product) => {
        if (!product.source_page_image_path) {
            alert("This product has no source page to crop from.");
            return;
        }
        setSelectedProductForCrop(product);
        setCropModalOpen(true);
    };

    const handleCropSave = async (crop: PixelCrop) => {
        if (!selectedProductForCrop) return;
        try {
            const res = await fetch(`/api/products/${selectedProductForCrop.id}/recrop`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    x: crop.x,
                    y: crop.y,
                    w: crop.width,
                    h: crop.height,
                })
            });

            if (!res.ok) throw new Error("Recrop failed");
            await fetchInventory();

        } catch (err: any) {
            console.error("Recrop error", err);
            alert("Recrop failed: " + err.message);
            throw err;
        }
    };

    // KPI Calcs
    const totalSOH = products.reduce((acc, p) => acc + (p.stock_on_hand || 0), 0);
    const totalOrdered = products.reduce((acc, p) => acc + (p.qty_ordered || 0), 0);

    return (
        <div className="flex flex-col h-screen bg-background-dark overflow-y-auto">
            {productImageModal(previewImage, setPreviewImage)}

            <NavHeader />
            <main className="flex-1 px-6 py-8 lg:px-10 max-w-7xl mx-auto w-full space-y-6">

                {/* Header & Actions */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-white">Inventory & Orders</h1>
                        <p className="text-slate-400 mt-1">Manage stock levels and track incoming shipments.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Supplier Selector */}
                        <select
                            value={selectedSupplierId}
                            onChange={(e) => setSelectedSupplierId(e.target.value)}
                            className="bg-surface-dark border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:ring-primary focus:border-primary outline-none"
                        >
                            <option value="">-- Select Supplier --</option>
                            {suppliers.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>

                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            className="hidden"
                            accept=".xlsx,.xls,.csv"
                        />
                        <button
                            onClick={() => {
                                if (!selectedSupplierId) {
                                    alert("Please select a Supplier first to apply the correct template.");
                                    return;
                                }
                                fileInputRef.current?.click();
                            }}
                            disabled={uploading}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white font-bold hover:bg-primary-hover shadow-lg shadow-primary/20 transition-all ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {uploading ? <span className="animate-spin mr-2">⏳</span> : <Upload className="w-4 h-4" />}
                            Upload PO
                        </button>
                    </div>
                </div>

                {/* Upload Feedback */}
                {uploadResult && (
                    <div className="border border-green-500/20 bg-green-500/10 rounded-xl p-6 animate-fade-in relative">
                        <div className="flex items-start gap-4">
                            <CheckCircle className="w-6 h-6 text-green-500 mt-1" />
                            <div>
                                <h3 className="font-bold text-green-400">Order Uploaded Successfully</h3>
                                <p className="text-sm text-green-300/80 mt-1">
                                    PO Created: <span className="font-mono font-bold text-white">#{uploadResult.po_id}</span> with {uploadResult.items_count} items.<br />
                                    Found: {uploadResult.found_skus} | Missing: {uploadResult.missing_skus?.length || 0}
                                </p>
                                {uploadResult.missing_skus?.length > 0 && (
                                    <div className="mt-2 text-xs text-red-400 font-mono bg-red-500/10 p-2 rounded border border-red-500/20">
                                        Missing SKUs: {uploadResult.missing_skus.join(", ")}
                                    </div>
                                )}
                            </div>
                            <button onClick={() => setUploadResult(null)} className="absolute top-4 right-4 text-slate-500 hover:text-white">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* KPIs */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-surface-dark border border-border-dark rounded-xl p-6">
                        <div className="flex items-center justify-between text-slate-400 mb-2">
                            <span className="text-sm font-medium">Stock on Hand</span>
                            <Package className="w-5 h-5 text-slate-500" />
                        </div>
                        <div className="text-3xl font-bold text-white mono-nums">{totalSOH > 0 ? totalSOH : '-'}</div>
                        <p className="text-xs text-slate-500 mt-1">Physical units available</p>
                    </div>
                    <div className="bg-surface-dark border border-border-dark rounded-xl p-6">
                        <div className="flex items-center justify-between text-slate-400 mb-2">
                            <span className="text-sm font-medium">Incoming (Ordered)</span>
                            <ShoppingCart className="w-5 h-5 text-slate-500" />
                        </div>
                        <div className="text-3xl font-bold text-white mono-nums">{totalOrdered > 0 ? totalOrdered : '-'}</div>
                        <p className="text-xs text-slate-500 mt-1">Units in open POs</p>
                    </div>
                    <div className="bg-surface-dark border border-border-dark rounded-xl p-6">
                        <div className="flex items-center justify-between text-slate-400 mb-2">
                            <span className="text-sm font-medium">Processing</span>
                            <FileText className="w-5 h-5 text-slate-500" />
                        </div>
                        <div className="text-3xl font-bold text-white mono-nums">{orders.length > 0 ? orders.length : '-'}</div>
                        <p className="text-xs text-slate-500 mt-1">Total Purchase Orders</p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="w-full">
                    <div className="flex border-b border-white/10 mb-6">
                        <button
                            onClick={() => setActiveTab('inventory')}
                            className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'inventory' ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-white'}`}
                        >
                            Inventory (Stock)
                        </button>
                        <button
                            onClick={() => setActiveTab('orders')}
                            className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'orders' ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-white'}`}
                        >
                            Purchase Orders
                        </button>
                    </div>

                    {/* Content: Inventory */}
                    {activeTab === 'inventory' && (
                        <div className="bg-surface-dark border border-border-dark rounded-xl overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-white/5 border-b border-white/10">
                                            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Image</th>
                                            {/* Sortable Headers */}
                                            {[
                                                { id: 'sku', label: 'SKU' },
                                                { id: 'title', label: 'Product' },
                                                { id: 'brand', label: 'Brand' },
                                                { id: 'stock_on_hand', label: 'SOH', align: 'right' },
                                                { id: 'progress', label: 'Progress rec/ord', align: 'right' },
                                                { id: 'status', label: 'Status', align: 'right' }
                                            ].map((col) => (
                                                <th
                                                    key={col.id}
                                                    className={`px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400 cursor-pointer hover:text-white transition-colors ${col.align === 'right' ? 'text-right' : ''}`}
                                                    onClick={() => handleSort(col.id as any)}
                                                >
                                                    <div className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : ''}`}>
                                                        {col.label}
                                                        {sortColumn === col.id && (
                                                            <span className="text-primary">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                                        )}
                                                    </div>
                                                </th>
                                            ))}
                                            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {loading ? (
                                            <tr><td colSpan={8} className="text-center py-12 text-slate-500">Loading stock...</td></tr>
                                        ) : sortedProducts.length === 0 ? (
                                            <tr><td colSpan={8} className="text-center py-16 text-slate-500">No inventory found. Upload a Catalog or Order to begin.</td></tr>
                                        ) : (
                                            sortedProducts.map((p) => {
                                                const rec = p.qty_received_total || 0;
                                                const ord = p.qty_ordered_total || 0;
                                                const imgUrl = getImageUrl(p.image_path);

                                                let progressColor = "text-slate-600";
                                                if (ord > 0) {
                                                    if (rec === 0) progressColor = "text-amber-400";
                                                    else if (rec < ord) progressColor = "text-blue-400";
                                                    else if (rec === ord) progressColor = "text-emerald-400";
                                                    else progressColor = "text-red-400";
                                                }

                                                return (
                                                    <tr key={p.id} className="hover:bg-white/5 transition-colors group">
                                                        <td className="px-6 py-3">
                                                            {p.image_path ? (
                                                                <div
                                                                    className="w-12 h-12 rounded bg-white p-1 overflow-hidden cursor-pointer hover:scale-105 transition-transform"
                                                                    onClick={() => setPreviewImage(imgUrl)}
                                                                >
                                                                    <img
                                                                        src={imgUrl}
                                                                        alt={p.sku}
                                                                        className="w-full h-full object-contain"
                                                                        onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/48x48?text=Err'; }}
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <div className="w-12 h-12 bg-white/10 rounded flex items-center justify-center">
                                                                    <Package className="w-5 h-5 text-slate-500" />
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-3 font-mono font-medium text-white">{p.sku}</td>
                                                        <td className="px-6 py-3">
                                                            <div className="max-w-[300px] truncate text-slate-300" title={p.title}>{p.title}</div>
                                                        </td>
                                                        <td className="px-6 py-3 text-slate-400">{p.brand}</td>
                                                        <td className="px-6 py-3 text-right font-mono text-lg text-white font-bold">{p.stock_on_hand}</td>
                                                        <td className="px-6 py-3 text-right font-mono text-lg">
                                                            {ord > 0 ? (
                                                                <span className={`font-bold ${progressColor}`}>
                                                                    {rec} / {ord}
                                                                </span>
                                                            ) : p.stock_on_hand > 0 ? (
                                                                <span className="font-bold text-slate-400">
                                                                    {p.stock_on_hand} / 0
                                                                </span>
                                                            ) : (
                                                                <span className="text-slate-600">-</span>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-3 text-right">
                                                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${p.status === 'PUBLISHED' || p.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-700 text-slate-300 border-slate-600'}`}>
                                                                {p.status}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-3 text-right">
                                                            {p.source_page_image_path && (
                                                                <button
                                                                    onClick={() => openCropModal(p)}
                                                                    className="p-2 text-slate-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                                                                    title="Crop / Recrop Image"
                                                                >
                                                                    <CropIcon className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Content: Orders */}
                    {activeTab === 'orders' && (
                        <div className="bg-surface-dark border border-border-dark rounded-xl overflow-hidden">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-white/5 border-b border-white/10">
                                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">PO ID</th>
                                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Source / Supplier</th>
                                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">File Name</th>
                                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Date</th>
                                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400 text-center">Status</th>
                                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400 text-right">Items</th>
                                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400 text-right">Delivery Progress</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {loading ? (
                                        <tr><td colSpan={8} className="text-center py-12 text-slate-500">Loading orders...</td></tr>
                                    ) : orders.length === 0 ? (
                                        <tr><td colSpan={8} className="text-center py-16 text-slate-500">No Purchase Orders found.</td></tr>
                                    ) : (
                                        orders.map((order) => {
                                            const totalOrdered = order.items?.reduce((acc, i) => acc + (i.qty_ordered || 0), 0) || 0;
                                            const totalReceived = order.items?.reduce((acc, i) => acc + (i.qty_received || 0), 0) || 0;
                                            const progressPct = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;

                                            // Status colors
                                            let progressColor = "text-slate-400";
                                            if (progressPct === 100) progressColor = "text-emerald-400";
                                            else if (progressPct > 0) progressColor = "text-blue-400";
                                            else if (order.status === 'RECEIVED') progressColor = "text-emerald-400";

                                            return (
                                                <tr
                                                    key={order.id}
                                                    className="hover:bg-white/5 transition-colors cursor-pointer group"
                                                    onClick={() => setSelectedOrder(order)}
                                                >
                                                    <td className="px-6 py-4 font-mono font-bold text-white group-hover:text-primary transition-colors">#{order.id}</td>
                                                    <td className="px-6 py-4">
                                                        <div className="font-bold text-white">{order.supplier_name}</div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {order.file_name ? (
                                                            <div className="text-sm font-bold text-slate-300 font-mono flex items-center gap-2">
                                                                <FileText className="w-4 h-4 text-slate-500" /> {order.file_name}
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-600">-</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-slate-400">{new Date(order.created_at).toLocaleDateString()}</td>
                                                    <td className="px-6 py-4 text-center">
                                                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${order.status === 'PENDING' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                                                            {order.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right font-mono text-slate-300">
                                                        {order.items?.length || '-'}
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex flex-col items-end">
                                                            <span className={`font-mono font-bold text-lg ${progressColor}`}>{progressPct}%</span>
                                                            <span className="text-xs text-slate-500 font-mono">{totalReceived} / {totalOrdered}</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <CropModal
                    isOpen={cropModalOpen}
                    onClose={() => setCropModalOpen(false)}
                    imageUrl={selectedProductForCrop?.source_page_image_path?.replace('/app/shared/processed', '/media') || ''}
                    title={selectedProductForCrop?.title || selectedProductForCrop?.sku}
                    onSave={handleCropSave}
                />

                {/* --- Order Details Modal --- */}
                {selectedOrder && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                        <div className="bg-surface-dark w-full max-w-5xl max-h-[90vh] rounded-xl shadow-2xl border border-white/10 flex flex-col overflow-hidden animate-fade-in">

                            {/* Modal Header */}
                            <div className="p-6 border-b border-white/10 bg-white/5 flex justify-between items-start">
                                <div>
                                    <div className="flex items-center gap-3">
                                        <h2 className="text-2xl font-bold text-white">Purchase Order #{selectedOrder.id}</h2>
                                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${selectedOrder.status === 'PENDING' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                                            {selectedOrder.status}
                                        </span>
                                    </div>
                                    <p className="text-slate-400 mt-1">Source: <span className="text-white font-medium">{selectedOrder.supplier_name}</span></p>
                                    {selectedOrder.file_name && (
                                        <p className="text-slate-500 text-xs mt-1 flex items-center gap-1 font-mono">
                                            <FileText className="w-3 h-3" /> {selectedOrder.file_name}
                                        </p>
                                    )}
                                </div>
                                <button onClick={() => setSelectedOrder(null)} className="text-slate-400 hover:text-white transition-colors p-2 bg-white/5 hover:bg-white/10 rounded-lg">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>

                            {/* Modal KPIs */}
                            {(() => {
                                const totalOrdered = selectedOrder.items?.reduce((acc, i) => acc + (i.qty_ordered || 0), 0) || 0;
                                const totalReceived = selectedOrder.items?.reduce((acc, i) => acc + (i.qty_received || 0), 0) || 0;
                                const missing = totalOrdered - totalReceived;
                                const pct = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;
                                return (
                                    <div className="grid grid-cols-4 gap-4 p-6 bg-black/20 border-b border-white/5">
                                        <div>
                                            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Total Ordered</p>
                                            <p className="text-2xl font-bold text-white font-mono mt-1">{totalOrdered}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-emerald-500/70 font-bold uppercase tracking-wider">Received</p>
                                            <p className="text-2xl font-bold text-emerald-400 font-mono mt-1">{totalReceived}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-red-500/70 font-bold uppercase tracking-wider">Missing</p>
                                            <p className="text-2xl font-bold text-red-400 font-mono mt-1">{missing > 0 ? missing : 0}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-blue-500/70 font-bold uppercase tracking-wider">Completion</p>
                                            <div className="text-3xl font-bold text-blue-400 font-mono mt-1">{pct}%</div>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Modal Table */}
                            <div className="overflow-y-auto flex-1 p-6">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-white/10">
                                            <th className="pb-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500">Image</th>
                                            {[
                                                { id: 'sku', label: 'Product / SKU' },
                                                { id: 'ordered', label: 'Ordered', align: 'right' },
                                                { id: 'received', label: 'Received', align: 'right' },
                                                { id: 'missing', label: 'Missing', align: 'right' },
                                                { id: 'status', label: 'Status', align: 'right' }
                                            ].map((col) => (
                                                <th
                                                    key={col.id}
                                                    className={`pb-3 px-4 text-xs font-bold uppercase tracking-wider text-slate-500 cursor-pointer hover:text-white transition-colors ${col.align === 'right' ? 'text-right' : ''}`}
                                                    onClick={() => handleOrderSort(col.id as any)}
                                                >
                                                    <div className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : ''}`}>
                                                        {col.label}
                                                        {orderSortColumn === col.id && (
                                                            <span className="text-primary">{orderSortDirection === 'asc' ? '↑' : '↓'}</span>
                                                        )}
                                                    </div>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {sortedOrderItems.map((item: any, idx: number) => {
                                            const missingQty = item.qty_ordered - item.qty_received;
                                            const isComplete = item.qty_received >= item.qty_ordered;
                                            const imgUrl = item.product?.image_path ? getImageUrl(item.product.image_path) : null;

                                            return (
                                                <tr key={idx} className="hover:bg-white/5 transition-colors">
                                                    <td className="px-4 py-3">
                                                        {imgUrl ? (
                                                            <img src={imgUrl} alt={item.sku} className="w-10 h-10 object-contain rounded bg-white p-0.5" />
                                                        ) : (
                                                            <div className="w-10 h-10 bg-white/5 rounded flex justify-center items-center">
                                                                <Package className="w-4 h-4 text-slate-600" />
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="text-sm font-bold text-white max-w-[250px] truncate" title={item.product?.title || item.sku}>
                                                            {item.product?.title || "Unknown Product"}
                                                        </div>
                                                        <div className="text-xs text-slate-400 font-mono mt-0.5">{item.sku}</div>
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-mono text-slate-300 font-bold">{item.qty_ordered}</td>
                                                    <td className={`px-4 py-3 text-right font-mono font-bold ${isComplete ? 'text-emerald-400' : 'text-slate-300'}`}>
                                                        {item.qty_received}
                                                    </td>
                                                    <td className={`px-4 py-3 text-right font-mono font-bold ${missingQty > 0 ? 'text-red-400' : 'text-slate-600'}`}>
                                                        {missingQty > 0 ? missingQty : '-'}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${isComplete ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                                                            {item.status || (isComplete ? 'COMPLETED' : 'PENDING')}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </main >
        </div >
    );
};

// Helper for Image Modal
const productImageModal = (image: string | null, onClose: (v: null) => void) => {
    if (!image) return null;
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 cursor-pointer"
            onClick={() => onClose(null)}
        >
            <div className="relative max-w-5xl max-h-[90vh] w-full flex items-center justify-center">
                <img
                    src={image}
                    alt="Preview"
                    className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl border border-white/10"
                />
                <button
                    className="absolute top-4 right-4 bg-black/50 text-white p-2 rounded-full hover:bg-white/20 transition-colors"
                    onClick={(e) => { e.stopPropagation(); onClose(null); }}
                >
                    <span className="material-symbols-outlined">close</span>
                </button>
            </div>
        </div>
    );
}

export default InventoryManager;
