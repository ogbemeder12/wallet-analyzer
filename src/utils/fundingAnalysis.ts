import { Connection, PublicKey } from '@solana/web3.js';
import { EnrichedTransaction, WalletFundingAnalysis, FundingSource } from '@/types';
import { getTransactions, getTransactionDetails, formatTimestamp } from './solanaUtils';

// Local storage key
const FUNDING_ANALYSIS_KEY = 'solana-forensics-funding-analysis';

// Known exchanges and services for source identification
const KNOWN_ENTITIES: Record<string, { name: string, type: 'exchange' | 'wallet' | 'contract' | 'unknown' }> = {
  'MYPTXJLxnU9JoyY7eMN3anXTsCKfQr3dkXLR9RVzYhT': { name: 'Binance', type: 'exchange' },
  '39fEpihLATXPJCQuSiXLUSiCbGchGYjeL39eyXh32KFZ': { name: 'FTX', type: 'exchange' },
  'CEzN7mqP9xoxn2HdyW6fjEJ55YPQpF3XxMjYxsEAcS3W': { name: 'Coinbase', type: 'exchange' },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { name: 'USDC', type: 'contract' },
  'So11111111111111111111111111111111111111112': { name: 'Wrapped SOL', type: 'contract' },
};

/**
 * Analyze the funding sources of a wallet
 */
export async function analyzeFundingHistory(
  walletAddress: string, 
  maxTransactions: number = 50 // Changed from 100 to 50 for faster loading
): Promise<WalletFundingAnalysis> {
  try {
    console.log(`Analyzing funding history for wallet: ${walletAddress}`);
    
    // Check if we have this analysis cached
    const cachedAnalysis = getCachedAnalysis(walletAddress);
    if (cachedAnalysis) {
      console.log('Retrieved funding analysis from cache');
      return cachedAnalysis;
    }
    
    // Get all transactions for the wallet
    const txList = await getTransactions(walletAddress, maxTransactions);
    
    // Enrich transactions with details - process in small batches to avoid rate limits
    const transactions: EnrichedTransaction[] = [];
    const batchSize = 3; // Smaller batch size to avoid rate limits
    
    for (let i = 0; i < txList.length; i += batchSize) {
      const batch = txList.slice(i, i + batchSize);
      const detailedTxPromises = batch.map(tx => getTransactionDetails(tx.signature));
      
      try {
        const batchResults = await Promise.all(detailedTxPromises);
        transactions.push(...batchResults.filter(tx => tx !== null) as EnrichedTransaction[]);
        
        // Small delay between batches to reduce API pressure
        if (i + batchSize < txList.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (batchError) {
        console.error(`Error processing transaction batch ${i}-${i+batchSize}:`, batchError);
      }
    }
    
    // Sort transactions chronologically (oldest first)
    transactions.sort((a, b) => (a.blockTime || 0) - (b.blockTime || 0));
    
    // Setup analysis structure
    const analysis: WalletFundingAnalysis = {
      walletAddress,
      topSources: [],
      totalInflow: 0,
      totalOutflow: 0,
      netBalance: 0,
      timelineData: []
    };
    
    // Track balance over time
    let runningBalance = 0;
    
    // Track funding sources
    const sources: Record<string, FundingSource> = {};
    
    // Process each transaction
    for (const tx of transactions) {
      if (!tx.parsedInfo) continue;
      
      const { sender, receiver, amount } = tx.parsedInfo;
      
      if (!sender || !receiver || amount === undefined) continue;
      
      const isInbound = receiver === walletAddress;
      const counterparty = isInbound ? sender : receiver;
      const timestamp = tx.blockTime || 0;
      
      // Update running balance
      if (isInbound) {
        runningBalance += amount;
        analysis.totalInflow += amount;
        
        // Record the first deposit if not already set
        if (!analysis.firstDeposit) {
          analysis.firstDeposit = {
            timestamp,
            source: sender,
            amount,
            transactionSignature: tx.signature
          };
        }
        
        // Add or update funding source
        if (!sources[sender]) {
          sources[sender] = {
            address: sender,
            amount,
            timestamp,
            transactionSignature: tx.signature,
            confidence: 'medium',
            label: KNOWN_ENTITIES[sender]?.name,
            type: KNOWN_ENTITIES[sender]?.type || 'unknown'
          };
        } else {
          sources[sender].amount += amount;
          // Update timestamp if this is earlier than the recorded one
          if (timestamp < sources[sender].timestamp) {
            sources[sender].timestamp = timestamp;
            sources[sender].transactionSignature = tx.signature;
          }
        }
      } else {
        runningBalance -= amount;
        analysis.totalOutflow += amount;
      }
      
      // Add to timeline with raw transaction data for token transfers
      analysis.timelineData.push({
        timestamp,
        amount,
        balance: runningBalance,
        source: counterparty,
        isDeposit: isInbound,
        transactionSignature: tx.signature,
        rawData: tx.rawData // Include raw data for token transfers if available
      });
    }
    
    // Calculate net balance
    analysis.netBalance = analysis.totalInflow - analysis.totalOutflow;
    
    // Get top funding sources
    analysis.topSources = Object.values(sources)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
    
    // Assign confidence levels based on amount and frequency
    analysis.topSources.forEach(source => {
      // This is a simplified heuristic
      const txCount = transactions.filter(
        tx => tx.parsedInfo?.sender === source.address && tx.parsedInfo?.receiver === walletAddress
      ).length;
      
      if (txCount > 3 || source.amount > analysis.totalInflow * 0.5) {
        source.confidence = 'high';
      } else if (txCount > 1 || source.amount > analysis.totalInflow * 0.2) {
        source.confidence = 'medium';
      } else {
        source.confidence = 'low';
      }
    });
    
    // Store analysis in cache
    cacheAnalysis(walletAddress, analysis);
    
    return analysis;
  } catch (error) {
    console.error('Error analyzing funding history:', error);
    // Return empty analysis instead of throwing
    return {
      walletAddress,
      topSources: [],
      totalInflow: 0,
      totalOutflow: 0,
      netBalance: 0,
      timelineData: []
    };
  }
}

/**
 * Store analysis in local storage
 */
function cacheAnalysis(walletAddress: string, analysis: WalletFundingAnalysis): void {
  try {
    const cachedAnalyses = localStorage.getItem(FUNDING_ANALYSIS_KEY);
    let analyses: Record<string, WalletFundingAnalysis> = {};
    
    if (cachedAnalyses) {
      analyses = JSON.parse(cachedAnalyses);
    }
    
    analyses[walletAddress] = analysis;
    
    localStorage.setItem(FUNDING_ANALYSIS_KEY, JSON.stringify(analyses));
  } catch (error) {
    console.error('Error caching funding analysis:', error);
  }
}

/**
 * Retrieve analysis from local storage
 */
function getCachedAnalysis(walletAddress: string): WalletFundingAnalysis | null {
  try {
    const cachedAnalyses = localStorage.getItem(FUNDING_ANALYSIS_KEY);
    
    if (!cachedAnalyses) return null;
    
    const analyses: Record<string, WalletFundingAnalysis> = JSON.parse(cachedAnalyses);
    
    return analyses[walletAddress] || null;
  } catch (error) {
    console.error('Error retrieving cached funding analysis:', error);
    return null;
  }
}
