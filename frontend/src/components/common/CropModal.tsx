import React, { useState, useRef, useEffect } from 'react';
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { X, Check } from 'lucide-react';

interface CropModalProps {
    isOpen: boolean;
    onClose: () => void;
    imageUrl: string;
    onSave: (crop: PixelCrop) => Promise<void>;
    aspect?: number;
    title?: string;
    initialRect?: number[]; // [x, y, w, h] in pixels
}

function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect: number) {
    return centerCrop(
        makeAspectCrop(
            {
                unit: '%',
                width: 90,
            },
            aspect,
            mediaWidth,
            mediaHeight,
        ),
        mediaWidth,
        mediaHeight,
    )
}

const CropModal: React.FC<CropModalProps> = ({ isOpen, onClose, imageUrl, onSave, aspect, title, initialRect }) => {
    const [crop, setCrop] = useState<Crop>();
    const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
    const imgRef = useRef<HTMLImageElement>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setCrop(undefined);
        setCompletedCrop(undefined);
    }, [isOpen, imageUrl]);

    function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
        const { width, height, naturalWidth, naturalHeight } = e.currentTarget;

        if (initialRect && initialRect.length === 4) {
            // initialRect is [x, y, w, h] in natural pixels.
            // We need to scale it to the displayed image size.
            const scaleX = width / naturalWidth;
            const scaleY = height / naturalHeight;

            const [ix, iy, iw, ih] = initialRect;

            const pixelCrop: PixelCrop = {
                unit: 'px',
                x: ix * scaleX,
                y: iy * scaleY,
                width: iw * scaleX,
                height: ih * scaleY
            };

            setCrop(pixelCrop);
            setCompletedCrop(pixelCrop);
        } else if (aspect) {
            setCrop(centerAspectCrop(width, height, aspect));
        } else {
            setCrop(centerAspectCrop(width, height, 1)); // Default to something visible
        }
    }

    const handleSave = async () => {
        if (!completedCrop || !imgRef.current) return;

        const image = imgRef.current;
        const scaleX = image.naturalWidth / image.width;
        const scaleY = image.naturalHeight / image.height;

        const finalCrop: PixelCrop = {
            unit: 'px',
            x: completedCrop.x * scaleX,
            y: completedCrop.y * scaleY,
            width: completedCrop.width * scaleX,
            height: completedCrop.height * scaleY,
        };

        setSaving(true);
        try {
            await onSave(finalCrop);
            onClose();
        } catch (error) {
            console.error("Save failed", error);
            alert("Failed to save crop");
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-surface-dark border border-white/10 rounded-xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl">
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <h3 className="text-lg font-bold text-white">Crop Image {title && <span className="text-primary ml-2">- {title}</span>}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                <div className="flex-1 overflow-auto p-4 bg-black/50 flex items-center justify-center">
                    {imageUrl ? (
                        <ReactCrop
                            crop={crop}
                            onChange={(_, percentCrop) => setCrop(percentCrop)}
                            onComplete={(c) => setCompletedCrop(c)}
                            aspect={aspect}
                            className="max-h-[70vh] max-w-full"
                        >
                            <img
                                ref={imgRef}
                                alt="Crop target"
                                src={imageUrl}
                                onLoad={onImageLoad}
                                style={{ maxHeight: '70vh' }}
                                className="max-w-full object-contain"
                                crossOrigin="anonymous"
                            />
                        </ReactCrop>
                    ) : (
                        <div className="text-slate-500">No image loaded</div>
                    )}
                </div>
                <div className="p-4 border-t border-white/10 flex justify-end gap-3 bg-surface-dark">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-slate-300 hover:bg-white/5 font-medium transition-colors"
                        disabled={saving}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!completedCrop || saving}
                        className={`px-6 py-2 rounded-lg bg-primary text-white font-bold hover:bg-primary-hover shadow-lg shadow-primary/20 transition-all flex items-center gap-2 ${(!completedCrop || saving) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {saving ? <span className="animate-spin">Wait</span> : <Check className="w-4 h-4" />}
                        Save Crop
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CropModal;
