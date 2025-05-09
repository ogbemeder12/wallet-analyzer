import { Connection, PublicKey, ConfirmedSignatureInfo, ParsedTransactionWithMeta } from '@solana/web3.js';
import { EnrichedTransaction, SolanaTransaction, AnomalyDetectionResult, TransactionPath } from '../types';
// import { console } from 'inspector';

// Initialize Solana connection with a reliable RPC endpoint
// Using Helius endpoint with the provided API key
const PRIMARY_ENDPOINT = 'https://mainnet.helius-rpc.com/?api-key=9f96c937-a104-409b-8e1e-2b2d3079335d';

const connection = new Connection(PRIMARY_ENDPOINT, {
  commitment: 'confirmed',
  disableRetryOnRateLimit: true,
  confirmTransactionInitialTimeout: 60000
});

// Fallback endpoints with valid API keys
const FALLBACK_ENDPOINTS = [
  'https://solana-mainnet.g.alchemy.com/v2/9VkGMKYAHNTeIBPbx-tXud9itmUt6c6o',
  'https://solana.getblock.io/7fe3d756-dd3b-428c-a272-6bbb33874225/mainnet/',
  'https://ssc-dao.genesysgo.net/'
];

// Local storage keys
const TRANSACTION_STORAGE_KEY = 'solana-forensics-transactions';
const TRANSACTION_PATHS_KEY = 'solana-forensics-paths';

// Sample address for demo
// const SAMPLE_ADDRESS = 'GVV4cVPRhUf9wQQRbQu9JwQPQkRtFKrNYGPXgxzk5mUC';
const SAMPLE_ADDRESS = '5citGfdNoFvU31CHgwowiZ9dQgxLAuE8jpKNAtfWRq9Z';


/**
 * Format SOL amount to avoid scientific notation and add USD value
 */
export const formatSolAmount = (amount?: number) => {
  if (amount === undefined) return null;

  // Prevent scientific notation by ensuring proper fixed-point representation
  let formattedSol;
  if (Math.abs(amount) < 0.000001) {
    formattedSol = amount.toFixed(9); // More precision for extremely small amounts (like 1e-7)
  } else if (Math.abs(amount) < 0.001) {
    formattedSol = amount.toFixed(7); // More precision for very small amounts
  } else if (Math.abs(amount) < 1) {
    formattedSol = amount.toFixed(6); // Medium precision for small amounts
  } else {
    formattedSol = amount.toFixed(4); // Standard precision for normal amounts
  }

  // Remove trailing zeros after decimal
  formattedSol = formattedSol.replace(/\.?0+$/, '');

  // Calculate approximate USD value (sample rate: $160 per SOL)
  const solPrice = 160; // Approximate SOL price in USD
  const usdValue = amount * solPrice;

  // Format USD with appropriate precision
  let formattedUsd;
  if (Math.abs(usdValue) < 0.00001) {
    formattedUsd = `$${usdValue.toFixed(8)}`;
  } else if (Math.abs(usdValue) < 0.01) {
    formattedUsd = `$${usdValue.toFixed(6)}`;
  } else if (Math.abs(usdValue) < 1) {
    formattedUsd = `$${usdValue.toFixed(4)}`;
  } else {
    formattedUsd = `$${usdValue.toFixed(2)}`;
  }

  return {
    sol: `${formattedSol} SOL`,
    usd: formattedUsd
  };
};

/**
 * Check if an address is a valid Solana address
 */
