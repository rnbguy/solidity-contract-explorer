import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { ethers, BrowserProvider, JsonRpcProvider, Contract, Interface, isAddress, getAddress } from 'ethers';
import type { AbiItem, PastTransaction, FullTransaction, EthersError } from '../types';
import { ShieldCheckIcon, PlugIcon, EyeIcon, EyeSlashIcon, CheckCircleIcon, XCircleIcon, SpinnerIcon } from './icons';

declare global {
  interface Window {
    ethereum?: any;
  }
}

const FunctionForm: React.FC<{
  abiItem: AbiItem;
  contract: Contract;
  provider: BrowserProvider | JsonRpcProvider;
  onTransactionSent: (tx: PastTransaction) => void;
}> = ({ abiItem, contract, provider, onTransactionSent }) => {
  const [inputs, setInputs] = useState<string[]>(Array(abiItem.inputs.length).fill(''));
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const isWrite = !abiItem.constant;

  const handleInputChange = (index: number, value: string) => {
    const newInputs = [...inputs];
    newInputs[index] = value;
    setInputs(newInputs);
  };

  const execute = async () => {
    setIsLoading(true);
    setError('');
    setResult(null);

    try {
      const args = inputs.map((input, i) => {
          if (abiItem.inputs[i].type.includes('[]')) {
              try {
                  return JSON.parse(input);
              } catch (e) {
                  throw new Error(`Input for ${abiItem.inputs[i].name} must be a valid JSON array string.`);
              }
          }
          return input;
      });

      if (isWrite) {
        if (!window.ethereum) {
          throw new Error('Wallet not found. Please install MetaMask or a similar wallet.');
        }
        const browserProvider = new BrowserProvider(window.ethereum);
        const signer = await browserProvider.getSigner();
        const contractWithSigner = contract.connect(signer) as Contract;
        const tx = await (contractWithSigner[abiItem.name] as any)(...args);
        setResult(`Transaction sent! Hash: ${tx.hash}`);
        onTransactionSent({ hash: tx.hash, method: abiItem.name, timestamp: Date.now() });
      } else {
        const callResult = await (contract[abiItem.name] as any)(...args);
        
        const replacer = (_key: string, value: any) =>
          typeof value === "bigint" ? value.toString() : value;

        if (typeof callResult !== 'object' || callResult === null) {
          setResult(callResult.toString());
        } else {
          setResult(JSON.stringify(callResult, replacer, 2));
        }
      }
    } catch (e: any) {
      const err = e as EthersError;
      console.error(err);
      setError(err.reason || err.message || 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-gray-800 p-4 rounded-lg mb-4 border border-gray-700">
      <h4 className="font-semibold text-lg mb-3 flex items-center">
        {abiItem.name}
        <span className={`ml-2 text-xs font-mono px-2 py-1 rounded-full ${isWrite ? 'bg-orange-500/20 text-orange-300' : 'bg-green-500/20 text-green-300'}`}>
          {isWrite ? 'write' : 'read'}
        </span>
      </h4>
      {abiItem.inputs.map((input, i) => (
        <div key={i} className="mb-2">
          <label className="block text-sm text-gray-400 mb-1">{input.name} ({input.type})</label>
          <input
            type="text"
            value={inputs[i]}
            onChange={(e) => handleInputChange(i, e.target.value)}
            placeholder={`${input.type}`}
            className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
      ))}
      <button
        onClick={execute}
        disabled={isLoading}
        className={`w-full mt-3 px-4 py-2 rounded-md font-semibold transition-colors ${isWrite ? 'bg-orange-500 hover:bg-orange-600' : 'bg-cyan-500 hover:bg-cyan-600'} text-white disabled:bg-gray-600 disabled:cursor-not-allowed`}
      >
        {isLoading ? 'Executing...' : (isWrite ? 'Send Transaction' : 'Query')}
      </button>
      {error && <pre className="mt-3 bg-red-900/50 text-red-300 p-3 rounded-md text-xs whitespace-pre-wrap break-all">{error}</pre>}
      {result && <pre className="mt-3 bg-gray-900 text-gray-300 p-3 rounded-md text-xs whitespace-pre-wrap break-all">{result}</pre>}
    </div>
  );
};


const ContractExplorer: React.FC = () => {
    const [rpcUrl, setRpcUrl] = useState<string>('http://127.0.0.1:8545');
    const [contractAddress, setContractAddress] = useState<string>('');
    const [abi, setAbi] = useState<string>('');
    const [contract, setContract] = useState<Contract | null>(null);
    const [provider, setProvider] = useState<JsonRpcProvider | null>(null);
    const [abiItems, setAbiItems] = useState<AbiItem[]>([]);
    const [error, setError] = useState<string>('');
    const [pastTxs, setPastTxs] = useState<PastTransaction[]>([]);
    const [selectedTx, setSelectedTx] = useState<FullTransaction | null>(null);
    const [isTxModalOpen, setIsTxModalOpen] = useState<boolean>(false);
    const [isWalletAvailable, setIsWalletAvailable] = useState<boolean>(false);
    
    const [bytecode, setBytecode] = useState<string>('');
    const [isValidationLoading, setIsValidationLoading] = useState<boolean>(false);
    const [validationError, setValidationError] = useState<string>('');
    
    const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [validationStatus, setValidationStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [isBytecodeVisible, setIsBytecodeVisible] = useState<boolean>(false);


    useEffect(() => {
        if (typeof window.ethereum !== 'undefined') {
            setIsWalletAvailable(true);
        }
    }, []);

    const validateContract = async () => {
        setIsValidationLoading(true);
        setValidationStatus('idle');
        setValidationError('');
        setBytecode('');
        setIsBytecodeVisible(false);
        try {
            if (!rpcUrl) throw new Error('RPC URL is required.');
            if (!isAddress(contractAddress)) throw new Error('Invalid contract address.');
            const rpcProvider = new JsonRpcProvider(rpcUrl);
            const code = await rpcProvider.getCode(getAddress(contractAddress));
            if (code === '0x') {
                throw new Error('Address is not a contract or does not have bytecode.');
            }
            setBytecode(code);
            setValidationStatus('success');
        } catch (e: any) {
            setValidationError(e.message || 'Failed to validate contract.');
            setValidationStatus('error');
        } finally {
            setIsValidationLoading(false);
        }
    };

    const connectToContract = () => {
        setError('');
        setContract(null);
        setAbiItems([]);
        setConnectionStatus('idle');
        try {
            if (!rpcUrl) throw new Error('RPC URL is required.');
            if (!isAddress(contractAddress)) throw new Error('Invalid contract address.');
            const parsedAbi = JSON.parse(abi);
            if (!Array.isArray(parsedAbi)) throw new Error('ABI must be a JSON array.');
            
            const rpcProvider = new JsonRpcProvider(rpcUrl);
            const newContract = new Contract(getAddress(contractAddress), parsedAbi, rpcProvider);
            const contractInterface = new Interface(parsedAbi);
            
            const functions = contractInterface.fragments.filter(f => f.type === 'function') as AbiItem[];

            setProvider(rpcProvider);
            setContract(newContract);
            setAbiItems(functions);
            setConnectionStatus('success');
        } catch (e: any) {
            setError(e.message || 'Failed to connect to contract.');
            setConnectionStatus('error');
        }
    };

    const handleTransactionSent = useCallback((tx: PastTransaction) => {
        setPastTxs(prev => [tx, ...prev]);
    }, []);
    
    const viewTransaction = async (hash: string) => {
        if (!provider) return;
        try {
            const tx = await provider.getTransaction(hash);
            const receipt = await provider.getTransactionReceipt(hash);
            setSelectedTx({ ...tx, receipt } as FullTransaction);
            setIsTxModalOpen(true);
        } catch (e: any) {
            setError(e.message || "Failed to fetch transaction details.");
        }
    };

    const { readFunctions, writeFunctions } = useMemo(() => {
        return {
            readFunctions: abiItems.filter(item => item.constant),
            writeFunctions: abiItems.filter(item => !item.constant),
        };
    }, [abiItems]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-1">
                <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 sticky top-24">
                    <h2 className="text-xl font-bold mb-4 text-white">Connection</h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">RPC Endpoint</label>
                            <input value={rpcUrl} onChange={e => { setRpcUrl(e.target.value); setValidationStatus('idle'); setConnectionStatus('idle'); setBytecode(''); }} className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Contract Address</label>
                            <input value={contractAddress} onChange={e => { setContractAddress(e.target.value); setValidationStatus('idle'); setConnectionStatus('idle'); setBytecode(''); }} className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Contract ABI (JSON)</label>
                            <textarea value={abi} onChange={e => { setAbi(e.target.value); setConnectionStatus('idle'); }} rows={6} className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono text-xs"></textarea>
                        </div>
                        
                        <div className="flex items-center gap-4 pt-2">
                             <div className="flex items-center gap-2">
                                <button onClick={validateContract} disabled={isValidationLoading} title="Validate Contract Address" className="p-2 bg-gray-600 hover:bg-gray-700 rounded-full text-white transition-colors disabled:bg-gray-500 disabled:cursor-wait">
                                    {isValidationLoading ? <SpinnerIcon /> : <ShieldCheckIcon className="w-5 h-5" />}
                                </button>
                                {validationStatus === 'success' && <CheckCircleIcon className="w-6 h-6 text-green-400" />}
                                {validationStatus === 'error' && <XCircleIcon className="w-6 h-6 text-red-400" />}
                             </div>
                             <div className="flex items-center gap-2">
                                <button onClick={connectToContract} title="Connect with ABI" className="p-2 bg-cyan-600 hover:bg-cyan-700 rounded-full text-white transition-colors">
                                    <PlugIcon className="w-5 h-5" />
                                </button>
                                {connectionStatus === 'success' && <CheckCircleIcon className="w-6 h-6 text-green-400" />}
                                {connectionStatus === 'error' && <XCircleIcon className="w-6 h-6 text-red-400" />}
                            </div>
                            {bytecode && (
                                <button onClick={() => setIsBytecodeVisible(!isBytecodeVisible)} title={isBytecodeVisible ? "Hide Bytecode" : "Show Bytecode"} className="p-2 bg-gray-600 hover:bg-gray-700 rounded-full text-white transition-colors ml-auto">
                                    {isBytecodeVisible ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                                </button>
                            )}
                        </div>

                        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
                        {validationError && <p className="text-red-400 text-sm mt-2">{validationError}</p>}
                        
                        {isBytecodeVisible && bytecode && (
                            <div className="mt-4">
                                <label className="block text-sm text-gray-400 mb-1">Bytecode</label>
                                <textarea
                                    readOnly
                                    value={bytecode}
                                    rows={5}
                                    className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-green-300 font-mono text-xs"
                                />
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 mt-8 sticky top-[28rem]">
                  <h3 className="text-lg font-bold mb-3">Transaction History</h3>
                  <div className="max-h-48 overflow-y-auto">
                    {pastTxs.length === 0 ? <p className="text-gray-400 text-sm">No transactions yet.</p> : (
                      <ul className="space-y-2">
                        {pastTxs.map(tx => (
                          <li key={tx.hash} className="text-sm">
                            <button onClick={() => viewTransaction(tx.hash)} className="text-cyan-400 hover:underline truncate w-full text-left font-mono text-xs">
                              {tx.hash}
                            </button>
                            <div className="text-gray-500 text-xs">{tx.method}() - {new Date(tx.timestamp).toLocaleTimeString()}</div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
            </div>
            <div className="md:col-span-2">
                {contract && provider && connectionStatus === 'success' ? (
                    <div>
                        <div className="mb-8">
                            <h3 className="text-xl font-bold mb-4 border-b border-gray-700 pb-2 text-green-300">Read Functions</h3>
                            {readFunctions.length > 0 ? readFunctions.map(item => <FunctionForm key={item.name} abiItem={item} contract={contract} provider={provider} onTransactionSent={handleTransactionSent} />) : <p className="text-gray-400">No read functions found.</p>}
                        </div>
                        <div>
                            <h3 className="text-xl font-bold mb-4 border-b border-gray-700 pb-2 text-orange-300">Write Functions</h3>
                            {!isWalletAvailable && (
                                <div className="bg-orange-900/50 text-orange-300 p-3 rounded-md text-sm mb-4">
                                    <strong>Wallet Required:</strong> To send transactions (write operations), you need a browser wallet like MetaMask installed and enabled.
                                </div>
                            )}
                            {writeFunctions.length > 0 ? writeFunctions.map(item => <FunctionForm key={item.name} abiItem={item} contract={contract} provider={provider} onTransactionSent={handleTransactionSent} />) : <p className="text-gray-400">No write functions found.</p>}
                        </div>
                    </div>
                ) : <div className="flex items-center justify-center h-full text-gray-500">Connect to a contract to see its functions.</div>}
            </div>
            
            {isTxModalOpen && selectedTx && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setIsTxModalOpen(false)}>
                    <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-cyan-500" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold mb-4">Transaction Details</h2>
                        <pre className="bg-gray-900 p-4 rounded-md text-xs text-gray-300 whitespace-pre-wrap break-all">
                            {JSON.stringify(selectedTx, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2)}
                        </pre>
                        <button onClick={() => setIsTxModalOpen(false)} className="mt-4 bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-4 rounded">Close</button>
                    </div>
                </div>
            )}

        </div>
    );
};

export default ContractExplorer;