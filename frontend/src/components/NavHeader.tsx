import { Link, useLocation } from 'react-router-dom';

export default function NavHeader() {
    const location = useLocation();
    const activeTab = location.pathname === '/' ? 'ingest'
        : location.pathname.startsWith('/inventory') ? 'inventory'
            : location.pathname.startsWith('/suppliers') ? 'suppliers'
                : location.pathname.startsWith('/sync') ? 'sync'
                    : '';

    return (
        <header className="flex items-center justify-between border-b border-border-dark px-6 py-3 bg-surface-dark/50 backdrop-blur-md shrink-0">
            <div className="flex items-center gap-8">
                <Link to="/" className="flex items-center gap-3">
                    <div className="bg-primary p-1.5 rounded-lg">
                        <span className="material-symbols-outlined text-white text-xl leading-none">database</span>
                    </div>
                    <h1 className="text-white text-lg font-bold tracking-tight">The Backroom</h1>
                </Link>
                <nav className="flex items-center gap-6">
                    <Link to="/" className={`${activeTab === 'ingest' ? 'text-primary border-b-2 border-primary mt-4 -mb-4' : 'text-slate-400 hover:text-white'} text-sm font-semibold transition-all pb-4`}>Ingest Studio</Link>
                    <Link to="/inventory" className={`${activeTab === 'inventory' ? 'text-primary border-b-2 border-primary mt-4 -mb-4' : 'text-slate-400 hover:text-white'} text-sm font-semibold transition-all pb-4`}>Inventory</Link>
                    <Link to="/suppliers" className={`${activeTab === 'suppliers' ? 'text-primary border-b-2 border-primary mt-4 -mb-4' : 'text-slate-400 hover:text-white'} text-sm font-semibold transition-all pb-4`}>Suppliers</Link>
                    <Link to="/sync" className={`${activeTab === 'sync' ? 'text-primary border-b-2 border-primary mt-4 -mb-4' : 'text-slate-400 hover:text-white'} text-sm font-semibold transition-all pb-4`}>Sync Hub</Link>
                    <Link to="/scanner" className="text-slate-400 hover:text-white text-sm font-medium transition-colors">Mobile</Link>
                </nav>
            </div>
            <div className="flex items-center gap-4">
                <div className="relative flex items-center">
                    <span className="material-symbols-outlined absolute left-3 text-slate-500 text-lg">search</span>
                    <input className="bg-surface-dark border-border-dark rounded-lg pl-10 pr-4 py-1.5 text-sm w-64 focus:ring-1 focus:ring-primary focus:border-primary transition-all text-white" placeholder="Search catalogs..." type="text" />
                </div>
                <button className="p-2 hover:bg-surface-dark rounded-lg text-slate-400 hover:text-white transition-colors">
                    <span className="material-symbols-outlined">notifications</span>
                </button>
                <div className="h-8 w-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
                    <span className="text-primary text-xs font-bold">JD</span>
                </div>
            </div>
        </header>
    );
}
