import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import QRCode from 'react-qr-code';
import { Html5QrcodeScanner } from 'html5-qrcode';

interface MobileScannerProps {
    context_po_id?: number | null;
    onClose?: () => void; // If used as a modal
}

const MobileScanner: React.FC<MobileScannerProps> = ({ context_po_id, onClose }) => {
    const navigate = useNavigate();
    const [manualSku, setManualSku] = useState('');
    const [scannedItems, setScannedItems] = useState<any[]>([]);
    const [processing, setProcessing] = useState(false);
    const [isDesktop, setIsDesktop] = useState(window.innerWidth > 768);
    const [poSelectionPrompt, setPoSelectionPrompt] = useState<{ code: string, options: any[] } | null>(null);
    const [successItem, setSuccessItem] = useState<any | null>(null);
    const scannerRef = useRef<Html5QrcodeScanner | null>(null);

    const processingRef = useRef(processing);
    const poSelectionPromptRef = useRef(poSelectionPrompt);
    const successItemRef = useRef(successItem);

    useEffect(() => { processingRef.current = processing; }, [processing]);
    useEffect(() => { poSelectionPromptRef.current = poSelectionPrompt; }, [poSelectionPrompt]);
    useEffect(() => { successItemRef.current = successItem; }, [successItem]);

    useEffect(() => {
        const handleResize = () => setIsDesktop(window.innerWidth > 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Initialize Scanner on Mobile
    useEffect(() => {
        if (!isDesktop && !scannerRef.current) {
            // Small delay to ensure DOM is ready
            setTimeout(() => {
                if (document.getElementById('reader')) {
                    const scanner = new Html5QrcodeScanner(
                        "reader",
                        { fps: 10, qrbox: { width: 250, height: 250 } },
                        /* verbose= */ false
                    );
                    scanner.render(onScanSuccess, onScanFailure);
                    scannerRef.current = scanner;
                }
            }, 500);
        }

        return () => {
            if (scannerRef.current) {
                scannerRef.current.clear().catch(err => console.error("Failed to clear scanner", err));
                scannerRef.current = null;
            }
        };
    }, [isDesktop]);

    const onScanSuccess = (decodedText: string, decodedResult: any) => {
        if (processingRef.current || poSelectionPromptRef.current || successItemRef.current) return;
        console.log(`Code matched = ${decodedText}`, decodedResult);
        handleScan(decodedText);
    };

    const onScanFailure = (_: any) => {
        // handle scan failure
    };

    const handleScan = async (code: string, forcePOId?: number, skipPOCheck?: boolean) => {
        if (processing) return;

        // Prevent duplicate scans of the very last item immediately (simple debounce)
        if (scannedItems.length > 0 && scannedItems[0].code === code && (!forcePOId && !skipPOCheck)) {
            // Optional: Allow re-scan after a delay or just ignore generic quick dupes
            return;
        }

        setProcessing(true);
        try {
            const payload: any = { code };
            if (skipPOCheck) {
                payload.skip_po_check = true;
            } else if (forcePOId) {
                payload.po_id = forcePOId;
            } else if (context_po_id) {
                payload.po_id = context_po_id;
            }

            const res = await fetch('/api/scan/item', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.status === 'multiple_pos') {
                setPoSelectionPrompt({ code: code, options: data.po_options });
                return; // Wait for user selection
            }

            if (data.status === 'received' || data.product) {
                const newItem = {
                    code: code,
                    timestamp: new Date(),
                    title: data.product.title || "Unknown",
                    sku: data.product.sku,
                    image: data.product.image_path ? `/media${data.product.image_path.replace('/app/shared/processed', '')}` : '',
                    status: data.status, // 'scanned' or 'received'
                    po_item: data.po_item
                };

                // Add to start of list (newest first)
                setScannedItems(prev => [newItem, ...prev]);
                setManualSku('');

                setSuccessItem(newItem); // Automatically pop up the modal to pause scanning
            } else {
                alert("Product not found: " + code);
            }

        } catch (err) {
            console.error(err);
            alert("Scan failed");
        } finally {
            setProcessing(false);
        }
    };

    const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            // Logic to upload photo for ML analysis?
            alert("Photo captured! (ML Processing Placeholder)");
        }
    }


    if (isDesktop) {
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white p-8 text-center">
                <div className="bg-white p-4 rounded-xl shadow-2xl mb-6">
                    <QRCode value={window.location.href} size={256} />
                </div>
                <h1 className="text-2xl font-bold mb-2">Scan to Switch to Mobile</h1>
                <p className="text-slate-400 mb-6 max-w-md">
                    Open this page on your phone to use the camera scanner.
                </p>
                {isLocalhost && (
                    <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-lg max-w-md text-left flex gap-3">
                        <span className="material-symbols-outlined text-amber-500">warning</span>
                        <div>
                            <p className="text-amber-400 font-bold text-sm">Localhost Detected</p>
                            <p className="text-amber-200/80 text-xs mt-1">
                                Your phone cannot access "localhost". valid for this PC only.
                                <br />
                                <strong>Action:</strong> Change the URL to your local IP (e.g., <code>192.168.x.x:3000</code>) before scanning.
                            </p>
                        </div>
                    </div>
                )}
                <button onClick={() => onClose ? onClose() : navigate(-1)} className="mt-8 text-slate-500 hover:text-white pb-1 border-b border-transparent hover:border-slate-500 transition-colors">
                    Cancel / Go Back
                </button>
            </div>
        )
    }

    return (
        <div className="relative h-screen w-full flex flex-col bg-background-dark overflow-hidden font-display">
            {/* Camera View */}
            <div className="relative h-[50%] w-full overflow-hidden bg-black flex flex-col">
                <div id="reader" className="w-full h-full object-cover"></div>

                {/* Header */}
                <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent z-10">
                    <button onClick={() => onClose ? onClose() : navigate(-1)} className="flex items-center justify-center size-12 rounded-full bg-black/30 backdrop-blur-md text-white hover:bg-white/10 transition-colors">
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>

                    {context_po_id ? (
                        <div className="bg-emerald-500/20 backdrop-blur-md px-4 py-2 rounded-full text-emerald-400 text-sm font-bold tracking-wide border border-emerald-500/30 flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm">inventory_2</span>
                            PO #{context_po_id}
                        </div>
                    ) : (
                        <div className="bg-black/30 backdrop-blur-md px-4 py-2 rounded-full text-white text-sm font-semibold tracking-wide">SCANNER</div>
                    )}

                    <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handlePhotoCapture}
                        id="cameraInput"
                        className="hidden"
                    />
                    <label htmlFor="cameraInput" className="flex items-center justify-center size-12 rounded-full bg-black/30 backdrop-blur-md text-white cursor-pointer active:scale-95 transition-transform">
                        <span className="material-symbols-outlined">photo_camera</span>
                    </label>
                </div>

                {/* Manual Input Overlay */}
                <div className="absolute bottom-6 left-0 right-0 px-8 z-10">
                    <div className="bg-black/60 backdrop-blur-md rounded-xl p-2 border border-white/10 flex items-center gap-2 shadow-lg">
                        <span className="material-symbols-outlined text-slate-400 pl-2">keyboard</span>
                        <input
                            placeholder="Manual SKU / Barcode"
                            className="bg-transparent border-none text-white placeholder-slate-400 focus:ring-0 w-full text-sm font-mono"
                            value={manualSku}
                            onChange={(e) => setManualSku(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleScan(manualSku)}
                        />
                        <button onClick={() => handleScan(manualSku)} className="bg-white/10 p-2 rounded-lg text-white hover:bg-white/20">
                            <span className="material-symbols-outlined text-sm">arrow_forward</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Bottom Sheet - History List */}
            <div className="relative h-[50%] w-full bg-[#182634] rounded-t-xl shadow-2xl z-20 flex flex-col border-t border-slate-700">
                <div className="flex justify-center p-3">
                    <div className="w-12 h-1.5 bg-slate-700 rounded-full"></div>
                </div>
                <div className="px-4 flex-1 overflow-y-auto pb-4">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-primary/80">Session History ({scannedItems.length})</h3>
                        {scannedItems.length > 0 && (
                            <button onClick={() => setScannedItems([])} className="text-[10px] text-slate-400 hover:text-white">CLEAR</button>
                        )}
                    </div>

                    <div className="space-y-2">
                        {scannedItems.length === 0 ? (
                            <div className="text-center py-8 text-slate-500 text-sm">
                                <p>Ready to scan.</p>
                                <p className="text-xs mt-2 text-slate-600">Items will appear here.</p>
                            </div>
                        ) : (
                            scannedItems.map((item, idx) => (
                                <div key={idx} className={`flex gap-3 p-3 rounded-xl border ${idx === 0 ? 'bg-slate-700/50 border-primary/50' : 'bg-slate-800/30 border-slate-700'} animate-fade-in`}>
                                    <div className="size-16 shrink-0 bg-slate-700 rounded-lg overflow-hidden border border-slate-600">
                                        {item.image ? (
                                            <img src={item.image} className="w-full h-full object-contain" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-slate-500">No Img</div>
                                        )}
                                    </div>
                                    <div className="flex flex-1 flex-col justify-between py-0.5">
                                        <div>
                                            <div className="flex justify-between items-start">
                                                <h2 className="text-sm font-bold leading-tight text-white line-clamp-2">{item.title}</h2>
                                                <span className="text-[10px] text-slate-500 font-mono ml-2 whitespace-nowrap">
                                                    {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-400 mt-0.5 font-mono">{item.sku}</p>
                                        </div>
                                        {item.status === 'received' && (
                                            <div className="flex items-center gap-1 text-emerald-500 font-bold text-[10px] mt-1">
                                                <span className="material-symbols-outlined text-[14px] leading-none">check_circle</span>
                                                RECEIVED
                                                {item.po_item && (
                                                    <span className="text-slate-400 ml-1">
                                                        ({item.po_item.qty_received} / {item.po_item.qty_ordered})
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Multiple PO Selection Modal */}
            {poSelectionPrompt && (
                <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-center items-center p-6">
                    <div className="bg-[#182634] border border-slate-700 w-full max-w-sm rounded-2xl shadow-2xl p-6 animate-fade-in relative max-h-[90vh] flex flex-col">
                        <div className="text-center mb-6 shrink-0">
                            <h2 className="text-xl font-bold text-white">Multiple Orders Found</h2>
                            <p className="text-slate-400 text-sm mt-2">Which purchase order are you receiving this item for?</p>
                        </div>

                        <div className="space-y-3 overflow-y-auto pr-2 flex-1 scrollbar-thin scrollbar-thumb-slate-600">
                            {poSelectionPrompt.options.map((opt: any) => (
                                <button
                                    key={opt.po_id}
                                    onClick={() => {
                                        setPoSelectionPrompt(null);
                                        handleScan(poSelectionPrompt.code, opt.po_id, false);
                                    }}
                                    className="w-full flex items-center justify-between p-4 bg-slate-800/50 hover:bg-emerald-500/20 border border-slate-600 hover:border-emerald-500/50 rounded-xl transition-all group"
                                >
                                    <div className="text-left">
                                        <div className="text-sm font-bold text-white group-hover:text-emerald-400">PO #{opt.po_id}</div>
                                        <div className="text-xs text-slate-400 line-clamp-1">{opt.supplier_name}</div>
                                    </div>
                                    <div className="text-right pl-3 shrink-0">
                                        <div className="text-xs font-mono text-emerald-400 font-bold">MISSING: {opt.missing_qty}</div>
                                    </div>
                                </button>
                            ))}
                        </div>

                        <div className="pt-4 mt-2 shrink-0 border-t border-slate-700/50">
                            <button
                                onClick={() => {
                                    setPoSelectionPrompt(null);
                                    handleScan(poSelectionPrompt.code, undefined, true);
                                }}
                                className="w-full p-4 text-sm font-bold text-slate-400 hover:text-white border border-transparent hover:border-slate-700 hover:bg-slate-800/50 rounded-xl transition-all"
                            >
                                <span className="flex items-center justify-center gap-2">
                                    <span className="material-symbols-outlined text-[18px]">add_circle</span>
                                    Ad-hoc Receive (No PO)
                                </span>
                            </button>
                        </div>

                        <button
                            onClick={() => setPoSelectionPrompt(null)}
                            className="absolute top-4 right-4 text-slate-500 hover:text-white"
                        >
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Success Paused Modal */}
            {successItem && (
                <div className="absolute inset-0 z-[60] bg-black/80 backdrop-blur-sm flex flex-col justify-center items-center p-6">
                    <div className="bg-[#182634] border border-emerald-500/50 w-full max-w-sm rounded-2xl shadow-2xl p-6 animate-fade-in relative flex flex-col items-center text-center">
                        <div className="size-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-4 border border-emerald-500/30">
                            <span className="material-symbols-outlined text-4xl text-emerald-400">check_circle</span>
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">Scan Successful</h2>

                        <div className="bg-slate-800/50 rounded-lg p-4 w-full mb-6 text-left border border-slate-700">
                            <p className="text-sm text-white font-bold mb-1 line-clamp-2">{successItem.title}</p>
                            <p className="text-xs text-slate-400 font-mono mb-2">{successItem.sku}</p>

                            {successItem.po_item && (
                                <div className="mt-2 text-sm bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
                                    <span className="text-emerald-400 font-bold block mb-1">RECEIVED:</span>
                                    <span className="text-white font-mono">{successItem.po_item.qty_received}</span>
                                    <span className="text-slate-500 mx-1">/</span>
                                    <span className="text-slate-400 font-mono">{successItem.po_item.qty_ordered} ordered</span>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={() => setSuccessItem(null)}
                            className="w-full p-4 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-bold rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all flex justify-center items-center gap-2"
                        >
                            <span className="material-symbols-outlined text-[20px]">qr_code_scanner</span>
                            Continue Scanning
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MobileScanner;