function isValidSolanaAddress(address: string): boolean {
  // Solana addresses are base58 encoded and typically 32-44 characters
  // They don't start with '0x' (which is common for Ethereum addresses)
  if (address.startsWith('0x')) {
    return false;
  }

  try {
    new PublicKey(address);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Try multiple RPC endpoints to find one that works
 */
async function tryMultipleEndpoints(operation: (conn: Connection) => Promise<any>): Promise<any> {
  // First try with primary connection
  try {
    return await operation(connection);
  } catch (error) {
    console.warn(`Primary endpoint failed: ${error instanceof Error ? error.message : 'Unknown error'}`);

    // Try fallback endpoints
    for (const endpoint of FALLBACK_ENDPOINTS) {
      try {
        const fallbackConnection = new Connection(endpoint, {
          commitment: 'confirmed',
          disableRetryOnRateLimit: true
        });

        console.log(`Trying fallback endpoint: ${endpoint}`);
        return await operation(fallbackConnection);
      } catch (fallbackError) {
        console.warn(`Fallback endpoint ${endpoint} failed: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`);
      }
    }

    // If all endpoints fail, throw the original error
    throw error;
  }
}

/**
 * Get recent transactions for a given wallet address
 */
export async function getTransactions(walletAddress: string, limit: number = 100): Promise<SolanaTransaction[]> {
  try {

    //First, validate that this is a Solana address
    if (!isValidSolanaAddress(walletAddress)) {
      console.error('Invalid Solana address format:', walletAddress);
      throw new Error('Invalid Solana address format. Solana addresses do not start with "0x" and must be base58 encoded.');
    }

    // For real addresses, try to use a proper PublicKey
    const publicKey = new PublicKey(SAMPLE_ADDRESS);



    // // Use localStorage first to avoid rate limits
    // const storedTransactions = getStoredTransactionsForWallet(walletAddress);
    // if (storedTransactions.length > 0) {
    //   console.log('Using cached transactions from local storage');
    //   return storedTransactions.slice(0, limit).map(tx => ({
    //     signature: tx.signature,
    //     slot: tx.slot || 0,
    //     err: tx.err || null,
    //     memo: tx.memo || null,
    //     blockTime: tx.blockTime
    //   }));
    // }

    // Try to fetch from network - for historical data (6 months)
    try {
      // Set the until parameter to current time
      const currentTime = Math.floor(Date.now() / 1000);

      // Calculate 6 months ago in seconds (approximately 180 days)
      const sixMonthsAgo = currentTime - (180 * 24 * 60 * 60);

      // Get transaction signatures with a higher limit for real addresses
      // We'll use before/until parameters to paginate through historical data
      let allSignatures: ConfirmedSignatureInfo[] = [];
      let lastSignature = null;
      let hasMore = true;

      console.log(`Fetching transactions from ${new Date(sixMonthsAgo * 1000)} to ${new Date(currentTime * 1000)}`);

      // Start fetching from current time back to 6 months ago
      while (hasMore && allSignatures.length < limit) {
        const options: any = { limit: 50 }; // Fetch in smaller batches to avoid timeouts

        if (lastSignature) {
          options.before = lastSignature;
        }

        const signatures = await tryMultipleEndpoints(conn =>
          conn.getSignaturesForAddress(publicKey, options)
        );

        if (signatures.length === 0) {
          hasMore = false;
          break;
        }

        // Filter out signatures older than 6 months
        const validSignatures = signatures.filter(sig =>
          (sig.blockTime && sig.blockTime >= sixMonthsAgo)
        );

        if (validSignatures.length === 0) {
          hasMore = false;
          break;
        }

        // const validSignatures = signatures;

        allSignatures = [...allSignatures, ...validSignatures];
        lastSignature = signatures[signatures.length - 1].signature;

        // Break if we've reached signatures older than 6 months
        if (signatures[signatures.length - 1].blockTime &&
          signatures[signatures.length - 1].blockTime < sixMonthsAgo) {
          hasMore = false;
        }

        // Prevent infinite loops by limiting to reasonable pagination
        if (allSignatures.length >= limit) {
          break;
        }
      }

      console.log(`Retrieved ${allSignatures.length} signatures from the network`);
      console.log(allSignatures)
        ;

      if (allSignatures.length === 0) {
        console.log('No signatures found for this address');

        // For non-sample addresses with no transactions, return empty array
        // Do NOT fall back to sample data
        return [];
      }



      return allSignatures.slice(0, limit).map(sig => ({
        signature: sig.signature,
        slot: sig.slot,
        err: sig.err,
        memo: sig.memo ?? null,
        blockTime: sig.blockTime
      }));
    } catch (networkError) {
      console.error('Network error fetching transactions:', networkError);

      // Fallback to sample data ONLY for the sample address
      if (walletAddress === SAMPLE_ADDRESS) {
        console.log('Falling back to sample transaction data for sample address');
        return getSampleTransactionsForDemo();
      }

      // For real addresses, throw the error - DO NOT fallback to sample data
      throw new Error(`API access error: ${networkError instanceof Error ? networkError.message : 'Rate limit or access forbidden. Try again later or try our sample address.'}`);
    }
  } catch (error) {
    console.error('Error fetching transactions:', error);


    // For other addresses, propagate the error
    throw error;
  }
}

// More detailed sample transactions for demo purposes
function getSampleTransactionsForDemo(): SolanaTransaction[] {
  const now = Math.floor(Date.now() / 1000);
  return [
    {
      signature: '5xb5h4Qj7DzLvmv1JjMFxbzBwV4rntLsN64d27QM7XeP4vDRnPnxQAHGJJ8QfMJKQHVdKvvxPPATwZ3gQxVkh9f8',
      slot: 203739123,
      err: null,
      memo: null,
      blockTime: now - 600 // 10 minutes ago
    },
    {
      signature: '4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofM9cNe9uGfmhRLhQXhUFWKGQJaP8X3EKmAKjfPF1HLvZ2uc',
      slot: 203738456,
      err: null,
      memo: null,
      blockTime: now - 1800 // 30 minutes ago
    },
    {
      signature: '3wW4jzHE8hHNvk9GsCMqefJhPuVnfEqXc9kijxgBJ6P6JM1zYVHPuHYCfXY8dYtC1fveLbMbhxLzYDh3QyEZoS9q',
      slot: 203736789,
      err: null,
      memo: null,
      blockTime: now - 3600 // 1 hour ago
    },
    {
      signature: '2KPGEojR81xSYRs5q4JxXJZLzrJNAoPjcP7xWPpwDFnpf4vPT7wH1Gy6yNpviXUoSYNrGHQTKaKaDFbxmMmxE1Q1',
      slot: 203735123,
      err: null,
      memo: null,
      blockTime: now - 7200 // 2 hours ago
    },
    {
      signature: '1MmdkSnGTZQPUJYKswywLDf8HkJzoWhvBJRwmJ2RfLmA4oA8ZwqKs5jE18rAGFn4shsPJLRAxmomQNoE7VpJGE2Z',
      slot: 203734567,
      err: null,
      memo: null,
      blockTime: now - 14400 // 4 hours ago
    },
    {
      signature: '5QxuRvqitpCeM4ETd3Dg9jqBzGG4KXEFsAZfyVXXY4NZ2ZxenTpCkZzXYUJcxNKimPpAJJwmvnLwFKXNLffFHjKb',
      slot: 203730123,
      err: null,
      memo: null,
      blockTime: now - 28800 // 8 hours ago
    },
    {
      signature: '4QWfNt8MZ9EUJ4AJzjC5KNRcLLBCmyXW1PimLG6VDN9LD1VfPQgsFxsXsHoTRD73aGZRWNFxCVdFqioRTWhZ4Ueq',
      slot: 203725678,
      err: null,
      memo: null,
      blockTime: now - 43200 // 12 hours ago
    }
  ];
}

// Sample transactions for demo purposes when API fails
// function getSampleTransactions(): SolanaTransaction[] {
//   return [
//     {
//       signature: '5xb5h4Qj7DzLvmv1JjMFxbzBwV4rntLsN64d27QM7XeP4vDRnPnxQAHGJJ8QfMJKQHVdKvvxPPATwZ3gQxVkh9f8',
//       slot: 203739123,
//       err: null,
//       memo: null,
//       blockTime: Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
//     },
//     {
//       signature: '4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofM9cNe9uGfmhRLhQXhUFWKGQJaP8X3EKmAKjfPF1HLvZ2uc',
//       slot: 203738456,
//       err: null,
//       memo: null,
//       blockTime: Math.floor(Date.now() / 1000) - 7200 // 2 hours ago
//     },
//     {
//       signature: '3wW4jzHE8hHNvk9GsCMqefJhPuVnfEqXc9kijxgBJ6P6JM1zYVHPuHYCfXY8dYtC1fveLbMbhxLzYDh3QyEZoS9q',
//       slot: 203736789,
//       err: null,
//       memo: null,
//       blockTime: Math.floor(Date.now() / 1000) - 14400 // 4 hours ago
//     }
//   ];
// }

// // Get transactions from local storage for a specific wallet
// function getStoredTransactionsForWallet(walletAddress: string): EnrichedTransaction[] {
//   try {
//     const storedTransactions = localStorage.getItem(TRANSACTION_STORAGE_KEY);

//     if (!storedTransactions) return [];

//     const transactions: Record<string, EnrichedTransaction> = JSON.parse(storedTransactions);

//     // Filter transactions where the wallet is either sender or receiver
//     return Object.values(transactions).filter(tx =>
//       tx.parsedInfo?.sender === walletAddress ||
//       tx.parsedInfo?.receiver === walletAddress
//     );
//   } catch (error) {
//     console.error('Error retrieving transactions from storage:', error);
//     return [];
//   }
// }

/**
 * Get detailed information for a transaction
 */
export async function getTransactionDetails(signature: string): Promise<EnrichedTransaction | null> {
  try {
    console.log(`Fetching details for transaction: ${signature}`);

    // Check if we have this transaction in local storage
    const storedTx = getStoredTransaction(signature);
    if (storedTx) {
      console.log('Retrieved transaction from local storage');
      return storedTx;
    }

    // For sample transactions, create mock detailed data
    if (signature.match(/^[1-5]/) && signature.length > 80) {
      console.log('Creating mock transaction details for sample data');
      const mockTx = createMockTransactionDetails(signature);

      // Store in localStorage for future use
      storeTransaction(mockTx);

      return mockTx;
    }

    // Get parsed transaction from blockchain
    const transaction = await tryMultipleEndpoints(conn =>
      conn.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      })
    );

    if (!transaction) {
      console.log('No transaction found on blockchain');
      return null;
    }

    // Create basic transaction info
    const transactionInfo: EnrichedTransaction = {
      signature,
      slot: transaction.slot,
      err: transaction.meta?.err || null,
      memo: null,
      blockTime: transaction.blockTime,
      confirmationStatus: 'finalized',
      parsedInfo: {
        fee: transaction.meta?.fee || 0,
        type: getTransactionType(transaction),
        programId: getPrimaryProgramId(transaction),
      }
    };

    // Extract sender and receiver if possible
    const { from, to, amount } = extractTransferInfo(transaction);
    if (from) transactionInfo.parsedInfo!.sender = from;
    if (to) transactionInfo.parsedInfo!.receiver = to;
    if (amount !== undefined) transactionInfo.parsedInfo!.amount = amount;

    // Add risk assessment
    transactionInfo.riskScore = calculateRiskScore(transactionInfo);
    transactionInfo.isHighRisk = transactionInfo.riskScore > 70;

    // Store transaction in local storage
    storeTransaction(transactionInfo);

    // Process transaction path if sender and receiver are available
    if (from && to && amount !== undefined) {
      processTransactionPath({
        id: `${from}-${to}`,
        source: from,
        target: to,
        amount: amount,
        timestamp: transactionInfo.blockTime || Date.now() / 1000,
        riskScore: transactionInfo.riskScore || 0,
        transactions: [signature]
      });
    }

    return transactionInfo;
  } catch (error) {
    console.error('Error fetching transaction details:', error);
    return null;
  }
}

