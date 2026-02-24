import { Routes, Route, Navigate } from 'react-router-dom';
import InventoryManager from './components/views/InventoryManager';
import MobileScanner from './components/views/MobileScanner';
import SupplierList from './components/suppliers/SupplierList';
import NavHeader from './components/NavHeader';

function App() {
    return (
        <Routes>
            <Route path="/" element={<Navigate to="/inventory" replace />} />
            <Route path="/inventory" element={<InventoryManager />} />
            <Route path="/suppliers" element={<div className="h-screen bg-app-dark flex flex-col"><NavHeader /><div className="p-8 max-w-7xl mx-auto w-full"><SupplierList /></div></div>} />
            <Route path="/scanner" element={<MobileScanner />} />
        </Routes>
    );
}

export default App;
