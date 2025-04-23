
import React, { useState, useEffect } from 'react';
import { AlertTriangle, Network, Clock, DollarSign } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { EnrichedTransaction, TransactionCluster } from '@/types';
import { clusterTransactions } from '@/utils/entityUtils';
import { detectTransactionClusters } from '@/utils/heliusApi';

interface TransactionClustersProps {
  transactions: EnrichedTransaction[];
  isLoading: boolean;
  onViewDetails?: (signature: string) => void;
  clusters?: TransactionCluster[]; // Clusters from Helius API
}

const TransactionClusters: React.FC<TransactionClustersProps> = ({ 
  transactions, 
  isLoading,
  onViewDetails,
  clusters: initialClusters = []
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [selectedCluster, setSelectedCluster] = useState<TransactionCluster | null>(null);
  const [localClusters, setLocalClusters] = useState<TransactionCluster[]>(initialClusters);
  
  useEffect(() => {
    if (transactions.length > 0 && !isLoading) {
      analyzeClusters();
    }
  }, [transactions, isLoading]);

  useEffect(() => {
    if (initialClusters.length > 0) {
      setLocalClusters(initialClusters);
    }
  }, [initialClusters]);
  
  const analyzeClusters = async () => {
    setIsAnalyzing(true);
    try {
      // Pass transactions array directly instead of wallet address
      const detectedClusters = await detectTransactionClusters(transactions);
      setLocalClusters(detectedClusters);
    } catch (error) {
      console.error("Failed to analyze transaction clusters:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };
  
  const getClusterIcon = (type: string) => {
    switch (type) {
      case 'address-based': return <Network className="h-4 w-4" />;
      case 'time-based': return <Clock className="h-4 w-4" />;
      case 'amount-based': return <DollarSign className="h-4 w-4" />;
      default: return <Network className="h-4 w-4" />;
    }
  };
  
  if (isLoading || isAnalyzing) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-medium">Transaction Clusters</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array(4).fill(0).map((_, index) => (
            <Card key={index}>
              <CardHeader className="p-4">
                <CardTitle className="flex items-center gap-2">
                  <Skeleton className="w-4 h-4 rounded-full" />
                  <Skeleton className="w-40 h-5" />
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <Skeleton className="w-full h-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }
  
  if (!transactions.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[200px] py-10">
        <AlertTriangle className="h-8 w-8 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">No transactions to analyze.</p>
      </div>
    );
  }
  
  if (selectedCluster) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Button 
            variant="outline" 
            onClick={() => setSelectedCluster(null)}
          >
            ← Back to clusters
          </Button>
          <Badge variant={selectedCluster.riskScore > 70 ? "destructive" : "outline"}>
            Risk Score: {selectedCluster.riskScore.toFixed(0)}
          </Badge>
        </div>
        
        <Card>
          <CardHeader className="p-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                {getClusterIcon(selectedCluster.type)}
                <span>{selectedCluster.name}</span>
              </CardTitle>
              <Badge variant="outline" className="capitalize">
                {selectedCluster.type.replace('-based', '')}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {selectedCluster.detectionReason}
            </p>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-2">Related Entities ({selectedCluster.entities.length})</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedCluster.entities.slice(0, 10).map((entity, idx) => (
                    <Badge key={idx} variant="secondary" className="font-mono">
                      {entity.substring(0, 4)}...{entity.substring(entity.length - 4)}
                    </Badge>
                  ))}
                  {selectedCluster.entities.length > 10 && (
                    <Badge variant="outline">+{selectedCluster.entities.length - 10} more</Badge>
                  )}
                </div>
              </div>
              
              <div>
                <h3 className="text-sm font-medium mb-2">Transactions ({selectedCluster.transactions.length})</h3>
                <div className="space-y-2 max-h-[300px] overflow-auto pr-2">
                  {selectedCluster.transactions.map((tx) => (
                    <div 
                      key={tx.signature} 
                      className="bg-muted p-2 rounded-md hover:bg-muted/80 transition-colors cursor-pointer"
                      onClick={() => onViewDetails?.(tx.signature)}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-xs">
                          {tx.signature.substring(0, 8)}...{tx.signature.substring(tx.signature.length - 8)}
                        </span>
                        <Badge variant="outline" className={tx.riskScore && tx.riskScore > 70 ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" : ""}>
                          {tx.riskScore ? `Risk: ${tx.riskScore}` : "Unknown risk"}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs">
                        {tx.blockTime && (
                          <span className="text-muted-foreground">
                            {new Date(tx.blockTime * 1000).toLocaleString()}
                          </span>
                        )}
                        {tx.parsedInfo?.amount && (
                          <span>{tx.parsedInfo.amount} SOL</span>
                        )}
                        {tx.parsedInfo?.type && (
                          <span className="capitalize">{tx.parsedInfo.type}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-medium">Transaction Clusters</h2>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={analyzeClusters}
        >
          Refresh Analysis
        </Button>
      </div>
      
      {localClusters.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[200px] py-10">
          <p className="text-muted-foreground">No clusters detected in these transactions.</p>
          <Button 
            className="mt-4" 
            variant="outline" 
            onClick={analyzeClusters}
          >
            Try Advanced Analysis
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {localClusters.map((cluster) => (
            <Card 
              key={cluster.id} 
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelectedCluster(cluster)}
            >
              <CardHeader className="p-4">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-md flex items-center gap-2">
                    {getClusterIcon(cluster.type)}
                    <span>{cluster.name}</span>
                  </CardTitle>
                  <Badge variant="outline" className="capitalize">
                    {cluster.type.replace('-based', '')}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span>Risk Assessment</span>
                    <span className={`font-medium ${
                      cluster.riskScore > 70 ? 'text-red-600 dark:text-red-400' :
                      cluster.riskScore > 40 ? 'text-amber-600 dark:text-amber-400' :
                      'text-green-600 dark:text-green-400'
                    }`}>
                      {cluster.riskScore > 70 ? 'High' : 
                       cluster.riskScore > 40 ? 'Medium' : 'Low'}
                    </span>
                  </div>
                  
                  <Progress
                    value={cluster.riskScore}
                    max={100}
                    className={`h-2 ${
                      cluster.riskScore > 70 ? 'bg-red-100 dark:bg-red-900/30' :
                      cluster.riskScore > 40 ? 'bg-amber-100 dark:bg-amber-900/30' :
                      'bg-green-100 dark:bg-green-900/30'
                    }`}
                  />
                  
                  <p className="text-sm text-muted-foreground">{cluster.detectionReason}</p>
                  
                  <div className="flex justify-between items-center pt-2">
                    <span className="text-sm">{cluster.transactions.length} transactions</span>
                    <span className="text-sm">{cluster.entities.length} entities</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default TransactionClusters;
