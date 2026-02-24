import { Routes, Route } from 'react-router-dom';
import IngestStudio from './components/views/IngestStudio';
import InventoryManager from './components/views/InventoryManager';
import MobileScanner from './components/views/MobileScanner';
import SyncHub from './components/views/SyncHub';
import SupplierList from './components/suppliers/SupplierList';
import NavHeader from './components/NavHeader';

function App() {
    return (
        <Routes>
            <Route path="/" element={<IngestStudio />} />
            <Route path="/inventory" element={<InventoryManager />} />
            <Route path="/suppliers" element={<div className="h-screen bg-app-dark flex flex-col"><NavHeader /><div className="p-8 max-w-7xl mx-auto w-full"><SupplierList /></div></div>} />
            <Route path="/scanner" element={<MobileScanner />} />
            <Route path="/sync" element={<SyncHub />} />
        </Routes>
    );
}

export default App;