/**
 * Create mock transaction details for sample data
 */
function createMockTransactionDetails(signature: string): EnrichedTransaction {
  const now = Math.floor(Date.now() / 1000);
  const types = ['transfer', 'token-transfer', 'program-interaction'];
  const type = types[Math.floor(Math.random() * types.length)];

  // Generate deterministic data based on the signature's first character
  const lastChar = signature.charAt(signature.length - 1);
  const charCode = lastChar.charCodeAt(0);

  // Create sample addresses
  const senderPool = [
    'GVV4cVPRhUf9wQQRbQu9JwQPQkRtFKrNYGPXgxzk5mUC',
    '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',
    'DTA7FmUNYuQo2VKkBFj6ZvH9GzKtJ14aDC5XiX7M9wQK'
  ];

  const receiverPool = [
    '3xxDCjN8s6MgNHwdRExRLa6gHmmRTWPnUdzkbKfEgzkj',
    'BVh1GDtWUdiyzQtcnDMV1VatVpbxKw7t4ygVUQBKfmEP',
    '9sHDLXTUHVdPiLZGJzKHfnzNpD7CYvv5kUP8BfbRPbwa'
  ];

  // Select sender and receiver based on signature
  const senderIndex = charCode % senderPool.length;
  const receiverIndex = (charCode + 1) % receiverPool.length;

  const amount = ((charCode % 100) + 1) / 10; // Generate amount between 0.1 and 10 SOL
  const fee = 0.000005; // Standard fee

  // Calculate risk score - higher for larger amounts
  const riskScore = amount > 5 ? 75 : amount > 2 ? 45 : 20;

  // Generate block time within the last 24 hours
  const blockTime = now - (charCode % 24) * 3600;

  // Create the mock transaction
  return {
    signature,
    slot: 200000000 + (charCode * 1000),
    err: null,
    memo: null,
    blockTime,
    confirmationStatus: 'finalized',
    parsedInfo: {
      sender: senderPool[senderIndex],
      receiver: receiverPool[receiverIndex],
      amount,
      fee: fee * 1e9, // In lamports
      type,
      programId: type === 'transfer' ? 'system' : '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin'
    },
    riskScore,
    isHighRisk: riskScore > 70
  };
}

