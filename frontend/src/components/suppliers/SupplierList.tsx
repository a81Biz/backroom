import { useState, useEffect } from 'react';
import SupplierForm from './SupplierForm';

interface Supplier {
    id: number;
    name: string;
    notes: string;
    detected_brands: string[];
}

export default function SupplierList() {
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);

    const fetchSuppliers = async () => {
        try {
            const res = await fetch('/api/suppliers');
            if (res.ok) setSuppliers(await res.json());
        } catch (error) {
            console.error(error);
        }
    };

    useEffect(() => {
        fetchSuppliers();
    }, []);

    const handleEdit = (id: number) => {
        setEditingId(id);
        setIsFormOpen(true);
    };

    const handleNew = () => {
        setEditingId(null);
        setIsFormOpen(true);
    };

    return (
        <div className="p-6 bg-[#1a2632] rounded-xl border border-slate-700">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-white">Suppliers</h2>
                <button onClick={handleNew} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">add</span> Add Supplier
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-800/50 border-b border-slate-700">
                            <th className="px-4 py-3 text-xs font-bold uppercase text-slate-400">Name</th>
                            <th className="px-4 py-3 text-xs font-bold uppercase text-slate-400">Detected Brands</th>
                            <th className="px-4 py-3 text-xs font-bold uppercase text-slate-400 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {suppliers.map(sup => (
                            <tr key={sup.id} className="group hover:bg-slate-800/30">
                                <td className="px-4 py-4 font-medium text-white">{sup.name}</td>
                                <td className="px-4 py-4">
                                    <div className="flex flex-wrap gap-1">
                                        {sup.detected_brands && sup.detected_brands.map((brand, i) => (
                                            <span key={i} className="px-2 py-0.5 rounded text-[10px] bg-slate-700 text-slate-300 font-mono">
                                                {brand}
                                            </span>
                                        ))}
                                    </div>
                                </td>
                                <td className="px-4 py-4 text-right">
                                    <button onClick={() => handleEdit(sup.id)} className="text-primary hover:underline text-sm font-medium">Edit</button>
                                </td>
                            </tr>
                        ))}
                        {suppliers.length === 0 && (
                            <tr>
                                <td colSpan={3} className="px-4 py-8 text-center text-slate-500 text-sm">No suppliers found.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {isFormOpen && (
                <SupplierForm
                    isOpen={isFormOpen}
                    onClose={() => { setIsFormOpen(false); fetchSuppliers(); }}
                    supplierId={editingId}
                />
            )}
        </div>
    );
}
