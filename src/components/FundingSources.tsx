
import React from 'react';
import { formatAddress, formatTimestamp } from '@/utils/solanaUtils';
import { FundingSource } from '@/types';
import { Button } from '@/components/ui/button';
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Wallet, AlertCircle, Check, Database } from 'lucide-react';

interface FundingSourcesProps {
  sources: FundingSource[];
  onSelectTransaction?: (signature: string) => void;
}

const FundingSources: React.FC<FundingSourcesProps> = ({ sources, onSelectTransaction }) => {
  if (!sources.length) {
    return (
      <div className="flex flex-col items-center justify-center h-40">
        <p className="text-muted-foreground">No funding sources identified.</p>
      </div>
    );
  }
  
  const getConfidenceColor = (confidence: 'high' | 'medium' | 'low') => {
    switch (confidence) {
      case 'high': return 'bg-emerald-500';
      case 'medium': return 'bg-amber-500';
      case 'low': return 'bg-red-500';
      default: return 'bg-slate-500';
    }
  };
  
  const getEntityIcon = (type?: 'exchange' | 'wallet' | 'contract' | 'unknown') => {
    switch (type) {
      case 'exchange': return <Database className="h-4 w-4" />;
      case 'contract': return <Check className="h-4 w-4" />;
      case 'wallet': return <Wallet className="h-4 w-4" />;
      default: return <AlertCircle className="h-4 w-4" />;
    }
  };
  
  const totalAmount = sources.reduce((sum, source) => sum + source.amount, 0);
  
  return (
    <div className="space-y-4">
      <h3 className="font-medium text-lg">Top Funding Sources</h3>
      
      <div className="grid gap-4">
        {sources.map((source, index) => (
          <div key={source.address} className="bg-card border rounded-lg p-3 hover:shadow-md transition-shadow">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <div className="bg-muted p-1.5 rounded-md">
                  {getEntityIcon(source.type)}
                </div>
                <div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <h4 className="font-medium flex items-center gap-1">
                          {source.label || formatAddress(source.address, 6)}
                          <span 
                            className={`w-2 h-2 rounded-full ${getConfidenceColor(source.confidence)}`} 
                            aria-hidden="true"
                          />
                        </h4>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Confidence: {source.confidence}</p>
                        <p className="font-mono text-xs mt-1">{source.address}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <p className="text-xs text-muted-foreground">
                    {source.type === 'exchange' ? 'Exchange' : 
                     source.type === 'contract' ? 'Smart Contract' : 
                     source.type === 'wallet' ? 'Wallet' : 'Unknown'}
                  </p>
                </div>
              </div>
              
              <div className="text-right">
                <p className="font-medium">{source.amount.toFixed(2)} SOL</p>
                <p className="text-xs text-muted-foreground">
                  {((source.amount / totalAmount) * 100).toFixed(1)}% of inflow
                </p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="space-y-1">
                <p className="text-muted-foreground">First transaction</p>
                <p>{formatTimestamp(source.timestamp)}</p>
              </div>
              
              <div className="flex justify-end items-end">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => onSelectTransaction?.(source.transactionSignature)}
                >
                  View Transaction
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FundingSources;
