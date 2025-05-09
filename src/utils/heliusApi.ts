import { EnrichedTransaction, TransactionCluster, WalletFundingAnalysis, FundingSource, RawTransactionData } from '@/types';
import { withRetry } from './apiUtils';
import { toast } from 'sonner';

// Helius API endpoint and key
const HELIUS_API_ENDPOINT = 'https://mainnet.helius-rpc.com';
const HELIUS_API_KEY = import.meta.env.VITE_HELIUS_API_KEY;

if (!HELIUS_API_KEY) {
  console.error('Helius API key is not configured. Please set VITE_HELIUS_API_KEY in your .env file');
  throw new Error('Helius API key is not configured');
}

// Add rate limiting configuration
const RATE_LIMIT = {
  maxRequests: 100,
  timeWindow: 60000, // 1 minute
  currentRequests: 0,
  lastReset: Date.now()
};

function checkRateLimit() {
  const now = Date.now();
  if (now - RATE_LIMIT.lastReset > RATE_LIMIT.timeWindow) {
    RATE_LIMIT.currentRequests = 0;
    RATE_LIMIT.lastReset = now;
  }

  if (RATE_LIMIT.currentRequests >= RATE_LIMIT.maxRequests) {
    throw new Error('Rate limit exceeded. Please try again later.');
  }

  RATE_LIMIT.currentRequests++;
}

interface HeliusResponse {
  result: {
    transaction: RawTransactionData['transaction'];
    meta: RawTransactionData['meta'];
    slot: number;
    blockTime: number;
    confirmationStatus?: 'processed' | 'confirmed' | 'finalized';
  };
}

interface ProgramInstruction {
  programId: string;
  parsed?: {
    type: string;
    instruction?: string;
    info: {
      source?: string;
      destination?: string;
      from?: string;
      to?: string;
      lamports?: number;
      amount?: number;
    };
  };
}

interface TokenAccount {
  account: {
    data: {
      parsed: {
        info: {
          mint: string;
          tokenAmount: {
            amount: string;
            decimals: number;
          };
        };
      };
    };
  };
}

/**
 * Get enhanced transaction data from Helius API with rate limiting and retries
 */
export async function getEnhancedTransactions(
  walletAddress: string,
  limit: number = 25 // Reduced from 100 to 25 for faster loading
): Promise<EnrichedTransaction[]> {
  try {
    console.log(`Fetching enhanced transactions from Helius for wallet: ${walletAddress}`);

    const response = await withRetry(async () => {
      const response = await fetch(`${HELIUS_API_ENDPOINT}/?api-key=${HELIUS_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'helius-enhanced-transactions',
          method: 'getSignaturesForAddress',
          params: [
            walletAddress,
            { limit }
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Helius API error: ${response.status} ${response.statusText}`);
      }

      return response.json();
    });

    // Type check the response
    if (response && typeof response === 'object' && 'error' in response) {
      const errorMsg = typeof response.error === 'object' && response.error !== null && 'message' in response.error
        ? String(response.error.message)
        : 'Unknown error';
      throw new Error(`Helius API error: ${errorMsg}`);
    }

    // Safely extract signatures
    const signatures: Array<{ signature: string }> = [];
    if (response && typeof response === 'object' && 'result' in response && Array.isArray(response.result)) {
      signatures.push(...response.result);
    }

    if (signatures.length === 0) {
      return [];
    }

    // Limit the number of transactions to fetch details for to avoid timeouts
    const maxDetailsToFetch = Math.min(signatures.length, 10);

    // Now get detailed transaction data for these signatures with rate limiting
    const enhancedTransactions = await Promise.all(
      signatures.slice(0, maxDetailsToFetch).map(sig => getEnhancedTransactionDetails(sig.signature))
    );

    // Filter out null values and log results for debugging
    const validTransactions = enhancedTransactions.filter(tx => tx !== null) as EnrichedTransaction[];
    console.log(`Retrieved ${validTransactions.length} valid transactions`);

    return validTransactions;
  } catch (error) {
    console.error('Error fetching enhanced transactions:', error);
    return []; // Return empty array instead of throwing to allow UI to render
  }
}

/**
 * Get detailed transaction data from Helius API with rate limiting and retries
 */
