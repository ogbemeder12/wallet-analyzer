
import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EnrichedTransaction, WalletFundingAnalysis } from '@/types';
import EntityAnalysis from './EntityAnalysis';
import TransactionClusters from './TransactionClusters';
import TransactionFlow from './TransactionFlow';
import FundingSources from './FundingSources';
import FundingTimeline from './FundingTimeline';
import WalletFundingPanel from './WalletFundingPanel';
import { getFundingAnalytics, detectTransactionClusters, getEnhancedTransactions } from '@/utils/heliusApi';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface AnalyticsViewProps {
  walletAddress: string;
  transactions: EnrichedTransaction[];
  isLoading: boolean;
  onViewDetails?: (signature: string) => void;
}

const AnalyticsView: React.FC<AnalyticsViewProps> = ({ 
  walletAddress, 
  transactions: initialTransactions, 
  isLoading: initialLoading,
  onViewDetails = () => {} 
}) => {
  const [flowExpanded, setFlowExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('entities');
  const [fundingData, setFundingData] = useState<WalletFundingAnalysis | null>(null);
  const [heliusLoading, setHeliusLoading] = useState(false);
  const [transactionClusters, setTransactionClusters] = useState<any[]>([]);
  const [clustersLoading, setClustersLoading] = useState(false);
  const [transactions, setTransactions] = useState<EnrichedTransaction[]>(initialTransactions);
  const [dataFetched, setDataFetched] = useState(false);
  const [dataFetchAttempted, setDataFetchAttempted] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!walletAddress || initialLoading || dataFetchAttempted) {
        return;
      }

      console.log("Starting data fetch for wallet:", walletAddress);
      setHeliusLoading(true);
      setDataFetchAttempted(true);
      setFetchError(null);
      
      // Declare partialFundingData at the top level of the function scope
      let partialFundingData: WalletFundingAnalysis | null = null;
      
      try {
        // Force new data fetch directly from the API rather than using cached data
        const fetchPromise = getEnhancedTransactions(walletAddress, 15);
        const timeoutPromise = new Promise<EnrichedTransaction[]>((_, reject) => {
          setTimeout(() => reject(new Error("Transaction fetch timeout")), 10000);
        });
        
        let enhancedTxs: EnrichedTransaction[] = [];
        
        try {
          enhancedTxs = await Promise.race([fetchPromise, timeoutPromise]);
          console.log('Transaction fetch successful:', enhancedTxs.length);
          
          // Log transaction details for debugging
          if (enhancedTxs.length > 0) {
            console.log('First transaction details:', JSON.stringify(enhancedTxs[0], null, 2));
          } else {
            console.log('No transactions found');
          }
        } catch (err) {
          console.error("Transaction fetch failed or timed out:", err);
          // Try with a smaller limit as a fallback
          try {
            enhancedTxs = await getEnhancedTransactions(walletAddress, 5);
            console.log('Fallback transaction fetch successful:', enhancedTxs.length);
          } catch (fallbackErr) {
            console.error("Fallback transaction fetch also failed:", fallbackErr);
            setFetchError("Failed to fetch transaction data. Please try again.");
            // Return empty array to allow UI to render
            enhancedTxs = [];
          }
        }
        
        // Use the initial transactions if we couldn't get any enhanced transactions
        if (enhancedTxs.length === 0 && initialTransactions.length > 0) {
          console.log('Using initial transactions instead:', initialTransactions.length);
          enhancedTxs = initialTransactions;
        }
        
        // Always render the UI, even with empty transactions array
        setTransactions(enhancedTxs);
        console.log('Loaded transactions:', enhancedTxs.length);
        
        if (enhancedTxs.length > 0) {
          // Filter out transactions with undefined or NaN amounts to avoid calculation errors
          const validInflows = enhancedTxs.filter(tx => 
            tx.parsedInfo?.receiver === walletAddress && 
            tx.parsedInfo?.amount !== undefined && 
            !isNaN(tx.parsedInfo.amount) &&
            tx.parsedInfo.amount > 0
          );
          
          const validOutflows = enhancedTxs.filter(tx => 
            tx.parsedInfo?.sender === walletAddress && 
            tx.parsedInfo?.amount !== undefined && 
            !isNaN(tx.parsedInfo.amount) &&
            tx.parsedInfo.amount > 0
          );
          
          console.log(`Found ${validInflows.length} valid inflow transactions and ${validOutflows.length} valid outflow transactions`);
          
          const totalInflow = validInflows.reduce((sum, tx) => sum + (tx.parsedInfo?.amount || 0), 0);
          const totalOutflow = validOutflows.reduce((sum, tx) => sum + (tx.parsedInfo?.amount || 0), 0);
          
          console.log(`Calculated totals - Inflow: ${totalInflow}, Outflow: ${totalOutflow}`);
          
          // Create timeline data from transactions
          const timelineData = enhancedTxs
            .filter(tx => tx.blockTime !== undefined)
            .map(tx => {
              const isDeposit = tx.parsedInfo?.receiver === walletAddress;
              return {
                timestamp: tx.blockTime || 0,
                amount: tx.parsedInfo?.amount || 0,
                balance: 0, // Will calculate running balance below
                source: isDeposit ? tx.parsedInfo?.sender : tx.parsedInfo?.receiver,
                isDeposit,
                transactionSignature: tx.signature,
                rawData: tx.rawData // Include raw transaction data for token transfers
              };
            });
          
          // Explicitly define partialFundingData
          partialFundingData = {
            walletAddress,
            topSources: [],
            totalInflow,
            totalOutflow,
            netBalance: totalInflow - totalOutflow,
            timelineData
          };
          
          // Calculate running balance for timeline data
          let runningBalance = 0;
          if (partialFundingData.timelineData) {
            // Sort by timestamp (oldest first)
            partialFundingData.timelineData.sort((a, b) => a.timestamp - b.timestamp);
            
            partialFundingData.timelineData.forEach(item => {
              if (item.isDeposit && !isNaN(item.amount)) {
                runningBalance += item.amount;
              } else if (!isNaN(item.amount)) {
                runningBalance -= item.amount;
              }
              item.balance = runningBalance;
            });
          }
          
          setFundingData(partialFundingData);
          toast.success(`Loaded ${enhancedTxs.length} transactions`);
        } else {
          // Create empty funding data structure
          partialFundingData = {
            walletAddress,
            topSources: [],
            totalInflow: 0,
            totalOutflow: 0,
            netBalance: 0,
            timelineData: []
          };
          
          setFundingData(partialFundingData);
          toast.info("No transactions found for this wallet");
        }
        
        // Try to get better funding analytics from the API
        try {
          const analyticsPromise = getFundingAnalytics(walletAddress);
          const analyticsTimeout = new Promise((_, reject) => {
            setTimeout(() => reject(new Error("Analytics fetch timeout")), 8000);
          });
          
          const fundingAnalyticsData: WalletFundingAnalysis | null = await Promise.race([analyticsPromise, analyticsTimeout])
            .catch(err => {
              console.warn("API analytics fetch failed or timed out:", err);
              return null;
            }) as WalletFundingAnalysis | null;
            
          if (fundingAnalyticsData && 
              fundingAnalyticsData.timelineData && 
              Array.isArray(fundingAnalyticsData.timelineData) && 
              fundingAnalyticsData.timelineData.length > 0) {
            console.log('Using enhanced funding analytics data');
            
            // Combine with our partial data, preserving timeline data
            const validFundingData: WalletFundingAnalysis = {
              ...fundingAnalyticsData,
              // Use the API data, but keep our timeline data as fallback
              timelineData: fundingAnalyticsData.timelineData.length > 0 
                ? fundingAnalyticsData.timelineData 
                : (partialFundingData && partialFundingData.timelineData) || []
            };
            
            setFundingData(validFundingData);
          }
        } catch (analyticsError) {
          console.error('Error fetching funding analytics:', analyticsError);
          // Still continue with the UI rendering using partial data
        }
        
        // Try to get transaction clusters
        try {
          const clustersPromise = detectTransactionClusters(enhancedTxs.length > 0 ? enhancedTxs : walletAddress);
          const clustersTimeout = new Promise((_, reject) => {
            setTimeout(() => reject(new Error("Clusters fetch timeout")), 5000);
          });
          
          const clustersResult = await Promise.race([clustersPromise, clustersTimeout])
            .catch(err => {
              console.warn("Clusters fetch failed or timed out:", err);
              return [];
            });
          
          const validClusters = Array.isArray(clustersResult) ? clustersResult : [];
          setTransactionClusters(validClusters);
        } catch (clustersError) {
          console.error('Error detecting transaction clusters:', clustersError);
          setTransactionClusters([]);
        }
        
      } catch (error) {
        console.error('Error loading data:', error);
        setFetchError('Failed to load complete transaction data. Please try again.');
        toast.error('Failed to load complete transaction data');

        // Ensure we still have something to display
        const safePartialData: WalletFundingAnalysis = {
          walletAddress,
          topSources: [],
          totalInflow: 0,
          totalOutflow: 0,
          netBalance: 0,
          timelineData: []
        };
        setFundingData(safePartialData);
      } finally {
        setHeliusLoading(false);
        setClustersLoading(false);
        setDataFetched(true);
      }
    };

    fetchData();
  }, [walletAddress, initialLoading, dataFetchAttempted, initialTransactions]);
  
  // Function to reset and retry data fetching
  const retryDataFetch = () => {
    setDataFetchAttempted(false);
    setDataFetched(false);
    setFetchError(null);
  };
  
  // Ensure we always show content even during loading state
  const showLoadingIndicator = (initialLoading || heliusLoading) && !dataFetched;
  
  return (
    <div className="space-y-6">
      {heliusLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Fetching transaction data...</span>
        </div>
      )}
      
      {fetchError && (
        <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 rounded-md p-3 flex justify-between items-center">
          <p className="text-sm text-red-600 dark:text-red-400">{fetchError}</p>
          <button 
            onClick={retryDataFetch}
            className="text-xs bg-red-100 dark:bg-red-800/30 hover:bg-red-200 dark:hover:bg-red-700/30 text-red-600 dark:text-red-400 px-2 py-1 rounded"
          >
            Retry
          </button>
        </div>
      )}
      
      <Tabs 
        defaultValue="entities" 
        value={activeTab}
        onValueChange={setActiveTab}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="entities">Entity Analysis</TabsTrigger>
          <TabsTrigger value="clusters">Transaction Clusters</TabsTrigger>
          <TabsTrigger value="funding">Funding Sources</TabsTrigger>
          <TabsTrigger value="timeline">Timeline Analysis</TabsTrigger>
        </TabsList>
        
        <TabsContent value="entities" className="mt-6">
          <EntityAnalysis 
            walletAddress={walletAddress}
            transactions={transactions}
            isLoading={showLoadingIndicator}
            onViewDetails={onViewDetails}
          />
        </TabsContent>
        
        <TabsContent value="clusters" className="mt-6">
          <TransactionClusters
            transactions={transactions}
            isLoading={clustersLoading && !dataFetched}
            onViewDetails={onViewDetails}
            clusters={transactionClusters}
          />
        </TabsContent>
        
        <TabsContent value="funding" className="mt-6">
          {showLoadingIndicator ? (
            <div className="flex flex-col items-center justify-center min-h-[200px] py-10">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">Loading funding data...</p>
            </div>
          ) : (
            <WalletFundingPanel 
              walletAddress={walletAddress}
              transactions={transactions}
              onViewDetails={onViewDetails}
              enhancedAnalysis={fundingData}
            />
          )}
        </TabsContent>
        
        <TabsContent value="timeline" className="mt-6">
          <FundingTimeline 
            analysis={fundingData}
            onSelectTransaction={onViewDetails}
          />
        </TabsContent>
      </Tabs>
      
      <TransactionFlow 
        transactions={transactions}
        expanded={flowExpanded}
        onToggleExpand={() => setFlowExpanded(!flowExpanded)}
      />
    </div>
  );
};

export default AnalyticsView;
