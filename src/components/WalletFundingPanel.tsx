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
      if (enhancedAnalysis && !force) {
        console.log("Using enhanced analysis from props:", enhancedAnalysis);
        
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
        console.log("Calculating funding analysis from scratch");
        
        let result = await getFundingAnalytics(walletAddress);
        
        if (!result) {
          result = await analyzeFundingHistory(walletAddress, 25);
        }
        
        if (result) {
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
    toast.info("AI Insights", {
      description: "Coming Soon! We're working on bringing advanced AI-powered wallet insights.",
      icon: <SparklesIcon className="text-[#8B5CF6]" />,
      duration: 3000
    });
  };
  
  useEffect(() => {
    if (enhancedAnalysis) {
      console.log("Setting analysis from enhanced data:", enhancedAnalysis);
      
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
          balance: 0,
          source: isDeposit ? tx.parsedInfo?.sender : tx.parsedInfo?.receiver,
          isDeposit,
          transactionSignature: tx.signature,
          rawData: tx.rawData
        };
      })
  } : analysis;
  
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
      </div>
    </TooltipProvider>
  );
};

export default WalletFundingPanel;
