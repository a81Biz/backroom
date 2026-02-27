
import NavHeader from '../NavHeader';
import CropModal from '../common/CropModal';
import { useState, useEffect } from 'react';

// Steps Enum
enum Step {
    SELECT_SUPPLIER = 1,
    UPLOAD_CATALOG = 2,
    UPLOAD_PDF = 3,
    REVIEW = 4
}

const IngestStudio = () => {
    // Global State
    const [currentStep, setCurrentStep] = useState<Step>(Step.SELECT_SUPPLIER);
    const [isCropModalOpen, setCropModalOpen] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progressDetails, setProgressDetails] = useState<{ current_page?: number, total_pages?: number, message?: string } | null>(null);

    // Data State
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [selectedSupplier, setSelectedSupplier] = useState<any>(null); // Full object
    const [catalogStats, setCatalogStats] = useState<string>(''); // e.g. "50 items imported"


    const [products, setProducts] = useState<any[]>([]); // Found items
    const [missingSkus, setMissingSkus] = useState<string[]>([]);
    const [selectedProduct, setSelectedProduct] = useState<any>(null);

    // Initial Load
    useEffect(() => {
        fetch('/api/suppliers').then(r => r.json()).then(setSuppliers);
        // Clean up any old state? No, keep it for now.
    }, []);


    // Helper Functions to restore
    const handleOpenCrop = (product: any) => {
        if (!product.source_page_image_path) {
            alert("No full page available for this item.");
            return;
        }
        setSelectedProduct(product);
        setCropModalOpen(true);
    };

    const handleSaveCrop = (newRect: number[]) => {
        if (!selectedProduct) return;
        // Fix: Clean paths to avoid query param buildup
        const cleanSource = selectedProduct.source_page_image_path?.split('?')[0];
        const cleanDest = selectedProduct.image_path?.split('?')[0];

        fetch(`/api/products/${selectedProduct.id}/recrop`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                x: newRect[0],
                y: newRect[1],
                w: newRect[2],
                h: newRect[3],
                source_path: cleanSource,
                dest_path: cleanDest
            })
        })
            .then(res => res.json())
            .then(data => {
                // Update product image in state with new URL (bust cache)
                setProducts(prev => prev.map(p => p.id === selectedProduct.id ? { ...p, image_path: data.new_image_url } : p));
                setCropModalOpen(false);
            })
            .catch(err => console.error("Recrop failed", err));
    };

    const handleDelete = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm("Delete this item?")) return;
        fetch(`/api/products/${id}`, { method: 'DELETE' })
            .then(() => {
                setProducts(prev => prev.filter(p => p.id !== id));
            });
    };

    const handleSaveProduct = (product: any, e: React.MouseEvent) => {
        e.stopPropagation();
        fetch('/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...product, status: 'APPROVED' })
        })
            .then(res => res.json())
            .then(savedProduct => {
                setProducts(prev => prev.map(p => p.id === product.id ? savedProduct : p));
            })
            .catch(err => alert("Failed to save: " + err.message));
    };

    const processPdfUpload = (file: File) => {
        if (!file) return;
        setIsProcessing(true);
        setProgressDetails(null);
        const formData = new FormData();
        formData.append('file', file);

        // 1. Upload
        fetch('/api/ingest/upload', { method: 'POST', body: formData })
            .then(res => {
                if (!res.ok) throw new Error("Upload failed");
                return res.json();
            })
            .then(() => {
                // 2. Trigger Processing (with Supplier ID if selected)
                let url = `/api/ingest/trigger?filename=${encodeURIComponent(file.name)}`;
                if (selectedSupplier) url += `&supplier_id=${selectedSupplier.id}`;

                return fetch(url, { method: 'POST' });
            })
            .then(() => {
                // 3. Poll for Manifest
                const checkStatus = setInterval(() => {
                    fetch(`/api/ingest/process?filename=${encodeURIComponent(file.name)}`, { method: 'POST' })
                        .then(async res => {
                            if (res.status === 404) return; // Wait
                            const data = await res.json();

                            // 202 Tracking vs 200 Final
                            if (res.status === 200 && data.status === 'preview') {
                                clearInterval(checkStatus);
                                setProducts(data.products || []);
                                setMissingSkus(data.missing_skus || []);
                                setIsProcessing(false);
                                setProgressDetails(null);
                                setCurrentStep(Step.REVIEW);
                            } else if (res.status === 202 || data.status === 'processing') {
                                setProgressDetails({
                                    current_page: data.current_page,
                                    total_pages: data.total_pages,
                                    message: data.message
                                });
                            }
                        })
                        .catch(e => { if (!e.message.includes("404")) console.error(e) });
                }, 2000);
            })
            .catch(err => {
                console.error(err);
                setIsProcessing(false);
                alert("Failed to process PDF");
            });
    };

    // Layout
    return (
        <div className="flex flex-col h-screen bg-background-dark relative">
            {/* Loading Overlay */}
            {isProcessing && (
                <div className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary mb-4"></div>
                    <h2 className="text-xl font-bold text-white tracking-widest animate-pulse">MINING DATA...</h2>
                    {progressDetails?.current_page && progressDetails?.total_pages ? (
                        <p className="text-primary font-bold mt-2 text-lg">
                            Processing Page {progressDetails.current_page} of {progressDetails.total_pages}
                        </p>
                    ) : (
                        <p className="text-slate-400 text-sm mt-2">{progressDetails?.message || "Please wait while we extract products"}</p>
                    )}
                </div>
            )}

            <NavHeader />

            {/* Stepper Header */}
            <div className="bg-surface-dark border-b border-border-dark p-4 flex justify-center gap-8 shrink-0">
                {[
                    { id: Step.SELECT_SUPPLIER, label: "1. Select Supplier" },
                    { id: Step.UPLOAD_CATALOG, label: "2. Upload Catalog" },
                    { id: Step.UPLOAD_PDF, label: "3. Upload PDF" },
                    { id: Step.REVIEW, label: "4. Review & Save" }
                ].map(step => (
                    <div
                        key={step.id}
                        className={`flex items-center gap-2 text-sm font-bold ${currentStep === step.id ? 'text-primary' :
                            currentStep > step.id ? 'text-emerald-500' : 'text-slate-600'
                            }`}
                    >
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center border ${currentStep === step.id ? 'border-primary text-primary' :
                            currentStep > step.id ? 'border-emerald-500 bg-emerald-500/20 text-emerald-500' : 'border-slate-600 text-slate-600'
                            }`}>
                            {currentStep > step.id ? '✓' : step.id}
                        </div>
                        {step.label}
                    </div>
                ))}
            </div>

            <main className="flex-1 overflow-hidden p-8 flex flex-col items-center">

                {/* STEP 1: SELECT SUPPLIER */}
                {currentStep === Step.SELECT_SUPPLIER && (
                    <div className="w-full max-w-2xl bg-surface-dark border border-border-dark rounded-xl p-8 text-center animate-fade-in">
                        <h2 className="text-2xl font-bold text-white mb-2">Who are we working with?</h2>
                        <p className="text-slate-400 mb-8">Select the supplier to load their configuration.</p>

                        <div className="grid grid-cols-2 gap-4">
                            {suppliers.map(s => (
                                <button
                                    key={s.id}
                                    onClick={() => {
                                        setSelectedSupplier(s);
                                        setCurrentStep(Step.UPLOAD_CATALOG);
                                    }}
                                    className="p-6 rounded-lg border border-white/5 bg-white/5 hover:bg-primary/10 hover:border-primary transition-all flex flex-col items-center gap-3 group"
                                >
                                    <span className="material-symbols-outlined text-4xl text-slate-500 group-hover:text-primary">store</span>
                                    <span className="text-lg font-bold text-slate-200 group-hover:text-white">{s.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* STEP 2: UPLOAD CATALOG */}
                {currentStep === Step.UPLOAD_CATALOG && (
                    <div className="w-full max-w-2xl bg-surface-dark border border-border-dark rounded-xl p-8 text-center animate-fade-in relative">
                        <button
                            onClick={() => setCurrentStep(Step.SELECT_SUPPLIER)}
                            className="absolute top-4 left-4 text-slate-500 hover:text-white flex items-center gap-1 text-sm"
                        >
                            <span className="material-symbols-outlined text-sm">arrow_back</span> Back
                        </button>

                        <h2 className="text-2xl font-bold text-white mb-2">Update Catalog Data</h2>
                        <p className="text-slate-400 mb-8">Upload the latest Excel/CSV from <span className="text-primary">{selectedSupplier?.name}</span> to identify known products.</p>

                        <div className="border-2 border-dashed border-white/10 rounded-xl p-12 flex flex-col items-center justify-center hover:border-primary/50 transition-colors bg-black/20">
                            <span className="material-symbols-outlined text-6xl text-slate-600 mb-4">table_view</span>

                            <label className="cursor-pointer bg-primary hover:bg-primary-hover text-white px-6 py-3 rounded-lg font-bold shadow-lg shadow-primary/20 transition-all flex items-center gap-2">
                                <span className="material-symbols-outlined">upload_file</span>
                                Choose Excel File
                                <input type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => {
                                    if (e.target.files && e.target.files[0]) {
                                        const formData = new FormData();
                                        formData.append('file', e.target.files[0]);
                                        fetch(`/api/suppliers/${selectedSupplier.id}/catalog`, { method: 'POST', body: formData })
                                            .then(res => res.json())
                                            .then(data => {
                                                setCatalogStats(`${data.count || 0} items processed`);
                                            });
                                    }
                                }} />
                            </label>

                            {catalogStats && (
                                <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 flex items-center gap-2">
                                    <span className="material-symbols-outlined">check_circle</span>
                                    <span>Success: {catalogStats}</span>
                                </div>
                            )}
                        </div>

                        <div className="mt-8 flex justify-end">
                            <button
                                onClick={() => setCurrentStep(Step.UPLOAD_PDF)}
                                className={`px-6 py-2 rounded-lg font-bold ${catalogStats ? 'bg-white text-black hover:bg-slate-200' : 'bg-slate-700 text-slate-400'}`}
                            >
                                Continue to PDF
                            </button>
                        </div>
                    </div>
                )}

                {/* STEP 3: UPLOAD PDF */}
                {currentStep === Step.UPLOAD_PDF && (
                    <div className="w-full max-w-2xl bg-surface-dark border border-border-dark rounded-xl p-8 text-center animate-fade-in relative">
                        <button
                            onClick={() => setCurrentStep(Step.UPLOAD_CATALOG)}
                            className="absolute top-4 left-4 text-slate-500 hover:text-white flex items-center gap-1 text-sm"
                        >
                            <span className="material-symbols-outlined text-sm">arrow_back</span> Back
                        </button>

                        <h2 className="text-2xl font-bold text-white mb-2">Upload Visual Catalog</h2>
                        <p className="text-slate-400 mb-8">Upload the PDF to extract product images for <span className="text-primary">{selectedSupplier?.name}</span>.</p>

                        <div className="border-2 border-dashed border-white/10 rounded-xl p-12 flex flex-col items-center justify-center hover:border-primary/50 transition-colors bg-black/20">
                            <span className="material-symbols-outlined text-6xl text-slate-600 mb-4">picture_as_pdf</span>

                            <label className="cursor-pointer bg-primary hover:bg-primary-hover text-white px-6 py-3 rounded-lg font-bold shadow-lg shadow-primary/20 transition-all flex items-center gap-2">
                                <span className="material-symbols-outlined">upload_file</span>
                                Choose PDF File
                                <input type="file" accept=".pdf" className="hidden" onChange={(e) => {
                                    if (e.target.files && e.target.files[0]) {
                                        processPdfUpload(e.target.files[0]);
                                    }
                                }} />
                            </label>
                        </div>
                    </div>
                )}

                {/* STEP 4: REVIEW */}
                {currentStep === Step.REVIEW && (
                    <div className="w-full h-full flex gap-4 animate-fade-in">
                        {/* GRID AREA (Full Width) */}
                        <div className="flex-1 bg-surface-dark border border-border-dark rounded-xl overflow-hidden flex flex-col">
                            <div className="p-4 border-b border-border-dark flex justify-between items-center bg-surface-dark/50">
                                <div>
                                    <h3 className="font-bold text-white">Extracted Items</h3>
                                    <p className="text-xs text-slate-400">Review, crop, and approve items.</p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            if (confirm("Clear current session?")) {
                                                setProducts([]);
                                                setMissingSkus([]);
                                                setCurrentStep(Step.SELECT_SUPPLIER);
                                            }
                                        }}
                                        className="text-xs text-slate-500 hover:text-white px-3 py-2"
                                    >
                                        Start Over
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 bg-black/20">
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {products.map((card, idx) => (
                                        <div key={card.id || idx} className={`group relative bg-surface-dark border ${card.status === 'Draft' ? 'border-primary/40' : 'border-emerald-500/40'} rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col`}>
                                            <div className="aspect-[4/3] relative bg-neutral-800 flex items-center justify-center overflow-hidden group/image">
                                                <img src={card.image_path} className="w-full h-full object-contain p-2" loading="lazy" />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/image:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                    <button onClick={(e) => { e.stopPropagation(); handleOpenCrop(card); }} className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-sm" title="Re-Crop">
                                                        <span className="material-symbols-outlined text-lg">crop</span>
                                                    </button>
                                                </div>
                                                <div className="absolute top-2 right-2">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${card.status === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-primary/20 text-primary-light'}`}>
                                                        {card.status}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="p-3 flex-1 flex flex-col gap-2">
                                                <div className="space-y-1">
                                                    <p className="text-xs font-bold text-white truncate">{card.title || 'Untitled'}</p>
                                                    <p className="text-xs font-mono text-slate-400">{card.sku}</p>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 mt-auto pt-2 border-t border-white/5">
                                                    <button onClick={(e) => handleDelete(card.id, e)} className="flex items-center justify-center gap-1 py-1.5 rounded hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors text-xs font-medium">
                                                        <span className="material-symbols-outlined text-sm">delete</span> Delete
                                                    </button>
                                                    <button onClick={(e) => handleSaveProduct(card, e)} className={`flex items-center justify-center gap-1 py-1.5 rounded text-white text-xs font-medium transition-colors ${card.status === 'APPROVED' ? 'bg-emerald-600/20 text-emerald-400 cursor-default' : 'bg-primary hover:bg-primary-hover shadow-lg shadow-primary/20'}`}>
                                                        <span className="material-symbols-outlined text-sm">check</span> {card.status === 'APPROVED' ? 'Saved' : 'Save'}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* MISSING SIDEBAR */}
                        <div className="w-80 bg-surface-dark border border-border-dark rounded-xl overflow-hidden flex flex-col shrink-0">
                            <div className="p-4 border-b border-border-dark bg-red-500/10 flex justify-between items-center">
                                <h3 className="font-bold text-red-400">Missing Items</h3>
                                <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded text-xs font-mono">{missingSkus.length}</span>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                {missingSkus.map((sku, idx) => (
                                    <div key={idx} className="p-2 rounded bg-red-500/5 border border-red-500/10 text-red-300 text-xs flex justify-between items-center group hover:bg-red-500/10 transition-colors">
                                        <span className="font-mono">{sku}</span>
                                        <button className="opacity-0 group-hover:opacity-100 hover:text-white" title="Find Manually">
                                            <span className="material-symbols-outlined text-sm">find_in_page</span>
                                        </button>
                                    </div>
                                ))}
                                {missingSkus.length === 0 && (
                                    <div className="p-8 text-center text-slate-500 text-xs italic">
                                        All catalog items were found in the PDF.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

            </main>

            <CropModal
                isOpen={isCropModalOpen}
                onClose={() => setCropModalOpen(false)}
                imageUrl={selectedProduct?.source_page_image_path?.replace('/app/shared/processed', '/media') || ''}
                title={selectedProduct?.title || selectedProduct?.sku}
                initialRect={selectedProduct?.image_rect ? JSON.parse(selectedProduct.image_rect) : undefined}
                onSave={async (crop) => {
                    // Convert PixelCrop to array format expected by handleSaveCrop
                    // handleSaveCrop expects [x, y, w, h]
                    handleSaveCrop([crop.x, crop.y, crop.width, crop.height]);
                }}
            />
        </div>
    )
}

export default IngestStudio;
