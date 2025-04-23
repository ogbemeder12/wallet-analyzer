
import React, { useState, useEffect } from 'react';
import { Loader2, RefreshCw, SparklesIcon, AlertTriangle, InfoIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { WalletFundingAnalysis, EnrichedTransaction } from '@/types';
import { analyzeFundingHistory } from '@/utils/fundingAnalysis';
import { getFundingAnalytics } from '@/utils/heliusApi';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import FundingTimeline from './FundingTimeline';
import FundingSources from './FundingSources';
import { getKnownEntities } from '@/utils/entityUtils';
import { withRetry } from '@/utils/apiUtils';

interface WalletFundingPanelProps {
  walletAddress: string;
  onViewDetails?: (signature: string) => void;
  transactions?: EnrichedTransaction[];
  enhancedAnalysis?: WalletFundingAnalysis; // Enhanced funding analysis from Helius
}

const WalletFundingPanel: React.FC<WalletFundingPanelProps> = ({ 
  walletAddress, 
  onViewDetails,
  transactions = [],
  enhancedAnalysis
}) => {
  const [analysis, setAnalysis] = useState<WalletFundingAnalysis | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isFailover, setIsFailover] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  const loadAnalysis = async (force: boolean = false) => {
    if (!walletAddress) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Try to use enhancedAnalysis first if available
      if (enhancedAnalysis && !force) {
        console.log("Using enhanced analysis from props:", enhancedAnalysis);
        
        // Validate the enhancedAnalysis to ensure all required fields exist
        const validatedAnalysis = {
          ...enhancedAnalysis,
          walletAddress: enhancedAnalysis.walletAddress || walletAddress,
          totalInflow: isNaN(enhancedAnalysis.totalInflow) ? 0 : enhancedAnalysis.totalInflow,
          totalOutflow: isNaN(enhancedAnalysis.totalOutflow) ? 0 : enhancedAnalysis.totalOutflow,
          netBalance: isNaN(enhancedAnalysis.netBalance) ? 0 : enhancedAnalysis.netBalance,
          topSources: Array.isArray(enhancedAnalysis.topSources) ? enhancedAnalysis.topSources : [],
          timelineData: Array.isArray(enhancedAnalysis.timelineData) ? enhancedAnalysis.timelineData : []
        };
        
        setAnalysis(validatedAnalysis);
      } else {
        // Otherwise calculate from scratch
        console.log("Calculating funding analysis from scratch");
        
        // Try to get from Helius API first
        let result = await getFundingAnalytics(walletAddress);
        
        // If Helius fails, fall back to local calculation with a small limit
        if (!result) {
          result = await analyzeFundingHistory(walletAddress, 25); // Reduced from 100
        }
        
        if (result) {
          // Ensure all numeric values are valid
          const validatedResult = {
            ...result,
            totalInflow: isNaN(result.totalInflow) ? 0 : result.totalInflow,
            totalOutflow: isNaN(result.totalOutflow) ? 0 : result.totalOutflow,
            netBalance: isNaN(result.netBalance) ? 0 : result.netBalance,
            topSources: Array.isArray(result.topSources) ? result.topSources : [],
            timelineData: Array.isArray(result.timelineData) ? result.timelineData : []
          };
          
          setAnalysis(validatedResult);
          console.log("Calculated analysis with totals - Inflow:", validatedResult.totalInflow, "Outflow:", validatedResult.totalOutflow);
        } else {
          // Create fallback empty data structure
          setAnalysis({
            walletAddress,
            topSources: [],
            totalInflow: 0,
            totalOutflow: 0,
            netBalance: 0,
            timelineData: []
          });
        }
        
        if (force) {
          toast.success("Funding analysis updated");
        }
      }
    } catch (err) {
      console.error('Error loading funding analysis:', err);
      setError('Failed to analyze wallet funding. Please try again later.');
      toast.error("Failed to analyze wallet funding");
      
      // Create fallback empty data structure on error
      setAnalysis({
        walletAddress,
        topSources: [],
        totalInflow: 0,
        totalOutflow: 0,
        netBalance: 0,
        timelineData: []
      });
    } finally {
      setIsLoading(false);
    }
  };

  const performAiAnalysis = async () => {
    if (!walletAddress) return;

    setIsAiAnalyzing(true);
    setAiError(null);
    setIsFailover(false);
    
    try {
      const inflows = transactions.filter(tx => 
        tx.parsedInfo?.receiver === walletAddress && tx.parsedInfo?.amount
      );
      
      const outflows = transactions.filter(tx => 
        tx.parsedInfo?.sender === walletAddress && tx.parsedInfo?.amount
      );
      
      const totalInflow = inflows.reduce((sum, tx) => sum + (tx.parsedInfo?.amount || 0), 0);
      const totalOutflow = outflows.reduce((sum, tx) => sum + (tx.parsedInfo?.amount || 0), 0);
      const netBalance = totalInflow - totalOutflow;
      
      const knownEntities = await getKnownEntities(walletAddress, transactions);
      
      const entityData = {
        knownEntities,
        interactionCount: transactions.length
      };

      console.log("Sending to analyze-wallet edge function:", {
        walletAddress,
        transactionCount: transactions.length,
        entityData
      });

      const response = await withRetry(() => 
        supabase.functions.invoke('analyze-wallet', {
          body: JSON.stringify({
            walletAddress,
            transactions: transactions.slice(0, 50),
            fundingData: analysis,
            entityData
          })
        }),
        { maxRetries: 5, initialDelayMs: 1000, maxDelayMs: 10000, backoffFactor: 2 }
      );

      if (!response || typeof response !== 'object') {
        throw new Error("Invalid response from edge function");
      }
      
      const responseError = response && typeof response === 'object' && 'error' in response
        ? response.error
        : null;

      if (responseError) {
        console.error('Edge function error:', responseError);
        throw new Error(typeof responseError === 'string' ? responseError : 'Unknown edge function error');
      }

      const data = response && typeof response === 'object' && 'data' in response 
        ? response.data 
        : {};
      
      console.log("Edge function response:", data);

      if (!data || typeof data !== 'object') {
        throw new Error("No data returned from edge function");
      }

      if (data && typeof data === 'object' && 'aiAnalysis' in data && typeof data.aiAnalysis === 'string' && data.aiAnalysis.trim().length > 0) {
        setAiAnalysis(data.aiAnalysis);
        
        if (data && typeof data === 'object' && 'fundingData' in data) {
          setAnalysis(data.fundingData as WalletFundingAnalysis);
          console.log("Updated funding data from AI analysis:", data.fundingData);
        }
        
        if (data && typeof data === 'object' && 'isFailover' in data && data.isFailover === true) {
          setIsFailover(true);
          if (data && typeof data === 'object' && 'error' in data) {
            setAiError(String(data.error));
          }
          toast.warning("Using fallback analysis - AI service unavailable");
        } else {
          toast.success("AI Analysis Complete");
        }
      } else if (data && typeof data === 'object' && 'fallbackAnalysis' in data && typeof data.fallbackAnalysis === 'string' && data.fallbackAnalysis.trim().length > 0) {
        setAiAnalysis(data.fallbackAnalysis as string);
        setIsFailover(true);
        if (data && typeof data === 'object' && 'error' in data) {
          setAiError(String(data.error));
        }
        toast.warning("Using fallback analysis - AI service unavailable");
      } else if (data && typeof data === 'object' && 'error' in data) {
        throw new Error(String(data.error));
      } else {
        const fallbackText = `
## Basic Wallet Analysis (Error Recovery Mode)

This is a simple fallback analysis since we couldn't generate a full AI analysis.

**Wallet Address**: ${walletAddress}
**Transaction Count**: ${transactions.length}
**Total Inflow**: ${analysis?.totalInflow.toFixed(2) || 'Unknown'} SOL
**Total Outflow**: ${analysis?.totalOutflow.toFixed(2) || 'Unknown'} SOL
**Net Balance**: ${analysis?.netBalance.toFixed(2) || 'Unknown'} SOL

Please try again later when our AI service is available.
        `;
        
        setAiAnalysis(fallbackText);
        setIsFailover(true);
      }
    } catch (err) {
      console.error('AI Analysis Error:', err);
      let errorMessage = `Failed to generate AI analysis: ${err instanceof Error ? err.message : String(err)}`;
      
      if (typeof err === 'object' && err !== null) {
        const errObj = err as any;
        if (errObj.message && errObj.message.includes('quota exceeded')) {
          errorMessage = "OpenAI API quota has been exceeded. Please try again later or update your API key.";
        }
      }
      
      setAiError(errorMessage);
      toast.error("Failed to generate AI analysis");
      
      const fallbackText = `
## Basic Wallet Analysis (Error Recovery Mode)

This is a simple fallback analysis since we couldn't generate a full AI analysis.

**Wallet Address**: ${walletAddress}
**Transaction Count**: ${transactions.length}
**Total Inflow**: ${analysis?.totalInflow.toFixed(2) || 'Unknown'} SOL
**Total Outflow**: ${analysis?.totalOutflow.toFixed(2) || 'Unknown'} SOL
**Net Balance**: ${analysis?.netBalance.toFixed(2) || 'Unknown'} SOL

Please try again later when our AI service is available.
        `;
      
      setAiAnalysis(fallbackText);
      setIsFailover(true);
    } finally {
      setIsAiAnalyzing(false);
    }
  };
  
  useEffect(() => {
    if (enhancedAnalysis) {
      console.log("Setting analysis from enhanced data:", enhancedAnalysis);
      
      // Ensure all numeric values are valid in the enhanced analysis
      const validatedAnalysis = {
        ...enhancedAnalysis,
        walletAddress: enhancedAnalysis.walletAddress || walletAddress,
        totalInflow: isNaN(enhancedAnalysis.totalInflow) ? 0 : enhancedAnalysis.totalInflow,
        totalOutflow: isNaN(enhancedAnalysis.totalOutflow) ? 0 : enhancedAnalysis.totalOutflow,
        netBalance: isNaN(enhancedAnalysis.netBalance) ? 0 : enhancedAnalysis.netBalance,
        topSources: Array.isArray(enhancedAnalysis.topSources) ? enhancedAnalysis.topSources : [],
        timelineData: Array.isArray(enhancedAnalysis.timelineData) ? enhancedAnalysis.timelineData : []
      };
      
      setAnalysis(validatedAnalysis);
    } else {
      loadAnalysis();
    }
  }, [walletAddress, enhancedAnalysis]);
  
  // Always display something, even if loading
  if (isLoading && !analysis) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[200px] py-10">
        <Loader2 size={30} className="animate-spin text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Analyzing wallet funding history...</p>
      </div>
    );
  }
  
  if (error && !analysis) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[200px] py-10">
        <p className="text-red-500 mb-4">{error}</p>
        <Button onClick={() => loadAnalysis(true)}>Try Again</Button>
      </div>
    );
  }
  
  // Derive analysis from transactions when no analysis is available
  const derivedAnalysis = !analysis && transactions.length > 0 ? {
    walletAddress,
    topSources: [],
    totalInflow: transactions
      .filter(tx => 
        tx.parsedInfo?.receiver === walletAddress && 
        tx.parsedInfo?.amount !== undefined && 
        !isNaN(tx.parsedInfo.amount) && 
        tx.parsedInfo.amount > 0
      )
      .reduce((sum, tx) => sum + (tx.parsedInfo?.amount || 0), 0),
    totalOutflow: transactions
      .filter(tx => 
        tx.parsedInfo?.sender === walletAddress && 
        tx.parsedInfo?.amount !== undefined && 
        !isNaN(tx.parsedInfo.amount) && 
        tx.parsedInfo.amount > 0
      )
      .reduce((sum, tx) => sum + (tx.parsedInfo?.amount || 0), 0),
    netBalance: 0,
    timelineData: transactions
      .filter(tx => tx.blockTime && tx.parsedInfo?.amount !== undefined && !isNaN(tx.parsedInfo.amount) && tx.parsedInfo.amount > 0)
      .map(tx => {
        const isDeposit = tx.parsedInfo?.receiver === walletAddress;
        return {
          timestamp: tx.blockTime || 0,
          amount: tx.parsedInfo?.amount || 0,
          balance: 0, // Will calculate running balance later
          source: isDeposit ? tx.parsedInfo?.sender : tx.parsedInfo?.receiver,
          isDeposit,
          transactionSignature: tx.signature,
          rawData: tx.rawData // Include raw transaction data if available
        };
      })
  } : analysis;
  
  // Ensure we always have a valid analysis object, even if it's empty
  const finalAnalysis = derivedAnalysis || {
    walletAddress,
    topSources: [],
    totalInflow: 0,
    totalOutflow: 0,
    netBalance: 0,
    timelineData: []
  };
  
  if (finalAnalysis && finalAnalysis.netBalance === 0) {
    finalAnalysis.netBalance = finalAnalysis.totalInflow - finalAnalysis.totalOutflow;
    
    // Calculate running balance for timeline data
    let runningBalance = 0;
    if (finalAnalysis.timelineData) {
      finalAnalysis.timelineData.sort((a, b) => a.timestamp - b.timestamp);
      finalAnalysis.timelineData.forEach(item => {
        if (item.isDeposit) {
          runningBalance += item.amount;
        } else {
          runningBalance -= item.amount;
        }
        item.balance = runningBalance;
      });
    }
  }
  
  console.log("Final analysis data:", finalAnalysis);
  console.log("Final funding totals - Inflow:", finalAnalysis.totalInflow, "Outflow:", finalAnalysis.totalOutflow);

  
  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-medium">Wallet Funding Analysis</h2>
          <div className="flex space-x-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => loadAnalysis(true)}
              className="flex items-center gap-1"
            >
              <RefreshCw size={14} />
              <span>Refresh</span>
            </Button>
            <Button 
              variant="default" 
              size="sm" 
              onClick={performAiAnalysis}
              disabled={isAiAnalyzing}
              className="flex items-center gap-1"
            >
              <SparklesIcon size={14} />
              <span>{isAiAnalyzing ? 'Analyzing...' : 'AI Insights'}</span>
            </Button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="glass-card p-5 rounded-lg">
            <FundingSources sources={finalAnalysis.topSources} onSelectTransaction={onViewDetails} />
          </div>
          
          <div className="glass-card p-5 rounded-lg">
            <FundingTimeline analysis={finalAnalysis} onSelectTransaction={onViewDetails} />
          </div>
        </div>

        {aiError && (
          <div className="glass-card p-5 rounded-lg mt-6 border-red-500/20 bg-red-500/5">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={20} className="text-red-500" />
              <h3 className="text-lg font-medium text-red-500">AI Analysis Error</h3>
            </div>
            <p className="text-muted-foreground">{aiError}</p>
            
            {aiError.includes('OpenAI API quota') && (
              <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-md">
                <h4 className="font-medium flex items-center gap-1">
                  <InfoIcon size={16} className="text-amber-500" />
                  <span className="text-amber-400">Quota Exceeded</span>
                </h4>
                <p className="text-sm text-muted-foreground mt-1">
                  The OpenAI API key has reached its usage limit. This typically happens when you've used all the free credits
                  or exceeded your payment plan's limit. If you're the administrator, you may need to update your OpenAI billing
                  plan or wait for the quota to reset.
                </p>
              </div>
            )}
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={performAiAnalysis}
              className="mt-4"
            >
              Try Again
            </Button>
          </div>
        )}

        {aiAnalysis && !aiError && (
          <div className={`glass-card p-5 rounded-lg mt-6 ${isFailover ? 'border-amber-500/20 bg-amber-500/5' : ''}`}>
            <h3 className="text-lg font-medium mb-4 flex items-center">
              <SparklesIcon size={20} className={`mr-2 ${isFailover ? 'text-amber-500' : 'text-primary'}`} />
              {isFailover ? 'Fallback Analysis (AI Service Unavailable)' : 'AI-Powered Wallet Insights'}
            </h3>
            
            {isFailover && (
              <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-md">
                <p className="text-sm text-muted-foreground">
                  Our AI service is currently unavailable. This is a simplified analysis based on the available data.
                  Please try again later for a more comprehensive analysis.
                </p>
              </div>
            )}
            
            <div className="prose prose-invert max-w-none">
              {aiAnalysis.split('\n\n').map((paragraph, index) => (
                <p key={index} className="text-muted-foreground mb-4">{paragraph}</p>
              ))}
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};

export default WalletFundingPanel;
