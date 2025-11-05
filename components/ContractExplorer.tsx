

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { ethers, BrowserProvider, JsonRpcProvider, Contract, Interface, isAddress, getAddress, ParamType } from 'ethers';
import type { AbiItem, PastTransaction, FullTransaction, EthersError } from '../types';
import { ShieldCheckIcon, PlugIcon, EyeIcon, EyeSlashIcon, CheckCircleIcon, XCircleIcon, SpinnerIcon, WalletIcon, ServerIcon, ClipboardDocumentListIcon, CodeBracketIcon, ClipboardIcon, ClipboardCheckIcon, MinusIcon, PlusIcon, ArrowRightCircleIcon, PaperAirplaneIcon, LinkSlashIcon, TrashIcon } from './icons';

const DEFAULT_RPC_URL = 'http://127.0.0.1:8545';

declare global {
  interface Window {
    ethereum?: any;
  }
}

const buildInitialState = (param: ParamType): any => {
    if (param.isTuple()) {
        const obj: any = {};
        param.components.forEach(p => {
            const key = p.name || param.components.indexOf(p).toString();
            obj[key] = buildInitialState(p);
        });
        return obj;
    }
    if (param.isArray()) {
        return [];
    }
    if (param.type === 'bool') {
        return false;
    }
    return '';
};

const AbiInputRenderer: React.FC<{
    param: ParamType;
    value: any;
    onChange: (value: any) => void;
    path: (string | number)[];
}> = ({ param, value, onChange, path }) => {

    const addArrayElement = () => {
        const newArray = [...(value || [])];
        const newElement = buildInitialState(param.arrayChildren);
        newArray.push(newElement);
        onChange(newArray);
    };

    const removeArrayElement = (index: number) => {
        const newArray = [...(value || [])];
        newArray.splice(index, 1);
        onChange(newArray);
    };

    const handleChildChange = (index: number, childValue: any) => {
        const newArray = [...(value || [])];
        newArray[index] = childValue;
        onChange(newArray);
    };

    if (param.isTuple()) {
        return (
            <div className="pl-4 border-l-2 border-gray-700 ml-2 space-y-3 pt-2">
                {param.components.map((p, i) => {
                     const key = p.name || i.toString();
                     return (
                        <div key={key}>
                            <label className="block text-sm text-gray-400 mb-1">{p.name || `param ${i}`} ({p.type})</label>
                            <AbiInputRenderer 
                                param={p} 
                                value={value?.[key]} 
                                onChange={(newValue) => {
                                    const newTuple = { ...(value || {}) };
                                    newTuple[key] = newValue;
                                    onChange(newTuple);
                                }}
                                path={[...path, key]}
                            />
                        </div>
                    );
                })}
            </div>
        );
    }

    if (param.isArray()) {
        return (
            <div>
                {(value || []).map((item: any, index: number) => (
                    <div key={index} className="flex items-start gap-2 mb-2 p-2 border border-gray-700 rounded-md bg-gray-900/50">
                        <div className="flex-grow">
                             <AbiInputRenderer 
                                param={param.arrayChildren} 
                                value={item} 
                                onChange={(newValue) => handleChildChange(index, newValue)}
                                path={[...path, index]}
                            />
                        </div>
                        <button onClick={() => removeArrayElement(index)} className="mt-1 p-1 text-red-400 hover:text-white hover:bg-red-600/50 rounded-full transition-colors" title="Remove Element">
                            <MinusIcon className="w-4 h-4" />
                        </button>
                    </div>
                ))}
                <button onClick={addArrayElement} className="mt-2 p-1.5 bg-gray-700 hover:bg-gray-600 text-green-400 rounded-md transition-colors" title="Add Element">
                    <PlusIcon className="w-5 h-5" />
                </button>
            </div>
        );
    }
    
    if (param.type === 'bool') {
        return (
             <select
                value={value ? 'true' : 'false'}
                onChange={(e) => onChange(e.target.value === 'true')}
                className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
                <option value="true">true</option>
                <option value="false">false</option>
            </select>
        )
    }

    return (
        <input
            type={param.type.startsWith('uint') || param.type.startsWith('int') ? 'number' : 'text'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`${param.type}`}
            className="w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
        />
    );
};


