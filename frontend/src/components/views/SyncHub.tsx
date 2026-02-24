import NavHeader from '../NavHeader';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';

const SyncHub = () => {
    const navigate = useNavigate();
    const [status, setStatus] = useState({ products_ready: 0, orders_pending: 0, last_synced: 'Never' });

    useEffect(() => {
        fetch('/api/sync/status')
            .then(res => res.json())
            .then(data => setStatus(data))
            .catch(err => console.error("Failed to load sync status", err));
    }, []);

    return (
        <div className="relative flex h-screen w-full flex-col bg-app-dark overflow-hidden">
            <NavHeader />
            {/* Dimmed Background Simulation */}
            <div className="flex-1 p-10 space-y-8 opacity-20 grayscale pointer-events-none">
                <div className="h-12 w-64 bg-slate-800 rounded"></div>
                <div className="grid grid-cols-3 gap-6">
                    <div className="h-40 bg-slate-800 rounded-xl"></div>
                    <div className="h-40 bg-slate-800 rounded-xl"></div>
                    <div className="h-40 bg-slate-800 rounded-xl"></div>
                </div>
                <div className="h-96 bg-slate-800 rounded-xl w-full"></div>
            </div>

            {/* Modal Content */}
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay">
                <div className="bg-[#1a2632] w-full max-w-4xl rounded-xl shadow-2xl border border-slate-700 flex flex-col overflow-hidden">
                    <div className="px-8 py-6 border-b border-slate-700 flex justify-between items-center bg-[#1a2632]">
                        <div>
                            <h1 className="text-2xl font-bold text-white">Sync Hub</h1>
                            <p className="text-sm text-slate-400 mt-1">Connect your WooCommerce store with The Backroom inventory.</p>
                        </div>
                        <div className="text-right">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                                Last synced: 2 hours ago
                            </span>
                        </div>
                    </div>
                    <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6 bg-background-dark/50">
                        <div className="bg-[#223649] rounded-xl border border-[#2d465e] p-6 shadow-sm flex flex-col h-full">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                                    <span className="material-symbols-outlined">download</span>
                                </div>
                                <div>
                                    <h3 className="font-bold text-white">Import from WooCommerce</h3>
                                    <p className="text-xs text-slate-400">New orders pending ingestion</p>
                                </div>
                            </div>
                            <div className="flex-1 space-y-2 mt-2">
                                <div className="p-4 text-center text-slate-500 text-xs">
                                    No pending orders
                                </div>
                            </div>
                        </div>
                        <div className="bg-[#223649] rounded-xl border border-[#2d465e] p-6 shadow-sm flex flex-col h-full">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                                    <span className="material-symbols-outlined">upload</span>
                                </div>
                                <div>
                                    <h3 className="font-bold text-white">Push to WooCommerce</h3>
                                    <p className="text-xs text-slate-400">Sync local data to storefront</p>
                                </div>
                            </div>
                            <div className="flex-1 flex flex-col justify-center space-y-4">
                                <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 flex items-center gap-4">
                                    <div className="text-primary"><span className="material-symbols-outlined text-3xl">inventory_2</span></div>
                                    <div>
                                        <div className="text-2xl font-bold text-white leading-none">{status.products_ready}</div>
                                        <div className="text-sm text-slate-400">New Products ready</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="px-8 py-6 bg-[#1a2632] border-t border-slate-700">
                        <button className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 rounded-lg flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-lg shadow-primary/20">
                            <span className="material-symbols-outlined">sync</span>
                            <span className="text-lg">Execute Sync</span>
                        </button>
                        <div className="mt-4 flex justify-center">
                            <button onClick={() => navigate('/')} className="text-sm text-slate-400 hover:text-slate-200 transition-colors">
                                Cancel and return to dashboard
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SyncHub;