/**
 * Detect anomalies in a set of transactions
 */
export function detectAnomalies(transactions: EnrichedTransaction[]): AnomalyDetectionResult[] {
  const results: AnomalyDetectionResult[] = [];

  // Sort by blockTime for temporal analysis
  const sortedTxs = [...transactions].sort((a, b) =>
    (a.blockTime || 0) - (b.blockTime || 0)
  );

  // Simple thresholds for demo purposes
  const LARGE_AMOUNT_THRESHOLD = 10000; // SOL amount threshold

  for (let i = 0; i < sortedTxs.length; i++) {
    const tx = sortedTxs[i];

    // Check for large amounts
    if (tx.parsedInfo?.amount && tx.parsedInfo.amount > LARGE_AMOUNT_THRESHOLD) {
      results.push({
        transactionSignature: tx.signature,
        anomalyType: 'large-amount',
        riskScore: 75,
        details: `Large transfer of ${tx.parsedInfo.amount} SOL detected`
      });
    }

    // Check for high-frequency trading patterns
    if (i > 0 && i < sortedTxs.length - 1) {
      const prevTx = sortedTxs[i - 1];
      const nextTx = sortedTxs[i + 1];

      if (
        tx.blockTime && prevTx.blockTime && nextTx.blockTime &&
        (tx.blockTime - prevTx.blockTime < 5) && // less than 5 seconds
        (nextTx.blockTime - tx.blockTime < 5)
      ) {
        results.push({
          transactionSignature: tx.signature,
          anomalyType: 'high-frequency',
          riskScore: 65,
          details: 'High-frequency transaction pattern detected'
        });
      }
    }

    // Add suspicious program interactions
    if (tx.parsedInfo?.programId === '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin') { // Serum DEX
      results.push({
        transactionSignature: tx.signature,
        anomalyType: 'suspicious-address',
        riskScore: 60,
        details: 'Interaction with DEX detected'
      });
    }
  }

  return results;
}