export async function getEnhancedTransactionDetails(
  signature: string
): Promise<EnrichedTransaction | null> {
  try {
    console.log(`Fetching enhanced transaction details from Helius for: ${signature}`);

    const response = await withRetry(async () => {
      const response = await fetch(`${HELIUS_API_ENDPOINT}/?api-key=${HELIUS_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'helius-transaction-details',
          method: 'getTransaction',
          params: [
            signature,
            {
              encoding: 'jsonParsed',
              maxSupportedTransactionVersion: 0
            }
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Helius API error: ${response.status} ${response.statusText}`);
      }

      return response.json() as Promise<HeliusResponse>;
    });

    // Type check the response
    if (response && typeof response === 'object' && 'error' in response) {
      const errorMsg = typeof response.error === 'object' && response.error !== null && 'message' in response.error
        ? String(response.error.message)
        : 'Unknown error';
      throw new Error(`Helius API error: ${errorMsg}`);
    }

    if (!response || typeof response !== 'object' || !('result' in response) || !response.result) {
      return null;
    }

    // Extract transaction details from the API response
    const result = response.result as any;
    const transaction = result.transaction;
    const meta = result.meta;

    // Create an enriched transaction from Helius data
    const enrichedTx: EnrichedTransaction = {
      signature,
      slot: result.slot,
      blockTime: result.blockTime,
      err: meta?.err || null,
      memo: null, // Extract memo if available
      confirmationStatus: result.confirmationStatus || 'finalized',
      parsedInfo: {
        type: getParsedType(transaction, meta),
        fee: meta?.fee || 0,
        programId: getProgramId(transaction)
      }
    };

    // Extract sender, receiver and amount from transaction
    const transferInfo = extractTransferInfo(transaction, meta);
    if (transferInfo.sender) enrichedTx.parsedInfo!.sender = transferInfo.sender;
    if (transferInfo.receiver) enrichedTx.parsedInfo!.receiver = transferInfo.receiver;
    if (transferInfo.amount !== undefined) enrichedTx.parsedInfo!.amount = transferInfo.amount;
    if (transferInfo.rawData) enrichedTx.rawData = transferInfo.rawData;

    // Calculate risk score based on various factors
    enrichedTx.riskScore = calculateTransactionRiskScore(enrichedTx);
    enrichedTx.isHighRisk = enrichedTx.riskScore > 70;

    return enrichedTx;
  } catch (error) {
    console.error('Error fetching enhanced transaction details:', error);
    return null;
  }
}

/**
 * Get wallet balance and token balances from Helius API with rate limiting and retries
 */
