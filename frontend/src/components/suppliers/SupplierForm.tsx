import { useState, useRef, useEffect } from 'react';

interface SupplierFormProps {
    isOpen: boolean;
    onClose: () => void;
    supplierId: number | null;
}

interface MappingConfig {
    header_row: number;
    col_sku: number;
    col_title: number;
    col_barcode: number;
    col_qty: number;
    col_price: number;
    col_brand: number;
}

export default function SupplierForm({ isOpen, onClose, supplierId }: SupplierFormProps) {
    const [name, setName] = useState('');
    const [notes, setNotes] = useState('');
    const [contacts, setContacts] = useState([{ type: 'EMAIL', label: 'Sales', value: '' }]);
    const [mapping, setMapping] = useState<MappingConfig>({ header_row: 0, col_sku: 0, col_title: 0, col_barcode: 0, col_qty: 1, col_price: 2, col_brand: 3 });

    // Wizard State
    const [activeTab, setActiveTab] = useState<'info' | 'mapping'>('info');
    const [previewRows, setPreviewRows] = useState<string[][]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Load supplier data if editing
    useEffect(() => {
        if (supplierId) {
            fetch(`/api/suppliers/${supplierId}`)
                .then(res => {
                    if (!res.ok) throw new Error("Failed to fetch");
                    return res.json();
                })
                .then(data => {
                    setName(data.name);
                    setNotes(data.notes || '');
                    if (data.contacts) setContacts(data.contacts);
                    if (data.mapping_config) setMapping(data.mapping_config);
                })
                .catch(err => console.error(err));
        } else {
            // Reset form for new
            setName('');
            setNotes('');
            setContacts([{ type: 'EMAIL', label: 'Sales', value: '' }]);
            setMapping({ header_row: 0, col_sku: 0, col_title: 0, col_barcode: 0, col_qty: 1, col_price: 2, col_brand: 3 });
        }
    }, [supplierId, isOpen]);

    if (!isOpen) return null;

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.[0]) return;
        const formData = new FormData();
        formData.append('file', e.target.files[0]);

        try {
            const res = await fetch('/api/suppliers/preview-excel', {
                method: 'POST',
                body: formData,
            });
            if (res.ok) {
                const rows = await res.json();
                setPreviewRows(rows || []);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleSubmit = async () => {
        const payload = {
            name,
            notes,
            contacts,
            mapping_config: mapping
        };

        try {
            const url = supplierId ? `/api/suppliers/${supplierId}` : '/api/suppliers';
            const method = supplierId ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) onClose();
            else alert("Error saving supplier");
        } catch (e) {
            alert("Network error");
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay bg-black/80 backdrop-blur-sm">
            <div className="bg-[#1a2632] w-full max-w-4xl rounded-xl shadow-2xl border border-slate-700 flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b border-slate-700 bg-[#223649] flex justify-between items-center">
                    <div className="flex gap-4">
                        <button onClick={() => setActiveTab('info')} className={`text-sm font-bold pb-1 ${activeTab === 'info' ? 'text-white border-b-2 border-primary' : 'text-slate-400'}`}>Basic Info</button>
                        <button onClick={() => setActiveTab('mapping')} className={`text-sm font-bold pb-1 ${activeTab === 'mapping' ? 'text-white border-b-2 border-primary' : 'text-slate-400'}`}>Mapping Wizard</button>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white"><span className="material-symbols-outlined">close</span></button>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    {activeTab === 'info' ? (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Supplier Name</label>
                                <input className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white" value={name} onChange={e => setName(e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Notes</label>
                                <textarea className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white h-20" value={notes} onChange={e => setNotes(e.target.value)} />
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="block text-xs font-bold text-slate-400 uppercase">Contacts</label>
                                    <button onClick={() => setContacts([...contacts, { type: 'EMAIL', label: '', value: '' }])} className="text-primary text-xs">+ Add</button>
                                </div>
                                {contacts.map((c, i) => (
                                    <div key={i} className="flex gap-2 mb-2">
                                        <select className="bg-slate-900 border border-slate-700 rounded text-xs text-white p-2" value={c.type} onChange={e => { const n = [...contacts]; n[i].type = e.target.value; setContacts(n); }}>
                                            <option value="EMAIL">Email</option>
                                            <option value="PHONE">Phone</option>
                                        </select>
                                        <input className="bg-slate-900 border border-slate-700 rounded text-xs text-white p-2 w-24" placeholder="Label" value={c.label} onChange={e => { const n = [...contacts]; n[i].label = e.target.value; setContacts(n); }} />
                                        <input className="bg-slate-900 border border-slate-700 rounded text-xs text-white p-2 flex-1" placeholder="Value" value={c.value} onChange={e => { const n = [...contacts]; n[i].value = e.target.value; setContacts(n); }} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center gap-4 p-4 bg-slate-800 rounded-lg">
                                <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm font-bold">
                                    Upload Template File
                                </button>
                                <input type="file" ref={fileInputRef} hidden accept=".xlsx,.csv" onChange={handleFileUpload} />
                                <p className="text-xs text-slate-400">Upload a sample Excel/CSV to configure column mapping visually.</p>
                            </div>

                            {previewRows.length > 0 && (
                                <div className="border border-slate-700 rounded-lg overflow-hidden">
                                    <div className="p-2 bg-slate-800 text-xs text-slate-300 border-b border-slate-700">
                                        Click a row to set it as <strong>Header Row</strong> (Current: {mapping.header_row + 1})
                                    </div>
                                    <div className="overflow-x-auto max-h-60">
                                        <table className="w-full text-xs text-left border-collapse">
                                            <tbody>
                                                {previewRows.map((row, rIdx) => (
                                                    <tr
                                                        key={rIdx}
                                                        className={`cursor-pointer ${rIdx === mapping.header_row ? 'bg-primary/20 text-white' : 'hover:bg-slate-700 text-slate-400'}`}
                                                        onClick={() => setMapping({ ...mapping, header_row: rIdx })}
                                                    >
                                                        <td className="p-2 border-r border-slate-700 font-mono text-slate-500 w-8">{rIdx + 1}</td>
                                                        {(row || []).map((cell, cIdx) => (
                                                            <td key={cIdx} className="p-2 border-r border-slate-700 whitespace-nowrap max-w-[150px] truncate">{cell}</td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-4 gap-4 p-4 bg-slate-800/50 rounded-lg">
                                {[
                                    { label: 'SKU Column', key: 'col_sku' },
                                    { label: 'Name/Title Column', key: 'col_title' },
                                    { label: 'Barcode Column', key: 'col_barcode' },
                                    { label: 'Quantity Column', key: 'col_qty' },
                                    { label: 'Price Column', key: 'col_price' },
                                    { label: 'Brand Column', key: 'col_brand' }
                                ].map((field) => (
                                    <div key={field.key}>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{field.label}</label>
                                        <select
                                            className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white text-xs"
                                            // @ts-ignore
                                            value={mapping[field.key]}
                                            // @ts-ignore
                                            onChange={(e) => setMapping({ ...mapping, [field.key]: parseInt(e.target.value) })}
                                        >
                                            {previewRows[mapping.header_row]?.map((colName, idx) => (
                                                <option key={idx} value={idx}>{idx}: {colName || `Col ${idx}`}</option>
                                            )) || <option value={0}>Col 0</option>}
                                        </select>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-slate-700 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 rounded text-slate-300 hover:text-white text-sm">Cancel</button>
                    <button onClick={handleSubmit} className="px-4 py-2 rounded bg-primary text-white text-sm font-bold shadow-lg shadow-primary/20">Save Supplier</button>
                </div>
            </div>
        </div>
    );
}
