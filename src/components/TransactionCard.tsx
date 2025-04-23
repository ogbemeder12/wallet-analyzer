
import React from 'react';
import { 
  ExternalLink, Clock, AlertTriangle, Check, ArrowRightLeft, 
  Banknote, FileCode, Tag
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { EnrichedTransaction } from '@/types';
import { formatAddress, formatTimestamp, formatSolAmount } from '@/utils/solanaUtils';
import EntityLabel from './EntityLabel';

interface TransactionCardProps {
  transaction: EnrichedTransaction;
  onViewDetails: (signature: string) => void;
}

const TransactionCard: React.FC<TransactionCardProps> = ({ 
  transaction, 
  onViewDetails 
}) => {
  const getRiskColor = (score?: number) => {
    if (!score) return 'bg-muted text-muted-foreground';
    if (score > 70) return 'bg-red-500/10 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-400';
    if (score > 40) return 'bg-amber-500/10 text-amber-600 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400';
    return 'bg-green-500/10 text-green-600 border-green-200 dark:bg-green-900/20 dark:text-green-400';
  };

  const getTypeIcon = (type?: string) => {
    switch (type) {
      case 'transfer': return <ArrowRightLeft size={16} />;
      case 'token-transfer': return <Banknote size={16} />;
      case 'program-interaction': return <FileCode size={16} />;
      default: return <FileCode size={16} />;
    }
  };

  return (
    <Card className="glass-card overflow-hidden hover:shadow-xl transition-all duration-300 animate-fade-in">
      <CardHeader className="p-4 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-800 border-b">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2">
            {transaction.err ? (
              <AlertTriangle size={16} className="text-destructive" />
            ) : (
              <Check size={16} className="text-green-500" />
            )}
            <h3 className="text-sm font-medium truncate font-mono">
              {formatAddress(transaction.signature, 8)}
            </h3>
          </div>
          <div className="flex items-center space-x-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className={getRiskColor(transaction.riskScore)}>
                    {transaction.riskScore ? `Risk: ${transaction.riskScore}` : 'Unknown Risk'}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Risk assessment score</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            {transaction.parsedInfo?.type && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="secondary" className="flex items-center gap-1">
                      {getTypeIcon(transaction.parsedInfo.type)}
                      <span>{transaction.parsedInfo.type}</span>
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Transaction type</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-4 space-y-3">
        {/* Transaction details */}
        {transaction.parsedInfo?.sender && (
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">From</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm truncate">{transaction.parsedInfo.sender}</span>
              <EntityLabel address={transaction.parsedInfo.sender} showTooltip={true} />
            </div>
          </div>
        )}
        
        {transaction.parsedInfo?.receiver && (
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">To</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm truncate">{transaction.parsedInfo.receiver}</span>
              <EntityLabel address={transaction.parsedInfo.receiver} showTooltip={true} />
            </div>
          </div>
        )}
        
        <div className="flex items-center justify-between">
          {transaction.parsedInfo?.amount !== undefined && (
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Amount</span>
              <div>
                {formatSolAmount(transaction.parsedInfo.amount) ? (
                  <>
                    <span className="font-medium">{formatSolAmount(transaction.parsedInfo.amount)?.sol}</span>
                    <span className="text-xs text-muted-foreground ml-1">
                      ({formatSolAmount(transaction.parsedInfo.amount)?.usd})
                    </span>
                  </>
                ) : (
                  <span className="font-medium">Unknown amount</span>
                )}
              </div>
            </div>
          )}
          
          {transaction.blockTime && (
            <div className="flex items-center text-sm text-muted-foreground">
              <Clock size={14} className="mr-1" />
              <span>{formatTimestamp(transaction.blockTime)}</span>
            </div>
          )}
        </div>
        
        {transaction.tags && transaction.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {transaction.tags.map((tag, index) => (
              <Badge key={index} variant="outline" className="flex items-center gap-1">
                <Tag size={12} />
                <span>{tag}</span>
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
      
      <CardFooter className="p-4 pt-0 flex justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => window.open(`https://explorer.solana.com/tx/${transaction.signature}`, '_blank')}
        >
          <ExternalLink size={14} className="mr-1" />
          Explorer
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => onViewDetails(transaction.signature)}
          className="hover:bg-solana-primary/10 hover:text-foreground hover:border-solana-primary/50"
        >
          View Details
        </Button>
      </CardFooter>
    </Card>
  );
};

export default TransactionCard;