// Helper functions

function getTransactionType(transaction: ParsedTransactionWithMeta): string {
  // This is simplified - in a real app, you'd have more sophisticated logic
  if (!transaction.meta || !transaction.transaction) return 'unknown';

  const instructions = transaction.transaction.message.instructions;
  if (!instructions.length) return 'unknown';

  // Check for SOL transfers
  if (instructions.some(ix =>
    typeof ix === 'object' && 'parsed' in ix &&
    ix.parsed?.type === 'transfer' &&
    ix.parsed?.info?.lamports
  )) {
    return 'transfer';
  }

  // Check for token transfers
  if (instructions.some(ix =>
    typeof ix === 'object' && 'programId' in ix &&
    ix.programId.toString() === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
  )) {
    return 'token-transfer';
  }

  return 'program-interaction';
}

function getPrimaryProgramId(transaction: ParsedTransactionWithMeta): string | undefined {
  if (!transaction.transaction) return undefined;

  const instructions = transaction.transaction.message.instructions;
  if (!instructions.length) return undefined;

  // Return the program ID of the first instruction as a simplification
  const firstIx = instructions[0];
  if (typeof firstIx === 'object' && 'programId' in firstIx) {
    return firstIx.programId.toString();
  }

  return undefined;
}

function extractTransferInfo(transaction: ParsedTransactionWithMeta): { from?: string, to?: string, amount?: number } {
  const result: { from?: string, to?: string, amount?: number } = {};

  if (!transaction.meta || !transaction.transaction) return result;

  const instructions = transaction.transaction.message.instructions;

  // Look for native SOL transfers
  for (const ix of instructions) {
    if (typeof ix === 'object' && 'parsed' in ix &&
      ix.parsed?.type === 'transfer' &&
      ix.parsed?.info) {
      const info = ix.parsed.info;
      if (info.source) result.from = info.source;
      if (info.destination) result.to = info.destination;
      if (info.lamports) result.amount = info.lamports / 1e9; // Convert lamports to SOL
      return result;
    }
  }

  // Look for token transfers
  for (const ix of instructions) {
    if (typeof ix === 'object' && 'programId' in ix &&
      ix.programId.toString() === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
      // For token transfers, we'd need more sophisticated parsing
      // This is simplified for the demo
      if (transaction.meta.preTokenBalances &&
        transaction.meta.postTokenBalances) {
        // Identify sender and receiver by comparing pre and post balances
        // Very simplified logic for demo purposes
        return result;
      }
    }
  }

  return result;
}

