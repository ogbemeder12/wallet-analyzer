import { PublicKey } from '@solana/web3.js';

export interface SolanaTransaction {
  signature: string;
  slot: number;
  err: Error | null;
  memo: string | null;
  blockTime: number | null;
  confirmationStatus?: 'processed' | 'confirmed' | 'finalized';
}

export interface RawTransactionData {
  meta: {
    err: Error | null;
    fee: number;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances?: Array<{
      accountIndex: number;
      mint: string;
      owner: string;
      uiTokenAmount: {
        amount: string;
        decimals: number;
      };
    }>;
    postTokenBalances?: Array<{
      accountIndex: number;
      mint: string;
      owner: string;
      uiTokenAmount: {
        amount: string;
        decimals: number;
      };
    }>;
  };
  transaction: {
    message: {
      accountKeys: string[];
      instructions: Array<{
        programId: string;
        parsed?: {
          type: string;
          info: {
            source?: string;
            destination?: string;
            from?: string;
            to?: string;
            lamports?: number;
            amount?: number;
          };
        };
      }>;
    };
  };
}

export interface EnrichedTransaction extends SolanaTransaction {
  parsedInfo?: {
    fee?: number;
    sender?: string;
    receiver?: string;
    amount?: number;
    programId?: string;
    type?: string;
    rawData?: {
      tokenTransfers?: Array<{
        mint: string;
        amount: number;
      }>;
    };
  };
  riskScore?: number;
  tags?: string[];
  isHighRisk?: boolean;
  rawData?: RawTransactionData;
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
  anomalyType: string;
  riskScore: number;
  details: string;
  timestamp: number;
  amount?: number;
  programId?: string;
  sender?: string;
  receiver?: string;
}

export interface TransactionPath {
  addresses: string[];
  transactions: string[];
  significance: number;
  type: 'PROGRAM_INTERACTION' | 'TOKEN_FLOW' | 'COMPLEX_FLOW' | 'DIRECT_TRANSFER';
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
    rawData?: RawTransactionData;
  }>;
}

export type EntityType =
  | 'UNKNOWN'
  | 'DEX'
  | 'NFT_MARKETPLACE'
  | 'GAMING'
  | 'DEFI'
  | 'TOKEN_HOLDER'
  | 'ACTIVE_TRADER'
  | 'HIGH_RISK'
  | 'MEDIUM_RISK';

export interface EntityPattern {
  type: EntityType;
  confidence: number;
  evidence: string[];
}