export async function getWalletBalances(walletAddress: string): Promise<{
  solBalance: number;
  tokenBalances: Array<{ mint: string; amount: number; decimals: number; }>;
}> {
  try {
    const solBalanceData = await withRetry(async () => {
      const response = await fetch(`${HELIUS_API_ENDPOINT}/?api-key=${HELIUS_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'helius-wallet-balances',
          method: 'getBalance',
          params: [walletAddress],
        }),
      });

      if (!response.ok) {
        throw new Error(`Helius API error: ${response.status} ${response.statusText}`);
      }

      return response.json();
    });

    // Type check the response
    if (solBalanceData && typeof solBalanceData === 'object' && 'error' in solBalanceData) {
      const errorMsg = typeof solBalanceData.error === 'object' && solBalanceData.error !== null && 'message' in solBalanceData.error
        ? String(solBalanceData.error.message)
        : 'Unknown error';
      throw new Error(`Helius API error: ${errorMsg}`);
    }

    // Get SOL balance in lamports and convert to SOL
    let solBalance = 0;
    if (solBalanceData && typeof solBalanceData === 'object' && 'result' in solBalanceData &&
      typeof solBalanceData.result === 'object' && solBalanceData.result !== null &&
      'value' in solBalanceData.result) {
      solBalance = Number(solBalanceData.result.value) / 1_000_000_000;
    }

    // Now fetch token balances with rate limiting
    const tokensData = await withRetry(async () => {
      const response = await fetch(`${HELIUS_API_ENDPOINT}/?api-key=${HELIUS_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'helius-token-balances',
          method: 'getTokenAccountsByOwner',
          params: [
            walletAddress,
            { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
            { encoding: 'jsonParsed' }
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Helius API error: ${response.status} ${response.statusText}`);
      }

      return response.json();
    });

    // Parse token account data
    const tokenBalances: Array<{ mint: string; amount: number; decimals: number }> = [];
    if (tokensData && typeof tokensData === 'object' && 'result' in tokensData &&
      typeof tokensData.result === 'object' && tokensData.result !== null &&
      'value' in tokensData.result && Array.isArray(tokensData.result.value)) {

      tokensData.result.value.forEach((account: TokenAccount) => {
        if (account?.account?.data?.parsed?.info) {
          const parsedInfo = account.account.data.parsed.info;
          tokenBalances.push({
            mint: parsedInfo.mint,
            amount: Number(parsedInfo.tokenAmount.amount) / (10 ** parsedInfo.tokenAmount.decimals),
            decimals: parsedInfo.tokenAmount.decimals
          });
        }
      });
    }

    return {
      solBalance,
      tokenBalances
    };
  } catch (error) {
    console.error('Error fetching wallet balances:', error);
    return { solBalance: 0, tokenBalances: [] };
  }
}

/**
 * Get funding analytics for a wallet from Helius API with rate limiting and retries
 */
export async function getFundingAnalytics(
  walletAddress: string
): Promise<WalletFundingAnalysis | null> {
  try {
    // First get all transactions for the wallet with rate limiting
    // Limit to fewer transactions for faster loading
    const transactions = await getEnhancedTransactions(walletAddress, 20);

    if (transactions.length === 0) {
      return null;
    }

    console.log(`Processing ${transactions.length} transactions for funding analytics`);

    // Calculate total inflow and outflow - fixing the filtering to correctly identify inflows and outflows
    const inflows = transactions.filter(tx =>
      tx.parsedInfo?.receiver === walletAddress &&
      tx.parsedInfo?.amount !== undefined &&
      !isNaN(tx.parsedInfo.amount) &&
      tx.parsedInfo.amount > 0
    );

    const outflows = transactions.filter(tx =>
      tx.parsedInfo?.sender === walletAddress &&
      tx.parsedInfo?.amount !== undefined &&
      !isNaN(tx.parsedInfo.amount) &&
      tx.parsedInfo.amount > 0
    );

    console.log(`Found ${inflows.length} inflow transactions and ${outflows.length} outflow transactions`);

    // Fix: Calculate totals with proper number handling and NaN checks
    const totalInflow = inflows.reduce((sum, tx) => {
      const amount = tx.parsedInfo?.amount;
      return sum + (amount !== undefined && !isNaN(amount) ? amount : 0);
    }, 0);

    const totalOutflow = outflows.reduce((sum, tx) => {
      const amount = tx.parsedInfo?.amount;
      return sum + (amount !== undefined && !isNaN(amount) ? amount : 0);
    }, 0);

    console.log(`Total inflow: ${totalInflow}, Total outflow: ${totalOutflow}`);

    const netBalance = totalInflow - totalOutflow;

    // Sort transactions chronologically
    transactions.sort((a, b) => (a.blockTime || 0) - (b.blockTime || 0));

    // Track balance over time and funding sources
    let runningBalance = 0;
    const sources: Record<string, FundingSource> = {};

    // Create timeline data - with improved filtering and NaN handling
    const timelineData = transactions
      .filter(tx =>
        tx.blockTime !== undefined &&
        tx.parsedInfo?.amount !== undefined &&
        !isNaN(tx.parsedInfo.amount) &&
        tx.parsedInfo.amount > 0
      )
      .map(tx => {
        const isDeposit = tx.parsedInfo?.receiver === walletAddress;
        const counterparty = isDeposit ? tx.parsedInfo?.sender : tx.parsedInfo?.receiver;
        const amount = tx.parsedInfo?.amount || 0;

        // Update running balance
        if (isDeposit) {
          runningBalance += amount;

          // Add or update funding source
          if (tx.parsedInfo?.sender && !sources[tx.parsedInfo.sender]) {
            sources[tx.parsedInfo.sender] = {
              address: tx.parsedInfo.sender,
              amount: amount,
              timestamp: tx.blockTime || 0,
              transactionSignature: tx.signature,
              confidence: 'medium',
              type: 'wallet'
            };
          } else if (tx.parsedInfo?.sender) {
            sources[tx.parsedInfo.sender].amount += amount;
            // Update timestamp if earlier
            if ((tx.blockTime || 0) < sources[tx.parsedInfo.sender].timestamp) {
              sources[tx.parsedInfo.sender].timestamp = tx.blockTime || 0;
              sources[tx.parsedInfo.sender].transactionSignature = tx.signature;
            }
          }
        } else {
          runningBalance -= amount;
        }

        return {
          timestamp: tx.blockTime || 0,
          amount: amount,
          balance: runningBalance,
          source: counterparty,
          isDeposit: isDeposit,
          transactionSignature: tx.signature,
          rawData: tx.rawData // Include raw transaction data if available
        };
      });

    // Get top funding sources
    const topSources = Object.values(sources)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    // Determine source confidence levels based on amount and first seen time
    topSources.forEach(source => {
      const relativeAmount = source.amount / (totalInflow || 1); // Prevent division by zero
      if (relativeAmount > 0.5) {
        source.confidence = 'high';
      } else if (relativeAmount > 0.2) {
        source.confidence = 'medium';
      } else {
        source.confidence = 'low';
      }

      // Add label for known entities
      source.label = getEntityLabel(source.address);
    });

    // Get first deposit info
    const firstDeposit = inflows.length > 0
      ? {
        timestamp: inflows[0].blockTime || 0,
        source: inflows[0].parsedInfo?.sender,
        amount: inflows[0].parsedInfo?.amount || 0,
        transactionSignature: inflows[0].signature
      }
      : undefined;

    const fundingAnalysis = {
      walletAddress,
      topSources,
      totalInflow,
      totalOutflow,
      netBalance,
      timelineData,
      firstDeposit
    };

    console.log('Generated funding analysis:', fundingAnalysis);

    return fundingAnalysis;
  } catch (error) {
    console.error('Error fetching funding analytics:', error);
    return null;
  }
}

/**
 * Detect transaction clusters from transaction data
 */
export async function detectTransactionClusters(
  walletAddress: string | EnrichedTransaction[]
): Promise<TransactionCluster[]> {
  try {
    // Handle either a wallet address string or an array of transactions
    let transactions: EnrichedTransaction[] = [];

    if (typeof walletAddress === 'string') {
      // If walletAddress is a string, fetch transactions for this address
      transactions = await getEnhancedTransactions(walletAddress);
    } else if (Array.isArray(walletAddress)) {
      // If walletAddress is actually an array of transactions, use that directly
      transactions = walletAddress;
    }

    if (transactions.length < 3) {
      return [];
    }

    const clusters: TransactionCluster[] = [];
    const actualWalletAddress = typeof walletAddress === 'string'
      ? walletAddress
      : (transactions[0]?.parsedInfo?.sender || transactions[0]?.parsedInfo?.receiver || '');

    // 1. Address-based clusters (transactions with the same counterparties)
    const counterpartiesMap = new Map<string, EnrichedTransaction[]>();

    transactions.forEach(tx => {
      const counterparty = tx.parsedInfo?.sender === actualWalletAddress
        ? tx.parsedInfo?.receiver
        : tx.parsedInfo?.sender;

      if (counterparty) {
        if (!counterpartiesMap.has(counterparty)) {
          counterpartiesMap.set(counterparty, []);
        }
        counterpartiesMap.get(counterparty)?.push(tx);
      }
    });

    // Find address clusters with multiple transactions
    counterpartiesMap.forEach((txs, counterparty) => {
      if (txs.length >= 3) {
        const totalVolume = txs.reduce((sum, tx) => sum + (tx.parsedInfo?.amount || 0), 0);

        // Calculate risk score based on patterns
        let riskScore = 30; // Base score

        // Higher risk if there are many transactions with the same amount
        const amountCounts = new Map<number, number>();
        txs.forEach(tx => {
          const amount = tx.parsedInfo?.amount || 0;
          amountCounts.set(amount, (amountCounts.get(amount) || 0) + 1);
        });

        // If there are many transactions with identical amounts, increase risk score
        if (Array.from(amountCounts.values()).some(count => count >= 3)) {
          riskScore += 20;
        }

        // Higher risk for large total volume
        if (totalVolume > 100) {
          riskScore += 15;
        }

        clusters.push({
          id: `address-${counterparty}`,
          name: `Transactions with ${getEntityLabel(counterparty) || counterparty.slice(0, 4) + '...'}`,
          type: 'address-based',
          transactions: txs,
          size: txs.length,
          entities: [counterparty],
          riskScore,
          detectionReason: `${txs.length} transactions with the same address, total volume: ${totalVolume.toFixed(2)} SOL`
        });
      }
    });

    // 2. Time-based clusters (transactions occuring in short timeframes)
    const timeWindowMs = 10 * 60 * 1000; // 10 minutes
    const sortedTxs = [...transactions].sort((a, b) => (a.blockTime || 0) - (b.blockTime || 0));

    let currentCluster: EnrichedTransaction[] = [];
    let clusterStartTime = 0;

    sortedTxs.forEach(tx => {
      const txTime = (tx.blockTime || 0) * 1000; // Convert to milliseconds

      if (currentCluster.length === 0) {
        currentCluster = [tx];
        clusterStartTime = txTime;
      } else if (txTime - clusterStartTime <= timeWindowMs) {
        currentCluster.push(tx);
      } else {
        // Check if we have enough transactions to form a cluster
        if (currentCluster.length >= 3) {
          const totalVolume = currentCluster.reduce((sum, tx) => sum + (tx.parsedInfo?.amount || 0), 0);
          const entities = new Set<string>();

          currentCluster.forEach(tx => {
            if (tx.parsedInfo?.sender !== walletAddress && tx.parsedInfo?.sender) {
              entities.add(tx.parsedInfo.sender);
            }
            if (tx.parsedInfo?.receiver !== walletAddress && tx.parsedInfo?.receiver) {
              entities.add(tx.parsedInfo.receiver);
            }
          });

          const startTime = new Date(clusterStartTime).toLocaleString();
          const endTime = new Date(txTime).toLocaleString();

          clusters.push({
            id: `time-${clusterStartTime}`,
            name: `High-Frequency Activity (${startTime})`,
            type: 'time-based',
            transactions: [...currentCluster],
            size: currentCluster.length,
            entities: Array.from(entities),
            riskScore: 40 + Math.min(currentCluster.length * 2, 30), // Higher risk for more transactions in short period
            detectionReason: `${currentCluster.length} transactions within a 10-minute window, total volume: ${totalVolume.toFixed(2)} SOL`
          });
        }

        // Start a new cluster
        currentCluster = [tx];
        clusterStartTime = txTime;
      }
    });

    // Check the last cluster
    if (currentCluster.length >= 3) {
      const totalVolume = currentCluster.reduce((sum, tx) => sum + (tx.parsedInfo?.amount || 0), 0);
      const entities = new Set<string>();

      currentCluster.forEach(tx => {
        if (tx.parsedInfo?.sender !== walletAddress && tx.parsedInfo?.sender) {
          entities.add(tx.parsedInfo.sender);
        }
        if (tx.parsedInfo?.receiver !== walletAddress && tx.parsedInfo?.receiver) {
          entities.add(tx.parsedInfo.receiver);
        }
      });

      const startTime = new Date(clusterStartTime).toLocaleString();

      clusters.push({
        id: `time-${clusterStartTime}`,
        name: `High-Frequency Activity (${startTime})`,
        type: 'time-based',
        transactions: [...currentCluster],
        size: currentCluster.length,
        entities: Array.from(entities),
        riskScore: 40 + Math.min(currentCluster.length * 2, 30),
        detectionReason: `${currentCluster.length} transactions within a 10-minute window, total volume: ${totalVolume.toFixed(2)} SOL`
      });
    }

    // 3. Amount-based clusters (transactions with similar/identical amounts)
    const amountGroups = new Map<string, EnrichedTransaction[]>();

    transactions.forEach(tx => {
      const amount = tx.parsedInfo?.amount || 0;
      if (amount > 0) {
        // Round to 2 decimal places to group similar amounts
        const roundedAmount = Math.round(amount * 100) / 100;
        const key = roundedAmount.toString();

        if (!amountGroups.has(key)) {
          amountGroups.set(key, []);
        }
        amountGroups.get(key)?.push(tx);
      }
    });

    // Find amount clusters with multiple transactions
    amountGroups.forEach((txs, amount) => {
      if (txs.length >= 3) {
        const entities = new Set<string>();

        txs.forEach(tx => {
          if (tx.parsedInfo?.sender !== walletAddress && tx.parsedInfo?.sender) {
            entities.add(tx.parsedInfo.sender);
          }
          if (tx.parsedInfo?.receiver !== walletAddress && tx.parsedInfo?.receiver) {
            entities.add(tx.parsedInfo.receiver);
          }
        });

        // Calculate time span
        const timestamps = txs.map(tx => tx.blockTime || 0);
        const minTime = Math.min(...timestamps);
        const maxTime = Math.max(...timestamps);
        const timeSpanHours = (maxTime - minTime) / 3600;

        // Higher risk for same amount transactions in shorter timespan
        let riskScore = 35;
        if (timeSpanHours < 24) {
          riskScore += 15;
        }
        if (timeSpanHours < 1) {
          riskScore += 25;
        }

        // Higher risk for larger number of transactions with same amount
        if (txs.length > 5) {
          riskScore += 10;
        }

        clusters.push({
          id: `amount-${amount}`,
          name: `Identical Amounts (${parseFloat(amount)} SOL)`,
          type: 'amount-based',
          transactions: txs,
          size: txs.length,
          entities: Array.from(entities),
          riskScore,
          detectionReason: `${txs.length} transactions of ${amount} SOL over ${timeSpanHours.toFixed(1)} hours with ${entities.size} different entities`
        });
      }
    });

    // Sort clusters by risk score (highest first)
    return clusters.sort((a, b) => b.riskScore - a.riskScore);
  } catch (error) {
    console.error('Error detecting transaction clusters:', error);
    return [];
  }
}

// Helper functions

/**
 * Determine the transaction type from transaction data
 */
function getParsedType(transaction: RawTransactionData['transaction'], meta: RawTransactionData['meta']): string {
  if (!transaction || !transaction.message) {
    return 'unknown';
  }

  // Check for system program transfers
  const systemProgramId = '11111111111111111111111111111111';
  const instructions = transaction.message.instructions as ProgramInstruction[];

  for (const ix of instructions) {
    if (ix.programId === systemProgramId && ix.parsed?.type === 'transfer') {
      return 'transfer';
    }

    if (ix.programId === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
      return 'token-transfer';
    }
  }

  return 'program-interaction';
}

/**
 * Extract the primary program ID from a transaction
 */
function getProgramId(transaction: RawTransactionData['transaction']): string | undefined {
  if (!transaction || !transaction.message || !transaction.message.instructions || transaction.message.instructions.length === 0) {
    return undefined;
  }

  return transaction.message.instructions[0].programId;
}

/**
 * Extract transfer information from a transaction
 */
function extractTransferInfo(transaction: RawTransactionData['transaction'], meta: RawTransactionData['meta']): { sender?: string, receiver?: string, amount?: number, rawData?: RawTransactionData } {
  const result: { sender?: string, receiver?: string, amount?: number, rawData?: RawTransactionData } = {
    rawData: { meta, transaction } // Always include raw data for debugging and token transfers
  };

  if (!transaction || !transaction.message || !meta) {
    return result;
  }

  try {
    // Check for system program transfers (SOL transfers)
    const instructions = transaction.message.instructions || [];
    const systemProgramId = '11111111111111111111111111111111';

    // First check pre/post balances to detect transfers
    if (meta.preBalances && meta.postBalances && meta.preBalances.length === meta.postBalances.length) {
      // Find accounts with balance changes
      for (let i = 0; i < meta.preBalances.length; i++) {
        const preBalance = meta.preBalances[i];
        const postBalance = meta.postBalances[i];
        const balanceChange = postBalance - preBalance;

        // If there's a significant balance increase (receiving SOL)
        if (balanceChange > 0 && i < transaction.message.accountKeys.length) {
          const receiverAccount = transaction.message.accountKeys[i];
          result.receiver = receiverAccount;
          // Amount will be set below after checking all accounts
        }

        // If there's a significant balance decrease (sending SOL)
        if (balanceChange < 0 && i < transaction.message.accountKeys.length && i !== 0) {
          // Account 0 is typically the fee payer, so skip that for sender detection
          const senderAccount = transaction.message.accountKeys[i];
          result.sender = senderAccount;
          // Amount will be set below after checking all accounts
        }
      }
    }

    // Look for system program transfer instructions
    for (const ix of instructions) {
      if ((ix.programId === systemProgramId || ix.program === 'system') &&
        (ix.parsed?.type === 'transfer' || ix.parsed?.instruction === 'transfer')) {
        // Extract data from parsed instruction
        if (ix.parsed?.info) {
          result.sender = ix.parsed.info.source || ix.parsed.info.from;
          result.receiver = ix.parsed.info.destination || ix.parsed.info.to;

          // Convert lamports to SOL
          const lamports = ix.parsed.info.lamports || ix.parsed.info.amount;
          if (lamports) {
            result.amount = Number(lamports) / 1_000_000_000;
          }
        }
      }
    }

    // If we still don't have an amount but we found sender/receiver from balance changes
    if (!result.amount && result.sender && result.receiver && meta.preBalances && meta.postBalances) {
      // Try to calculate amount from balance changes
      const senderIndex = transaction.message.accountKeys.indexOf(result.sender);
      const receiverIndex = transaction.message.accountKeys.indexOf(result.receiver);

      if (senderIndex >= 0 && senderIndex < meta.preBalances.length &&
        receiverIndex >= 0 && receiverIndex < meta.postBalances.length) {
        const senderBalanceChange = meta.postBalances[senderIndex] - meta.preBalances[senderIndex];
        const receiverBalanceChange = meta.postBalances[receiverIndex] - meta.preBalances[receiverIndex];

        // Use the positive change as the amount (in SOL)
        if (receiverBalanceChange > 0) {
          result.amount = receiverBalanceChange / 1_000_000_000;
        } else if (senderBalanceChange < 0) {
          // Convert negative to positive
          result.amount = Math.abs(senderBalanceChange) / 1_000_000_000;

          // Adjust for fee
          if (meta.fee) {
            result.amount -= meta.fee / 1_000_000_000;
          }
        }
      }
    }

    // If we still couldn't find a transfer, look for token transfers
    if (!result.amount && meta.preTokenBalances && meta.postTokenBalances) {
      // We have token balance changes, so this might be a token transfer
      result.amount = 1; // Set a default amount for token transfers

      // Try to identify sender and receiver from token balances
      const tokenBalanceChanges = meta.postTokenBalances?.map((post) => {
        const pre = meta.preTokenBalances?.find((pre) =>
          pre.accountIndex === post.accountIndex && pre.mint === post.mint
        );

        if (pre && post) {
          const preAmount = Number(pre.uiTokenAmount.amount);
          const postAmount = Number(post.uiTokenAmount.amount);
          const change = postAmount - preAmount;

          return {
            accountIndex: post.accountIndex,
            address: transaction.message.accountKeys[post.accountIndex],
            mint: post.mint,
            change,
            owner: post.owner
          };
        }
        return null;
      }).filter(Boolean);

      // Find sender (negative change) and receiver (positive change)
      const sender = tokenBalanceChanges.find(change => change && change.change < 0);
      const receiver = tokenBalanceChanges.find(change => change && change.change > 0);

      if (sender) {
        result.sender = sender.owner || sender.address;
      }

      if (receiver) {
        result.receiver = receiver.owner || receiver.address;
      }
    }

    return result;
  } catch (error) {
    console.error("Error extracting transfer info:", error);
    return result;
  }
}

/**
 * Calculate risk score for a transaction
 */
function calculateTransactionRiskScore(transaction: EnrichedTransaction): number {
  let score = 0;

  // Larger transfer amounts have higher risk
  if (transaction.parsedInfo?.amount) {
    const amount = transaction.parsedInfo.amount;
    if (amount > 1000) score += 50;
    else if (amount > 100) score += 30;
    else if (amount > 10) score += 15;
  }

  // Certain program interactions have higher risk
  if (transaction.parsedInfo?.programId) {
    const programId = transaction.parsedInfo.programId;
    // Example high-risk programs (these would be determined based on your security criteria)
    const highRiskPrograms = ['9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin'];
    if (highRiskPrograms.includes(programId)) {
      score += 20;
    }
  }

  // Transactions with errors are slightly higher risk
  if (transaction.err) {
    score += 10;
  }

  return Math.min(100, score);
}

/**
 * Get label for a known entity
 */
function getEntityLabel(address: string): string | undefined {
  // Map of known entities (exchanges, contracts, etc.)
  const knownEntities: Record<string, string> = {
    'MYPTXJLxnU9JoyY7eMN3anXTsCKfQr3dkXLR9RVzYhT': 'Binance',
    '39fEpihLATXPJCQuSiXLUSiCbGchGYjeL39eyXh32KFZ': 'FTX',
    'CEzN7mqP9xoxn2HdyW6fjEJ55YPQpF3XxMjYxsEAcS3W': 'Coinbase',
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDC Contract',
    'So11111111111111111111111111111111111111112': 'Wrapped SOL',
  };

  return knownEntities[address];
}
