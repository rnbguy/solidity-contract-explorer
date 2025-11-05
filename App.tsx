
import React from 'react';
import ContractExplorer from './components/ContractExplorer';
import { CubeIcon } from './components/icons';

const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-900 text-gray-200">
      <header className="bg-gray-800/80 backdrop-blur-sm sticky top-0 z-10 border-b border-gray-700">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center py-4">
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <CubeIcon className="w-7 h-7 text-cyan-400" />
              <span>
                Ethereum <span className="text-cyan-400">Contract Explorer</span>
              </span>
            </h1>
          </div>
        </div>
      </header>
      
      <main className="container mx-auto p-4 md:p-8">
        <ContractExplorer />
      </main>
    </div>
  );
};

export default App;