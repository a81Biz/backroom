

interface ManualCropModalProps {
    isOpen: boolean;
    onClose: () => void;
    imageUrl?: string;
}

export default function ManualCropModal({ isOpen, onClose, imageUrl }: ManualCropModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay">
            <div className="bg-[#1a2632] w-full max-w-2xl rounded-xl shadow-2xl border border-slate-700 flex flex-col overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center">
                    <h3 className="text-white font-bold">Manual Crop Adjustment</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div className="p-6 flex flex-col items-center">
                    <div className="relative w-full h-80 bg-black/50 rounded-lg border border-dashed border-slate-600 flex items-center justify-center overflow-hidden">
                        {imageUrl ? (
                            <img src={imageUrl} alt="Crop target" className="max-h-full object-contain opacity-50" />
                        ) : (
                            <span className="text-slate-500">No image selected</span>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-48 h-48 border-2 border-primary shadow-[0_0_0_1000px_rgba(0,0,0,0.5)]"></div>
                            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/50 text-xs">Drag to adjust (Stub)</span>
                        </div>
                    </div>
                    <p className="text-slate-400 text-sm mt-4 text-center">
                        This is a UI stub for the manual cropping tool using Canvas/OpenCV.
                    </p>
                </div>
                <div className="px-6 py-4 bg-[#1a2632] border-t border-slate-700 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg text-slate-300 hover:bg-slate-700 text-sm font-medium">Cancel</button>
                    <button onClick={onClose} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold shadow-lg shadow-primary/20">Apply Crop</button>
                </div>
            </div>
        </div>
    );
}
