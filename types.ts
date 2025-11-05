import type { InterfaceAbi, FunctionFragment, Result, TransactionResponse, TransactionReceipt } from 'ethers';

export interface AbiItem extends FunctionFragment {}

export interface ContractInteraction {
  abiItem: AbiItem;
  inputs: any[];
}

export interface PastTransaction {
  hash: string;
  method: string;
  timestamp: number;
}

export interface FullTransaction extends TransactionResponse {
    receipt?: TransactionReceipt | null;
}

export type EthersError = {
  code: string;
  message: string;
  reason?: string;
  data?: any;
};

// Fix: Add missing ChatMessage type for the Chatbot component
export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}