function calculateRiskScore(transaction: EnrichedTransaction): number {
  // This is a simplified risk scoring algorithm for demonstration
  let score = 0;

  // Larger amounts are higher risk
  if (transaction.parsedInfo?.amount) {
    if (transaction.parsedInfo.amount > 100000) score += 50;
    else if (transaction.parsedInfo.amount > 10000) score += 30;
    else if (transaction.parsedInfo.amount > 1000) score += 15;
  }

  // Certain program interactions may be higher risk
  if (transaction.parsedInfo?.programId) {
    const programId = transaction.parsedInfo.programId;
    // Example high-risk programs (for demonstration only)
    if (programId === '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin') score += 20; // Serum DEX
  }

  // If there was an error, slightly increase risk
  if (transaction.err) score += 10;

  return Math.min(100, score);
}

export const formatAddress = (address: string, length: number = 4): string => {
  if (!address) return '';
  return `${address.substring(0, length)}...${address.substring(address.length - length)}`;
};

export const formatTimestamp = (timestamp: number | null): string => {
  if (!timestamp) return 'Unknown';
  return new Date(timestamp * 1000).toLocaleString();
};

/**
 * Store transaction in local storage
 */
function storeTransaction(transaction: EnrichedTransaction): void {
  try {
    const storedTransactions = localStorage.getItem(TRANSACTION_STORAGE_KEY);
    let transactions: Record<string, EnrichedTransaction> = {};

    if (storedTransactions) {
      transactions = JSON.parse(storedTransactions);
    }

    transactions[transaction.signature] = transaction;

    localStorage.setItem(TRANSACTION_STORAGE_KEY, JSON.stringify(transactions));
  } catch (error) {
    console.error('Error storing transaction:', error);
  }
}

/**
 * Retrieve transaction from local storage
 */
function getStoredTransaction(signature: string): EnrichedTransaction | null {
  try {
    const storedTransactions = localStorage.getItem(TRANSACTION_STORAGE_KEY);

    if (!storedTransactions) return null;

    const transactions: Record<string, EnrichedTransaction> = JSON.parse(storedTransactions);

    return transactions[signature] || null;
  } catch (error) {
    console.error('Error retrieving transaction:', error);
    return null;
  }
}

/**
 * Process and store transaction path
 */
function processTransactionPath(path: TransactionPath): void {
  try {
    const storedPaths = localStorage.getItem(TRANSACTION_PATHS_KEY);
    let paths: Record<string, TransactionPath> = {};

    if (storedPaths) {
      paths = JSON.parse(storedPaths);
    }

    // If path already exists, update it
    if (paths[path.id]) {
      const existingPath = paths[path.id];
      existingPath.amount += path.amount;
      existingPath.riskScore = Math.max(existingPath.riskScore, path.riskScore);

      // Add transaction signature if not already present
      if (!existingPath.transactions.includes(path.transactions[0])) {
        existingPath.transactions.push(path.transactions[0]);
      }

      paths[path.id] = existingPath;
    } else {
      // Otherwise add new path
      paths[path.id] = path;
    }

    localStorage.setItem(TRANSACTION_PATHS_KEY, JSON.stringify(paths));
  } catch (error) {
    console.error('Error processing transaction path:', error);
  }
}

/**
 * Get all stored transaction paths
 */
export function getTransactionPaths(): TransactionPath[] {
  try {
    const storedPaths = localStorage.getItem(TRANSACTION_PATHS_KEY);

    if (!storedPaths) return [];

    const paths: Record<string, TransactionPath> = JSON.parse(storedPaths);

    return Object.values(paths);
  } catch (error) {
    console.error('Error retrieving transaction paths:', error);
    return [];
  }
}

/**
 * Get wallet balance in SOL
 */
export async function getWalletBalance(walletAddress: string): Promise<number> {
  try {
    // First, validate that this is a Solana address
    if (!isValidSolanaAddress(walletAddress)) {
      console.error('Invalid Solana address format:', walletAddress);
      throw new Error('Invalid Solana address format. Solana addresses do not start with "0x" and must be base58 encoded.');
    }

    // For sample address, return a fixed balance
    if (walletAddress === SAMPLE_ADDRESS) {
      return 42.69;
    }

    const publicKey = new PublicKey(walletAddress);
    const balance = await tryMultipleEndpoints(conn =>
      conn.getBalance(publicKey)
    );

    // Convert lamports to SOL (1 SOL = 10^9 lamports)
    return balance / 1_000_000_000;
  } catch (error) {
    console.error('Failed to fetch wallet balance:', error);
    throw error; // Ensure we propagate the error for proper handling
  }
}