const FunctionForm: React.FC<{
  abiItem: AbiItem;
  contract: Contract;
  onTransactionSent: (tx: PastTransaction) => void;
  connectedSigner: ethers.Signer | null;
  contractAddress: string;
  rpcUrl: string;
  provider: JsonRpcProvider | null;
}> = ({ abiItem, contract, onTransactionSent, connectedSigner, contractAddress, rpcUrl, provider }) => {
  const [inputs, setInputs] = useState<any[]>(() => abiItem.inputs.map(buildInitialState));
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [castCommand, setCastCommand] = useState('');
  const [copied, setCopied] = useState(false);
  const isWrite = !abiItem.constant;

  useEffect(() => {
    setInputs(abiItem.inputs.map(buildInitialState));
    setResult(null);
    setError('');
  }, [abiItem]);

  const formatCastArg = useCallback((param: ParamType, value: any): string => {
    if (value === undefined || value === null || value === '') {
        // Provide a default value based on type for the command
        if (param.type.startsWith('uint') || param.type.startsWith('int')) return '0';
        if (param.type === 'bool') return 'false';
        if (param.type === 'address') return '0x0000000000000000000000000000000000000000';
        return '""';
    }

    if (param.isTuple()) {
        const values = param.components.map(p => {
            const key = p.name || param.components.indexOf(p).toString();
            return formatCastArg(p, value[key]);
        });
        return `(${values.join(',')})`;
    }
    if (param.isArray()) {
        const items = (value as any[]).map(item => formatCastArg(param.arrayChildren, item));
        return `[${items.join(',')}]`;
    }
    if (param.type === 'string' || param.type === 'bytes') {
        return `"${value.toString().replace(/"/g, '\\"')}"`;
    }
    
    return value.toString();
  }, []);

  useEffect(() => {
    try {
        const argsString = abiItem.inputs
        .map((input, index) => formatCastArg(input, inputs[index]))
        .join(' ');

        const commandType = isWrite ? 'send' : 'call';
        const functionSignature = `${abiItem.name}(${abiItem.inputs.map(i => i.type).join(',')})`;
        
        let command = `cast ${commandType} ${contractAddress || '<CONTRACT_ADDRESS>'} "${functionSignature}" ${argsString}`;
        
        if (rpcUrl) {
            command += ` --rpc-url ${rpcUrl}`;
        }
        if (isWrite && connectedSigner) {
            command += ` --from ${connectedSigner.address}`;
        }

        setCastCommand(command);
    } catch (e) {
        setCastCommand("Error generating command.");
    }
  }, [inputs, abiItem, contractAddress, isWrite, rpcUrl, connectedSigner, formatCastArg]);

  const handleInputChange = useCallback((index: number, value: any) => {
    setInputs(currentInputs => {
        const newInputs = [...currentInputs];
        newInputs[index] = value;
        return newInputs;
    });
  }, []);

  const prepareArgsForEthers = (params: readonly ParamType[], values: any[]): any[] => {
    return params.map((param, index) => {
        const value = values[index];

        if (param.isTuple()) {
            // Ensure components are ordered correctly according to the ABI definition
            const tupleValues = param.components.map(p => {
                const key = p.name || param.components.indexOf(p).toString();
                // Recursively prepare each component of the tuple
                return prepareArgsForEthers([p], [value[key]])[0];
            });
            return tupleValues;
        }

        if (param.isArray()) {
            if (!Array.isArray(value)) return [];
            // Recursively prepare each element of the array
            return value.map((item: any) => {
                return prepareArgsForEthers([param.arrayChildren], [item])[0];
            });
        }
        
        // Convert number-like strings to BigInt for ethers
        if ((param.type.startsWith('uint') || param.type.startsWith('int')) && value !== '' && value != null) {
            try {
                return BigInt(value);
            } catch (e) {
                // Let ethers throw a more specific error if conversion fails
                console.error(`Failed to convert value "${value}" to BigInt for type ${param.type}`);
                return value;
            }
        }

        return value;
    });
  };

  const execute = async () => {
    setIsLoading(true);
    setError('');
    setResult(null);

    try {
        const args = prepareArgsForEthers(abiItem.inputs, inputs);
        
        if (isWrite) {
            if (!connectedSigner || !window.ethereum) {
                throw new Error('Wallet not connected. Please connect your wallet in the "Write" tab.');
            }
            if (!provider) {
                throw new Error('RPC provider unavailable. Please reconnect to the contract.');
            }

            const walletProvider = new BrowserProvider(window.ethereum);
            const walletNetwork = await walletProvider.getNetwork();
            const rpcNetwork = await provider.getNetwork();

            if (walletNetwork.chainId !== rpcNetwork.chainId) {
                const rpcChainIdHex = `0x${rpcNetwork.chainId.toString(16)}`;
                try {
                    await walletProvider.send('wallet_switchEthereumChain', [{ chainId: rpcChainIdHex }]);
                } catch (switchError: any) {
                    if (switchError.code === 4902) { // Chain not added
                        try {
                            await walletProvider.send('wallet_addEthereumChain', [{
                                chainId: rpcChainIdHex,
                                chainName: `Custom RPC (${rpcNetwork.chainId})`,
                                rpcUrls: [rpcUrl],
                                nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                            }]);
                        } catch (addError: any) {
                            throw new Error(`Failed to add network to wallet: ${addError.message || 'User rejected request.'}`);
                        }
                    } else {
                        throw new Error(`Failed to switch network in wallet: ${switchError.message || 'User rejected request.'}`);
                    }
                }
            }

            // Get a fresh signer after potentially switching networks
            const freshSigner = await walletProvider.getSigner();
            const contractWithSigner = contract.connect(freshSigner) as Contract;
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
    <div className="space-y-4">
        <div className="space-y-4">
            {abiItem.inputs.map((input, i) => (
                <div key={i}>
                    <label className="block text-gray-300 mb-1 font-semibold">{input.name} <span className="text-gray-400 font-mono text-xs">({input.type})</span></label>
                    <AbiInputRenderer 
                        param={input}
                        value={inputs[i]}
                        onChange={(value) => handleInputChange(i, value)}
                        path={[i]}
                    />
                </div>
            ))}
        </div>
        <button
            onClick={execute}
            disabled={isLoading}
            title={isLoading ? 'Executing...' : (isWrite ? 'Send Transaction' : 'Query')}
            className={`w-full mt-4 p-2.5 rounded-md font-semibold transition-colors ${isWrite ? 'bg-orange-600 hover:bg-orange-700' : 'bg-cyan-600 hover:bg-cyan-700'} text-white disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center`}
        >
            {isLoading ? (
                <SpinnerIcon className="w-6 h-6" />
            ) : isWrite ? (
                <PaperAirplaneIcon className="w-6 h-6" />
            ) : (
                <ArrowRightCircleIcon className="w-6 h-6" />
            )}
        </button>

      {error && <pre className="mt-3 bg-red-900/50 text-red-300 p-3 rounded-md text-xs whitespace-pre-wrap break-all">{error}</pre>}
      {result && <pre className="mt-3 bg-gray-900 text-gray-300 p-3 rounded-md text-xs whitespace-pre-wrap break-all">{result}</pre>}

      {castCommand && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-400 mb-1">Equivalent `cast` command:</label>
            <div className="relative">
              <pre className="bg-gray-900 text-cyan-300 p-3 pr-10 rounded-md text-xs whitespace-pre-wrap break-all font-mono">
                {castCommand}
              </pre>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(castCommand);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-md"
                title="Copy to clipboard"
              >
                {copied ? <ClipboardCheckIcon className="w-4 h-4" /> : <ClipboardIcon className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}
    </div>
  );
};


const ContractExplorer: React.FC = () => {
    const [rpcUrl, setRpcUrl] = useState<string>(() => localStorage.getItem('rpcUrl') || DEFAULT_RPC_URL);
    const [contractAddress, setContractAddress] = useState<string>(() => localStorage.getItem('contractAddress') || '');
    const [abi, setAbi] = useState<string>(() => localStorage.getItem('abi') || '');

    const [contract, setContract] = useState<Contract | null>(null);
    const [provider, setProvider] = useState<JsonRpcProvider | null>(null);
    const [abiItems, setAbiItems] = useState<AbiItem[]>([]);
    const [error, setError] = useState<string>('');
    const [pastTxs, setPastTxs] = useState<PastTransaction[]>([]);
    const [selectedTx, setSelectedTx] = useState<FullTransaction | null>(null);
    const [isTxModalOpen, setIsTxModalOpen] = useState<boolean>(false);
    
    const [bytecode, setBytecode] = useState<string>('');
    const [isValidationLoading, setIsValidationLoading] = useState<boolean>(false);
    const [validationError, setValidationError] = useState<string>('');
    
    const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [validationStatus, setValidationStatus] = useState<'idle' | 'success' | 'error'>('idle');
    
    const [activeTab, setActiveTab] = useState<'read' | 'write' | 'bytecode'>('read');
    const [selectedReadFn, setSelectedReadFn] = useState<string>('');
    const [selectedWriteFn, setSelectedWriteFn] = useState<string>('');
    const [connectedAccount, setConnectedAccount] = useState<string | null>(null);
    const [connectedSigner, setConnectedSigner] = useState<ethers.Signer | null>(null);
    const [isConnectingWallet, setIsConnectingWallet] = useState<boolean>(false);
    const [isBytecodeCopied, setIsBytecodeCopied] = useState<boolean>(false);

    useEffect(() => {
        localStorage.setItem('rpcUrl', rpcUrl);
        localStorage.setItem('contractAddress', contractAddress);
        localStorage.setItem('abi', abi);
    }, [rpcUrl, contractAddress, abi]);

    const resetStoredValues = useCallback(() => {
        localStorage.removeItem('rpcUrl');
        localStorage.removeItem('contractAddress');
        localStorage.removeItem('abi');

        // Reset inputs to default
        setRpcUrl(DEFAULT_RPC_URL);
        setContractAddress('');
        setAbi('');
        
        // Reset all derived and status states
        setContract(null);
        setProvider(null);
        setAbiItems([]);
        setError('');
        setPastTxs([]);
        setSelectedTx(null);
        setIsTxModalOpen(false);
        setBytecode('');
        setIsValidationLoading(false);
        setValidationError('');
        setConnectionStatus('idle');
        setValidationStatus('idle');
        setActiveTab('read');
        setSelectedReadFn('');
        setSelectedWriteFn('');
    }, []);

    useEffect(() => {
        const checkInitialConnection = async () => {
            if (!window.ethereum) return;
            try {
                const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                if (accounts.length > 0) {
                    const browserProvider = new BrowserProvider(window.ethereum);
                    const signer = await browserProvider.getSigner();
                    setConnectedAccount(accounts[0]);
                    setConnectedSigner(signer);
                }
            } catch (err) {
                console.error("Could not check initial wallet connection:", err);
            }
        };

        const handleAccountsChanged = async (accounts: string[]) => {
            if (accounts.length === 0) {
                setConnectedAccount(null);
                setConnectedSigner(null);
            } else {
                 try {
                    const browserProvider = new BrowserProvider(window.ethereum);
                    const signer = await browserProvider.getSigner();
                    setConnectedAccount(accounts[0]);
                    setConnectedSigner(signer);
                } catch (err) {
                    console.error("Could not handle account change:", err);
                }
            }
        };

        checkInitialConnection();

        if (window.ethereum) {
            window.ethereum.on('accountsChanged', handleAccountsChanged);
        }

        return () => {
            if (window.ethereum) {
                window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
            }
        };
    }, []);

    const connectWallet = async () => {
        if (!window.ethereum) {
            setError('Wallet not found. Please install MetaMask or a similar wallet.');
            return;
        }
        setIsConnectingWallet(true);
        setError('');
        try {
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            if (accounts.length > 0) {
                const browserProvider = new BrowserProvider(window.ethereum);
                const signer = await browserProvider.getSigner();
                setConnectedAccount(accounts[0]);
                setConnectedSigner(signer);
            }
        } catch (e: any) {
            setError(e.message || 'Failed to connect wallet.');
        } finally {
            setIsConnectingWallet(false);
        }
    };

    const disconnectWallet = () => {
        setConnectedAccount(null);
        setConnectedSigner(null);
    };

    const fetchBytecode = useCallback(async () => {
        setIsValidationLoading(true);
        setValidationStatus('idle');
        setValidationError('');
        setBytecode('');
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
    }, [rpcUrl, contractAddress]);

    const validateContract = useCallback(() => {
        fetchBytecode();
    }, [fetchBytecode]);

    const connectToContract = () => {
        setError('');
        setContract(null);
        setAbiItems([]);
        setConnectionStatus('idle');
        setSelectedReadFn('');
        setSelectedWriteFn('');
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
            setActiveTab('read'); 
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
        const reads = abiItems.filter(item => item.constant);
        const writes = abiItems.filter(item => !item.constant);
        if (reads.length > 0 && !selectedReadFn) setSelectedReadFn(reads[0].format());
        if (writes.length > 0 && !selectedWriteFn) setSelectedWriteFn(writes[0].format());
        return { readFunctions: reads, writeFunctions: writes };
    }, [abiItems, connectionStatus]); // Rerun when connection status changes

    const selectedReadAbiItem = useMemo(() => readFunctions.find(f => f.format() === selectedReadFn), [readFunctions, selectedReadFn]);
    const selectedWriteAbiItem = useMemo(() => writeFunctions.find(f => f.format() === selectedWriteFn), [writeFunctions, selectedWriteFn]);

    useEffect(() => {
        if (activeTab === 'bytecode') {
            fetchBytecode();
        }
    }, [activeTab, fetchBytecode]);

    const handleCopyBytecode = async () => {
        if (!bytecode) return;
        try {
            await navigator.clipboard.writeText(bytecode);
            setIsBytecodeCopied(true);
            setTimeout(() => setIsBytecodeCopied(false), 1500);
        } catch (err) {
            console.error('Failed to copy bytecode to clipboard:', err);
        }
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1 space-y-6">
                <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 sticky top-24">
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="relative sm:col-span-2">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <ServerIcon className="h-5 w-5 text-gray-400" />
                                </div>
                                <input placeholder="RPC Endpoint" title="RPC Endpoint" value={rpcUrl} onChange={e => { setRpcUrl(e.target.value); setValidationStatus('idle'); setConnectionStatus('idle'); setBytecode(''); }} className="w-full bg-gray-900 border border-gray-700 rounded-md pl-10 pr-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                            </div>
                            <div className="relative sm:col-span-2">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <ClipboardDocumentListIcon className="h-5 w-5 text-gray-400" />
                                </div>
                                <input placeholder="Contract Address" title="Contract Address" value={contractAddress} onChange={e => { setContractAddress(e.target.value); setValidationStatus('idle'); setConnectionStatus('idle'); setBytecode(''); }} className="w-full bg-gray-900 border border-gray-700 rounded-md pl-10 pr-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                            </div>
                        </div>
                         <div className="relative">
                            <div className="absolute top-3 left-0 pl-3 flex items-center pointer-events-none">
                               <CodeBracketIcon className="h-5 w-5 text-gray-400" />
                            </div>
                            <textarea placeholder="Contract ABI (JSON)" title="Contract ABI (JSON)" value={abi} onChange={e => { setAbi(e.target.value); setConnectionStatus('idle'); }} rows={6} className="w-full bg-gray-900 border border-gray-700 rounded-md pl-10 pr-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono text-xs"></textarea>
                        </div>
                        
                        <div className="flex items-center justify-between gap-4 pt-1">
                            <button onClick={resetStoredValues} title="Clear Saved Inputs" className="p-2 bg-gray-700 hover:bg-gray-600 rounded-full text-white transition-colors">
                                <TrashIcon className="w-5 h-5" />
                            </button>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <button onClick={validateContract} disabled={isValidationLoading} title="Validate Contract Address" className="p-2 bg-gray-700 hover:bg-gray-600 rounded-full text-white transition-colors disabled:opacity-50 disabled:cursor-wait">
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
                            </div>
                        </div>

                        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
                        {validationError && <p className="text-red-400 text-sm mt-2">{validationError}</p>}
                    </div>
                </div>

                <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 sticky top-[33rem]">
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
                    <div className="bg-gray-800 rounded-lg border border-gray-700">
                        <div className="flex border-b border-gray-700">
                           <TabButton title="Read" onClick={() => setActiveTab('read')} isActive={activeTab === 'read'} />
                           <TabButton title="Write" onClick={() => setActiveTab('write')} isActive={activeTab === 'write'} />
                           <TabButton title="Bytecode" onClick={() => setActiveTab('bytecode')} isActive={activeTab === 'bytecode'} />
                        </div>

                        <div className="p-6">
                            {activeTab === 'read' && (
                                <div>
                                    {readFunctions.length > 0 ? (
                                        <>
                                            <select value={selectedReadFn} onChange={e => setSelectedReadFn(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 mb-6 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono">
                                                {readFunctions.map(fn => <option key={fn.format()} value={fn.format()}>{fn.name}</option>)}
                                            </select>
                                            {selectedReadAbiItem && <FunctionForm abiItem={selectedReadAbiItem} contract={contract} onTransactionSent={handleTransactionSent} connectedSigner={null} contractAddress={contractAddress} rpcUrl={rpcUrl} provider={provider} />}
                                        </>
                                    ) : <p className="text-gray-400">No read functions found in ABI.</p>}
                                </div>
                            )}

                             {activeTab === 'write' && (
                                <div>
                                    <div className="flex justify-between items-center mb-6 p-3 bg-gray-900/50 rounded-lg border border-gray-700">
                                        <div className="flex items-center gap-3">
                                            <WalletIcon className={`w-6 h-6 ${connectedAccount ? 'text-green-400' : 'text-gray-500'}`} />
                                            {connectedAccount ? (
                                                <div className="text-sm">
                                                    <span className="text-gray-400">Connected: </span>
                                                    <span className="font-mono text-green-300">{connectedAccount.slice(0, 6)}...{connectedAccount.slice(-4)}</span>
                                                </div>
                                            ) : <span className="text-gray-400">Wallet not connected</span>}
                                        </div>
                                        <button 
                                            onClick={connectedAccount ? disconnectWallet : connectWallet} 
                                            disabled={isConnectingWallet} 
                                            title={connectedAccount ? 'Disconnect Wallet' : 'Connect Wallet'}
                                            className="p-2 bg-cyan-600 hover:bg-cyan-700 rounded-full text-white transition-colors disabled:bg-gray-600 disabled:cursor-wait"
                                        >
                                            {isConnectingWallet ? <SpinnerIcon className="w-5 h-5" /> : (connectedAccount ? <LinkSlashIcon className="w-5 h-5" /> : <PlugIcon className="w-5 h-5" />)}
                                        </button>
                                    </div>
                                    {writeFunctions.length > 0 ? (
                                        <>
                                            <select value={selectedWriteFn} onChange={e => setSelectedWriteFn(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 mb-6 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono">
                                                {writeFunctions.map(fn => <option key={fn.format()} value={fn.format()}>{fn.name}</option>)}
                                            </select>
                                            {selectedWriteAbiItem && <FunctionForm abiItem={selectedWriteAbiItem} contract={contract} onTransactionSent={handleTransactionSent} connectedSigner={connectedSigner} contractAddress={contractAddress} rpcUrl={rpcUrl} provider={provider} />}
                                        </>
                                    ) : <p className="text-gray-400">No write functions found in ABI.</p>}
                                </div>
                            )}

                            {activeTab === 'bytecode' && (
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-xl font-bold">Contract Bytecode</h3>
                                        <button
                                            onClick={handleCopyBytecode}
                                            disabled={!bytecode || isValidationLoading}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-md text-sm text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                            title="Copy bytecode to clipboard"
                                        >
                                            {isBytecodeCopied ? <ClipboardCheckIcon className="w-4 h-4" /> : <ClipboardIcon className="w-4 h-4" />}
                                            {isBytecodeCopied ? 'Copied' : 'Copy'}
                                        </button>
                                    </div>
                                    {isValidationLoading && (
                                        <div className="flex items-center gap-2 text-sm text-gray-300 mb-3">
                                            <SpinnerIcon className="w-4 h-4" />
                                            Fetching bytecode...
                                        </div>
                                    )}
                                    <textarea readOnly value={bytecode} rows={15} className="w-full bg-gray-900 border border-gray-700 rounded-md p-3 text-green-300 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500" placeholder="Enter an RPC endpoint and contract address, then open this tab to load bytecode." />
                                </div>
                            )}
                        </div>
                    </div>
                ) : <div className="flex items-center justify-center h-64 text-gray-500 p-8 bg-gray-800 rounded-lg border border-dashed border-gray-700">Connect to a contract to begin.</div>}
            </div>
            
            {isTxModalOpen && selectedTx && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setIsTxModalOpen(false)}>
                    <div className="bg-gray-800 rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-cyan-500/50" onClick={e => e.stopPropagation()}>
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

const TabButton: React.FC<{ title: string; onClick: () => void; isActive: boolean; disabled?: boolean }> = ({ title, onClick, isActive, disabled }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={`px-5 py-3 font-semibold text-sm transition-colors focus:outline-none focus-visible:bg-gray-700 ${
            isActive
                ? 'border-b-2 border-cyan-400 text-white'
                : 'text-gray-400 hover:bg-gray-700/50 border-b-2 border-transparent'
        } ${disabled ? 'text-gray-600 cursor-not-allowed hover:bg-transparent' : ''}`}
    >
        {title}
    </button>
);


export default ContractExplorer;
