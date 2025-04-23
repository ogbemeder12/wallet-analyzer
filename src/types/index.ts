import { PublicKey } from '@solana/web3.js';

export interface SolanaTransaction {
  signature: string;
  slot: number;
  err: any | null;
  memo: string | null;
  blockTime: number | null;
  confirmationStatus?: 'processed' | 'confirmed' | 'finalized';
}

export interface EnrichedTransaction extends SolanaTransaction {
  parsedInfo?: {
    fee?: number;
    sender?: string;
    receiver?: string;
    amount?: number;
    programId?: string;
    type?: string;
  };
  riskScore?: number;
  tags?: string[];
  isHighRisk?: boolean;
  rawData?: any; // Add rawData property to store transaction details
}

export interface SearchHistoryItem {
  address: string;
  label?: string;
  timestamp: number;
}

export interface Entity {
  address: string;
  label?: string;
  type: 'exchange' | 'wallet' | 'contract' | 'unknown';
  tags: string[];
  notes?: string;
}

export interface AnomalyDetectionResult {
  transactionSignature: string;
  anomalyType: 'large-amount' | 'unusual-pattern' | 'suspicious-address' | 'high-frequency';
  riskScore: number;
  details: string;
}

export interface TransactionPath {
  id: string;
  source: string;
  target: string;
  amount: number;
  timestamp: number;
  riskScore: number;
  transactions: string[]; // Array of transaction signatures
}

export interface TransactionNode {
  id: string;
  address: string;
  volume: number;
  riskScore: number;
  outgoing: Set<string>;
  incoming: Set<string>;
  type: string;
}

export interface TransactionCluster {
  id: string;
  name: string;
  type: 'address-based' | 'time-based' | 'amount-based';
  transactions: EnrichedTransaction[];
  size: number;
  entities: string[];
  riskScore: number;
  detectionReason: string;
}

export interface FundingSource {
  address: string;
  label?: string;
  type?: 'exchange' | 'wallet' | 'contract' | 'unknown';
  amount: number;
  timestamp: number;
  transactionSignature: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface WalletFundingAnalysis {
  walletAddress: string;
  firstDeposit?: {
    timestamp: number;
    source?: string;
    amount: number;
    transactionSignature: string;
  };
  topSources: FundingSource[];
  totalInflow: number;
  totalOutflow: number;
  netBalance: number;
  timelineData: Array<{
    timestamp: number;
    amount: number;
    balance: number;
    source?: string;
    isDeposit: boolean;
    transactionSignature: string;
    rawData?: any; // Add rawData property to timeline data
  }>;
}
