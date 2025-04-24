import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { SearchCode, AlertTriangle, PieChart, Network, ArrowUpDown, Wallet, History, BookKey, Zap, Database, ShieldAlert } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { EnrichedTransaction, AnomalyDetectionResult } from '@/types';
import SearchBar from '@/components/SearchBar';
import TransactionList from '@/components/TransactionList';
import TransactionFlow from '@/components/TransactionFlow';
import WalletFundingPanel from '@/components/WalletFundingPanel';
import EntityAnalysis from '@/components/EntityAnalysis';
import AnalyticsView from '@/components/AnalyticsView';
import ExplorerView from '@/components/ExplorerView';
import { getTransactions, getTransactionDetails, detectAnomalies, getWalletBalance, formatSolAmount, formatTimestamp } from '@/utils/solanaUtils';
import { withRetry } from '@/utils/apiUtils';

const Index = () => {
  const [searchInput, setSearchInput] = useState<string>('');
  const [transactions, setTransactions] = useState<EnrichedTransaction[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>('transactions');
  const [selectedTransaction, setSelectedTransaction] = useState<string | null>(null);
  const [transactionDetails, setTransactionDetails] = useState<EnrichedTransaction | null>(null);
  const [anomalies, setAnomalies] = useState<AnomalyDetectionResult[]>([]);
  const [isFlowExpanded, setIsFlowExpanded] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [isWalletAddress, setIsWalletAddress] = useState<boolean>(true);
  const [analysisInProgress, setAnalysisInProgress] = useState<boolean>(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const isCancelledRef = useRef(false);

  useEffect(() => {
    const savedInput = localStorage.getItem('lastSearchInput');
    if (savedInput) {
      handleSearch(savedInput);
    }
  }, []);

  const handleCancelSearch = () => {
    isCancelledRef.current = true;
    if (abortController) {
      abortController.abort();
    }
    setIsLoading(false);
    setIsLoadingTransactions(false);
    setAnalysisInProgress(false);

    toast('Search canceled', {
      description: 'The ongoing search was canceled by the user.',
      icon: <AlertTriangle className="h-4 w-4" />,
      duration: 2500,
    });
  };

  const fetchTransactionHistory = async (address: string, providedAbortController?: AbortController) => {
    setIsLoadingTransactions(true);
    const controller = providedAbortController || new AbortController();
    setAbortController(controller);

    try {
      toast.info('Fetching transactions...', {
        description: 'This may take a moment as we retrieve historical data.',
        icon: <History className="h-4 w-4" />,
        duration: 5000,
      });

      const txList = await getTransactions(address, 100);

      if (controller.signal.aborted || isCancelledRef.current) return;

      if (txList.length === 0) {
        toast.info('No transactions found', {
          description: 'No transactions were found for this address in the past 6 months.',
          icon: <AlertTriangle className="h-4 w-4" />,
        });
        setIsLoadingTransactions(false);
        return;
      }

      toast.info(`Loading transaction details for ${txList.length} transactions...`, {
        duration: 5000,
      });

      const batchSize = 5;
      let processedTransactions: EnrichedTransaction[] = [];

      for (let i = 0; i < txList.length; i += batchSize) {
        if (controller.signal.aborted || isCancelledRef.current) break;

        const batch = txList.slice(i, i + batchSize);

        const batchPromises = batch.map(tx =>
          withRetry(() => getTransactionDetails(tx.signature), {
            maxRetries: 2,
            initialDelayMs: 500,
            maxDelayMs: 5000,
            backoffFactor: 2,
          }, false)
        );

        try {
          const batchResults = await Promise.all(batchPromises);
          if (controller.signal.aborted || isCancelledRef.current) break;
          const validBatchResults = batchResults.filter(tx => tx !== null) as EnrichedTransaction[];
          processedTransactions = [...processedTransactions, ...validBatchResults];

          setTransactions([...processedTransactions]);

          if (processedTransactions.length >= 10) {
            const intermediateAnomalies = detectAnomalies(processedTransactions);
            setAnomalies(intermediateAnomalies);
          }
        } catch (batchError) {
          if (controller.signal.aborted || isCancelledRef.current) break;
          console.error('Error processing transaction batch:', batchError);
        }

        if (controller.signal.aborted || isCancelledRef.current) break;
        if (i + batchSize < txList.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      if (controller.signal.aborted || isCancelledRef.current) {
        setIsLoadingTransactions(false);
        return;
      }

      const validTransactions = processedTransactions;
      setTransactions(validTransactions);

      const detectedAnomalies = detectAnomalies(validTransactions);
      setAnomalies(detectedAnomalies);

      if (validTransactions.length === 0) {
        toast('No transactions found for this address.', {
          description: 'Try a different address or check your input.',
          icon: <AlertTriangle className="h-4 w-4" />,
        });
      } else {
        const oldestTx = validTransactions.reduce((oldest, tx) =>
          (tx.blockTime && oldest.blockTime && tx.blockTime < oldest.blockTime) ? tx : oldest,
          validTransactions[0]
        );
        const oldestDate = oldestTx.blockTime ? new Date(oldestTx.blockTime * 1000).toLocaleDateString() : 'unknown';
        const balance = walletBalance !== null ? walletBalance.toFixed(4) : 'unknown';

        toast.success(`Found ${validTransactions.length} transactions`, {
          description: `${detectedAnomalies.length} anomalies detected. Balance: ${balance} SOL`,
        });
      }
    } catch (error) {
      if (controller.signal.aborted || isCancelledRef.current) {
        setIsLoadingTransactions(false);
        setAnalysisInProgress(false);
        return;
      }
      console.error('Failed to fetch transaction history:', error);
      const errorMessage = error instanceof Error
        ? error.message
        : 'Unknown error connecting to Solana network';

      toast.error('Transaction fetch error', {
        description: errorMessage,
      });
    } finally {
      setIsLoadingTransactions(false);
      setAnalysisInProgress(false);
      setAbortController(null);
    }
  };

  const handleSearch = async (input: string, fetchBalanceOnly: boolean = false) => {
    if (!input) return;

    handleCancelSearch();
    isCancelledRef.current = false;

    const controller = new AbortController();
    setAbortController(controller);

    if (input.startsWith('0x')) {
      toast.error('Invalid Solana format', {
        description: 'You entered an Ethereum-style address. Solana addresses do not start with "0x".',
        icon: <AlertTriangle className="h-4 w-4" />,
        duration: 5000,
      });
      setError('You entered an Ethereum-style address. Solana addresses do not start with "0x". Try our sample address instead.');
      return;
    }

    setSearchInput(input);
    setIsLoading(true);

    if (!fetchBalanceOnly) {
      setTransactions([]);
      setAnomalies([]);
      setError(null);
      setWalletBalance(null);
    }

    try {
      localStorage.setItem('lastSearchInput', input);

      const isTransaction = input.length >= 86 && input.length <= 90;
      setIsWalletAddress(!isTransaction);

      if (isTransaction) {
        const txDetails = await getTransactionDetails(input);
        if (controller.signal.aborted || isCancelledRef.current) {
          setIsLoading(false);
          return;
        }
        if (!txDetails) {
          toast.error('Transaction not found', {
            description: 'No transaction found with this signature.',
            icon: <AlertTriangle className="h-4 w-4" />,
          });
          setIsLoading(false);
          return;
        }
        setTransactions([txDetails]);
        handleViewDetails(input);

        toast.success('Transaction found', {
          description: 'Transaction details retrieved successfully.',
        });
      } else {
        try {
          if (fetchBalanceOnly) {
            toast.info('Fetching wallet balance...', {
              id: 'fetching-balance',
              duration: 3000
            });
          }

          const balance = await withRetry(
            () => getWalletBalance(input),
            {
              maxRetries: 3,
              initialDelayMs: 500,
              maxDelayMs: 5000,
              backoffFactor: 1.5,
            },
            true
          );

          if (controller.signal.aborted || isCancelledRef.current) {
            setIsLoading(false);
            return;
          }

          if (typeof balance === 'number') {
            setWalletBalance(balance);

            toast.success('Balance retrieved', {
              id: 'fetching-balance',
              description: `Wallet has ${balance.toFixed(4)} SOL`,
              duration: 3000,
            });
          } else {
            console.error('Invalid balance format returned:', balance);
            toast.error('Error retrieving balance', {
              id: 'fetching-balance',
              description: 'Could not parse wallet balance. Continuing with transaction history...',
              duration: 3000,
            });
          }

          if (fetchBalanceOnly) {
            setIsLoading(false);
            setAnalysisInProgress(true);
            setTimeout(() => fetchTransactionHistory(input, controller), 500);
            return;
          }
        } catch (balanceError) {
          if (controller.signal.aborted || isCancelledRef.current) {
            setIsLoading(false);
            return;
          }
          console.error('Error fetching balance:', balanceError);
          toast.error('Error fetching balance', {
            id: 'fetching-balance',
            description: 'Could not retrieve wallet balance. Continuing with transaction history...',
            duration: 3000,
          });
        }

        if (!fetchBalanceOnly) {
          await fetchTransactionHistory(input, controller);
        }
      }
    } catch (error) {
      if (controller.signal.aborted || isCancelledRef.current) {
        setIsLoading(false);
        setAnalysisInProgress(false);
        setAbortController(null);
        return;
      }
      console.error('Failed to fetch data:', error);
      const errorMessage = error instanceof Error
        ? error.message
        : 'Unknown error connecting to Solana network';
      setError(errorMessage);

      toast.error('Connection error', {
        description: errorMessage || 'Unable to connect to Solana network. Try our sample address instead.',
      });
    } finally {
      setIsLoading(false);
      setAbortController(null);
    }
  };

  const handleViewDetails = async (signature: string) => {
    setSelectedTransaction(signature);

    const tx = transactions.find(t => t.signature === signature);
    if (tx) {
      setTransactionDetails(tx);
    } else {
      try {
        const details = await getTransactionDetails(signature);
        if (details) {
          setTransactionDetails(details);
        }
      } catch (error) {
        console.error('Failed to fetch transaction details:', error);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0F1729] to-[#1A1F2C] overflow-x-hidden flex-grow">
      <header className="py-8 px-6 relative">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full bg-[#8B5CF6]/5 blur-3xl pointer-events-none"></div>
        </div>
        
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center mb-8">
            <div className="flex items-center gap-4 mb-3">
              <img 
                src="/lovable-uploads/38239a24-cd46-42d6-a421-87a64a33cfa4.png" 
                alt="SolanSight Logo" 
                className="h-16 w-16 animate-pulse"
              />
              <h1 className="text-4xl font-bold bg-gradient-to-r from-[#8B5CF6] to-[#D946EF] bg-clip-text text-transparent">
                SolanSight Analysis
              </h1>
            </div>
            <p className="text-muted-foreground text-center max-w-3xl mx-auto mb-12 text-lg">
              Track and visualize on-chain transactions, identify entities, and detect suspicious activities on the Solana blockchain.
            </p>
          </div>
          
          <SearchBar onSearch={handleSearch} isLoading={isLoading} onCancel={handleCancelSearch} />
        </div>
      </header>
      
      <main className="px-6 pb-16">
        <div className="max-w-7xl mx-auto">
          {searchInput && (
            <>
              <div className="mb-8 animate-fade-in">
                <div className="glass-card p-5 rounded-2xl border border-[#8B5CF6]/20 backdrop-blur-md bg-[#1A1F2C]/50">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-medium mb-1 flex items-center gap-2">
                        {isWalletAddress ? (
                          <>
                            <Wallet className="text-[#8B5CF6]" size={20} />
                            <span>Analysis for </span>
                            <span className="font-mono bg-[#1A1F2C]/80 px-2 py-1 rounded-md text-sm">{searchInput.substring(0, 12)}...</span>
                          </>
                        ) : (
                          <>
                            <BookKey className="text-[#8B5CF6]" size={20} />
                            <span>Transaction </span>
                            <span className="font-mono bg-[#1A1F2C]/80 px-2 py-1 rounded-md text-sm">{searchInput.substring(0, 12)}...</span>
                          </>
                        )}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {isWalletAddress ? (
                          <>Analyzing transaction history and patterns (up to 6 months of data)</>
                        ) : (
                          <>Viewing details for a single transaction</>
                        )}
                      </p>
                    </div>
                    {walletBalance !== null && isWalletAddress && (
                      <div className="bg-[#1A1F2C]/80 border border-[#8B5CF6]/20 rounded-lg px-4 py-2 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#8B5CF6] animate-pulse"></div>
                        <span className="text-sm font-medium">
                          Balance: {walletBalance.toFixed(4)} SOL
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {error && (
                <div className="glass-card p-5 rounded-lg mb-6 border-amber-500/30 border bg-amber-500/5 animate-fade-in">
                  <div className="flex items-center gap-3">
                    <ShieldAlert className="text-amber-500 h-5 w-5" />
                    <div>
                      <h3 className="font-medium text-amber-600 dark:text-amber-400">API Connection Error</h3>
                      <p className="text-sm text-muted-foreground">{error}</p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <p className="text-sm">
                      Solana public RPC endpoints have rate limits. Try our sample address instead:
                    </p>
                    <Button 
                      variant="outline"
                      className="mt-2 text-xs font-mono"
                      onClick={() => handleSearch('GVV4cVPRhUf9wQQRbQu9JwQPQkRtFKrNYGPXgxzk5mUC')}
                    >
                      GVV4cVPRhUf9wQQRbQu9JwQPQkRtFKrNYGPXgxzk5mUC
                    </Button>
                  </div>
                </div>
              )}
              
              {isLoadingTransactions || analysisInProgress ? (
                <div className="glass-card p-8 rounded-2xl text-center max-w-3xl mx-auto animate-fade-in backdrop-blur-md bg-[#1A1F2C]/50 border border-[#8B5CF6]/20 mb-6">
                  <div className="flex justify-center mb-6">
                    <div className="relative">
                      <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#D946EF] blur-lg opacity-30 animate-pulse"></div>
                      <div className="relative z-10 animate-spin h-16 w-16 border-4 border-[#8B5CF6]/20 border-t-[#8B5CF6] rounded-full"></div>
                    </div>
                  </div>
                  <h2 className="text-2xl font-medium mb-3 bg-gradient-to-r from-[#8B5CF6] to-[#D946EF] bg-clip-text text-transparent">
                    Loading Transaction Data
                  </h2>
                  <p className="text-muted-foreground mb-6">
                    Fetching and analyzing transactions in small batches to avoid rate limits. This may take a few moments...
                  </p>
                  
                  {walletBalance !== null && (
                    <div className="bg-[#1A1F2C]/80 p-4 rounded-xl border border-[#8B5CF6]/20 flex flex-col items-center">
                      <Wallet className="h-10 w-10 text-[#8B5CF6] mb-2" />
                      <h3 className="font-medium mb-1">Wallet Balance Available</h3>
                      <p className="text-sm text-muted-foreground mb-3">
                        Balance: <span className="font-medium">{walletBalance.toFixed(4)} SOL</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Transactions are being processed in batches of 5 with rate limiting to ensure reliable data.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6">
                  <TransactionFlow 
                    transactions={transactions} 
                    expanded={isFlowExpanded}
                    onToggleExpand={() => setIsFlowExpanded(!isFlowExpanded)}
                  />
                  
                  {anomalies.length > 0 && (
                    <div className="glass-card p-5 rounded-2xl backdrop-blur-md bg-[#1A1F2C]/50 border border-amber-500/20 animate-fade-in">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-medium flex items-center gap-2">
                          <ShieldAlert size={16} className="text-amber-500" />
                          <span>Detected Anomalies ({anomalies.length})</span>
                        </h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {anomalies.slice(0, 3).map((anomaly, index) => (
                          <div 
                            key={`${anomaly.transactionSignature}-${index}`}
                            className="bg-amber-500/5 border border-amber-500/20 p-3 rounded-md hover:bg-amber-500/10 transition-colors"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium">{anomaly.anomalyType}</span>
                              <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">Risk: {anomaly.riskScore}</span>
                            </div>
                            <p className="text-sm text-muted-foreground">{anomaly.details}</p>
                            <button 
                              className="text-xs text-amber-400 mt-2 hover:underline flex items-center gap-1"
                              onClick={() => handleViewDetails(anomaly.transactionSignature)}
                            >
                              <SearchCode size={12} />
                              View Transaction
                            </button>
                          </div>
                        ))}
                        
                        {anomalies.length > 3 && (
                          <div className="bg-amber-500/5 border border-amber-500/20 p-3 rounded-md flex items-center justify-center">
                            <Button 
                              variant="link" 
                              className="text-amber-400"
                            >
                              View {anomalies.length - 3} more anomalies
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  <Tabs
                    defaultValue="transactions"
                    value={activeTab}
                    onValueChange={setActiveTab}
                    className="glass-card rounded-2xl overflow-hidden backdrop-blur-md bg-[#1A1F2C]/50 border border-[#8B5CF6]/20 animate-fade-in"
                  >
                    <div className="px-6 pt-6">
                      <TabsList className="grid grid-cols-2 md:grid-cols-5 gap-4 bg-[#1A1F2C]/70">
                        <TabsTrigger value="transactions" className="flex items-center gap-2 data-[state=active]:bg-[#8B5CF6] data-[state=active]:text-white">
                          <ArrowUpDown size={16} />
                          <span>Transactions</span>
                        </TabsTrigger>
                        {isWalletAddress && (
                          <>
                            <TabsTrigger value="funding" className="flex items-center gap-2 data-[state=active]:bg-[#8B5CF6] data-[state=active]:text-white">
                              <Database size={16} />
                              <span>Funding</span>
                            </TabsTrigger>
                            <TabsTrigger value="entities" className="flex items-center gap-2 data-[state=active]:bg-[#8B5CF6] data-[state=active]:text-white">
                              <Network size={16} />
                              <span>Entities</span>
                            </TabsTrigger>
                            <TabsTrigger value="analytics" className="flex items-center gap-2 data-[state=active]:bg-[#8B5CF6] data-[state=active]:text-white">
                              <PieChart size={16} />
                              <span>Analytics</span>
                            </TabsTrigger>
                            <TabsTrigger value="explorer" className="flex items-center gap-2 data-[state=active]:bg-[#8B5CF6] data-[state=active]:text-white">
                              <SearchCode size={16} />
                              <span>Explorer</span>
                            </TabsTrigger>
                          </>
                        )}
                      </TabsList>
                    </div>
                    
                    <Separator className="my-4 bg-[#8B5CF6]/10" />
                    
                    <div className="p-6 pt-2">
                      <TabsContent value="transactions" className="m-0">
                        <TransactionList 
                          transactions={transactions} 
                          isLoading={isLoading || isLoadingTransactions}
                          onViewDetails={handleViewDetails}
                        />
                      </TabsContent>
                      
                      {isWalletAddress && (
                        <>
                          <TabsContent value="funding" className="m-0">
                            <WalletFundingPanel 
                              walletAddress={searchInput}
                              transactions={transactions}
                              onViewDetails={handleViewDetails}
                            />
                          </TabsContent>
                          
                          <TabsContent value="entities" className="m-0">
                            <EntityAnalysis
                              walletAddress={searchInput}
                              transactions={transactions}
                              isLoading={isLoading || isLoadingTransactions}
                              onViewDetails={handleViewDetails}
                            />
                          </TabsContent>
                          
                          <TabsContent value="analytics" className="m-0">
                            <AnalyticsView
                              walletAddress={searchInput}
                              transactions={transactions}
                              isLoading={isLoading || isLoadingTransactions}
                              onViewDetails={handleViewDetails}
                            />
                          </TabsContent>
                          
                          <TabsContent value="explorer" className="m-0">
                            <ExplorerView
                              walletAddress={searchInput}
                              transactions={transactions}
                              isLoading={isLoading || isLoadingTransactions}
                              onViewDetails={handleViewDetails}
                            />
                          </TabsContent>
                        </>
                      )}
                    </div>
                  </Tabs>
                </div>
              )}
            </>
          )}
          
          {!searchInput && !isLoading && (
            <div className="glass-card p-8 rounded-2xl text-center max-w-3xl mx-auto animate-fade-in backdrop-blur-md bg-[#1A1F2C]/50 border border-[#8B5CF6]/20">
              <div className="flex justify-center mb-6">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#D946EF] blur-lg opacity-30 animate-pulse"></div>
                  <SearchCode size={64} className="relative z-10 text-[#8B5CF6]" />
                </div>
              </div>
              <h2 className="text-2xl font-medium mb-3 bg-gradient-to-r from-[#8B5CF6] to-[#D946EF] bg-clip-text text-transparent">Enter a Solana Address or Transaction Signature</h2>
              <p className="text-muted-foreground mb-6">
                Search for a wallet address or transaction signature to start your investigation.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <div className="bg-[#1A1F2C]/80 p-4 rounded-xl border border-[#8B5CF6]/20 flex flex-col items-center">
                  <Wallet className="h-10 w-10 text-[#8B5CF6] mb-2" />
                  <h3 className="font-medium mb-1">Wallet Analysis</h3>
                  <p className="text-sm text-muted-foreground mb-3">Analyze transaction patterns, funding sources, and detect anomalies</p>
                  <Button 
                    onClick={() => handleSearch('GVV4cVPRhUf9wQQRbQu9JwQPQkRtFKrNYGPXgxzk5mUC')}
                    variant="outline"
                    className="w-full border-[#8B5CF6]/20 hover:bg-[#8B5CF6]/10"
                  >
                    Try Sample Wallet
                  </Button>
                </div>
                
                <div className="bg-[#1A1F2C]/80 p-4 rounded-xl border border-[#8B5CF6]/20 flex flex-col items-center">
                  <BookKey className="h-10 w-10 text-[#D946EF] mb-2" />
                  <h3 className="font-medium mb-1">Transaction Inspection</h3>
                  <p className="text-sm text-muted-foreground mb-3">Examine individual transactions, verify signatures and details</p>
                  <Button 
                    variant="outline"
                    className="w-full border-[#8B5CF6]/20 hover:bg-[#8B5CF6]/10"
                    disabled
                  >
                    Enter Transaction ID
                  </Button>
                </div>
              </div>
              
              <div className="text-sm text-muted-foreground p-4 bg-[#1A1F2C]/80 rounded-xl border border-amber-500/20 mt-4 max-w-lg mx-auto flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <span>
                  Solana public RPC endpoints have rate limits. If you encounter errors, please use our sample address for testing or try again later.
                </span>
              </div>
            </div>
          )}
        </div>
      </main>
      
      <Sheet open={!!selectedTransaction} onOpenChange={(open) => !open && setSelectedTransaction(null)}>
        <SheetContent className="sm:max-w-lg border-l border-[#8B5CF6]/20 bg-[#1A1F2C]/95 backdrop-blur-xl">
          <SheetHeader>
            <SheetTitle className="text-xl flex items-center gap-2">
              <BookKey className="text-[#8B5CF6]" size={20} />
              Transaction Details
            </SheetTitle>
          </SheetHeader>
          
          {transactionDetails ? (
            <div className="py-4 space-y-4">
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">Signature</h3>
                <p className="font-mono text-sm break-all bg-[#0F1729]/80 p-2 rounded-md border border-[#8B5CF6]/10">{transactionDetails.signature}</p>
              </div>
              
              <Separator className="bg-[#8B5CF6]/10" />
              
              {transactionDetails.blockTime && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">Timestamp</h3>
                  <p className="bg-[#0F1729]/80 p-2 rounded-md border border-[#8B5CF6]/10">{formatTimestamp(transactionDetails.blockTime)}</p>
                </div>
              )}
              
              {transactionDetails.slot && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">Slot</h3>
                  <p className="bg-[#0F1729]/80 p-2 rounded-md border border-[#8B5CF6]/10">{transactionDetails.slot.toLocaleString()}</p>
                </div>
              )}
              
              {transactionDetails.parsedInfo?.sender && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">From</h3>
                  <p className="font-mono text-sm break-all bg-[#0F1729]/80 p-2 rounded-md border border-[#8B5CF6]/10">{transactionDetails.parsedInfo.sender}</p>
                </div>
              )}
              
              {transactionDetails.parsedInfo?.receiver && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">To</h3>
                  <p className="font-mono text-sm break-all bg-[#0F1729]/80 p-2 rounded-md border border-[#8B5CF6]/10">{transactionDetails.parsedInfo.receiver}</p>
                </div>
              )}
              
              {transactionDetails.parsedInfo?.amount !== undefined && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">Amount</h3>
                  <div className="bg-[#0F1729]/80 p-2 rounded-md border border-[#8B5CF6]/10">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-full bg-[#8B5CF6]"></span>
                      <span>{formatSolAmount(transactionDetails.parsedInfo.amount)?.sol}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatSolAmount(transactionDetails.parsedInfo.amount)?.usd}
                    </div>
                  </div>
                </div>
              )}
              
              {transactionDetails.parsedInfo?.fee !== undefined && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">Fee</h3>
                  <div className="bg-[#0F1729]/80 p-2 rounded-md border border-[#8B5CF6]/10">
                    <div>{formatSolAmount(transactionDetails.parsedInfo.fee / 1e9)?.sol}</div>
                    <div className="text-xs text-muted-foreground">{formatSolAmount(transactionDetails.parsedInfo.fee / 1e9)?.usd}</div>
                  </div>
                </div>
              )}
              
              {transactionDetails.parsedInfo?.type && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">Transaction Type</h3>
                  <p className="bg-[#0F1729]/80 p-2 rounded-md border border-[#8B5CF6]/10 flex items-center gap-2">
                    <Zap size={16} className="text-[#D946EF]" />
                    {transactionDetails.parsedInfo.type}
                  </p>
                </div>
              )}
              
              {transactionDetails.parsedInfo?.programId && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">Program ID</h3>
                  <p className="font-mono text-sm break-all bg-[#0F1729]/80 p-2 rounded-md border border-[#8B5CF6]/10">{transactionDetails.parsedInfo.programId}</p>
                </div>
              )}
              
              {transactionDetails.riskScore !== undefined && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">Risk Assessment</h3>
                  <div className="bg-[#0F1729]/80 p-3 rounded-md border border-[#8B5CF6]/10">
                    <div className="bg-[#0F1729] rounded-full h-2 overflow-hidden mb-2">
                      <div 
                        className={`h-full ${
                          transactionDetails.riskScore > 70 ? 'bg-red-500' :
                          transactionDetails.riskScore > 40 ? 'bg-amber-500' :
                          'bg-green-500'
                        }`}
                        style={{ width: `${transactionDetails.riskScore}%` }}
                      ></div>
                    </div>
                    <p className="text-sm text-muted-foreground flex items-center justify-between">
                      <span>Risk Score: {transactionDetails.riskScore}/100</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        transactionDetails.riskScore > 70 ? 'bg-red-500/20 text-red-300' :
                        transactionDetails.riskScore > 40 ? 'bg-amber-500/20 text-amber-300' :
                        'bg-green-500/20 text-green-300'
                      }`}>
                        {transactionDetails.riskScore > 70 ? 'High Risk' : 
                        transactionDetails.riskScore > 40 ? 'Medium Risk' : 'Low Risk'}
                      </span>
                    </p>
                  </div>
                </div>
              )}
              
              <div className="pt-4">
                <Button 
                  className="w-full bg-gradient-to-r from-[#8B5CF6] to-[#D946EF] hover:opacity-90 text-white" 
                  onClick={() => window.open(`https://explorer.solana.com/tx/${transactionDetails.signature}`, '_blank')}
                >
                  View on Solana Explorer
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-40">
              <div className="flex flex-col items-center gap-2">
                <div className="animate-spin h-8 w-8 border-2 border-[#8B5CF6]/20 border-t-[#8B5CF6] rounded-full"></div>
                <p className="text-muted-foreground">Loading transaction details...</p>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Index;
