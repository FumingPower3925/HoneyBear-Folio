import { useState } from "react";
import Sidebar from "./components/Sidebar";
import "./App.css";

function App() {
  const [selectedAccount, setSelectedAccount] = useState(null);

  return (
    <div className="flex h-screen bg-gray-100 text-gray-900 font-sans">
      <Sidebar onSelectAccount={setSelectedAccount} />
      
      <main className="flex-1 p-8 overflow-y-auto">
        {selectedAccount ? (
          <div>
            <header className="mb-8 border-b border-gray-200 pb-4">
              <h1 className="text-3xl font-bold text-gray-800">{selectedAccount.name}</h1>
              <p className="text-xl text-gray-600 mt-2">
                Balance: <span className="font-semibold text-green-600">${selectedAccount.balance.toFixed(2)}</span>
              </p>
            </header>
            
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-gray-500 italic">Transactions will appear here...</p>
              {/* Placeholder for transaction list */}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <div className="text-6xl mb-4">🐻</div>
            <h2 className="text-2xl font-semibold mb-2">Welcome to HoneyBear Folio</h2>
            <p>Select an account from the sidebar to view details.</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;

