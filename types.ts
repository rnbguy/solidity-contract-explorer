import type { FunctionFragment, Result, TransactionResponse, TransactionReceipt, ParamType } from 'ethers';

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

// Fix: Add missing ChatMessage type.
export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}
