import React, { useState, useEffect } from 'react';
import { Loader2, AlertTriangle, Tag, FileCode, ArrowRightLeft, Building, User, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EnrichedTransaction, Entity } from '@/types';
import { extractEntities } from '@/utils/entityUtils';
import EntityLabel from './EntityLabel';
import { getEntityIdentificationSync } from '@/utils/entityLabeling';
import { entityService } from '@/services/entityService';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatTimestamp, formatSolAmount } from '@/utils/solanaUtils';

interface EntityAnalysisProps {
  walletAddress: string;
  transactions: EnrichedTransaction[];
  isLoading: boolean;
  onViewDetails: (signature: string) => void;
}

const EntityAnalysis: React.FC<EntityAnalysisProps> = ({ 
  walletAddress, 
  transactions, 
  isLoading, 
  onViewDetails 
}) => {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selectedEntityType, setSelectedEntityType] = useState<string>("all");
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [entityTransactions, setEntityTransactions] = useState<EnrichedTransaction[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  useEffect(() => {
    if (transactions.length > 0 && !isLoading) {
      analyzeEntities();
    }
  }, [transactions, isLoading]);
  
  const analyzeEntities = async () => {
    setIsAnalyzing(true);
    try {
      const extractedEntities = await extractEntities(walletAddress, transactions);
      
      const enhancedEntities = extractedEntities.map(entity => {
        const identification = getEntityIdentificationSync(entity.address);
        if (identification.name && !entity.label) {
          entity.label = identification.name;
        }
        
        if (identification.type && entity.type === 'unknown') {
          entity.type = identification.type as any;
        }
        
        if (identification.isExchange && !entity.tags.includes('exchange')) {
          entity.tags.push('exchange');
        }
        
        if (identification.isProject && !entity.tags.includes('project')) {
          entity.tags.push('project');
        }
        
        return entity;
      });
      
      for (let entity of enhancedEntities) {
        if (entity.type === 'unknown') {
          const relatedTxs = transactions.filter(tx => 
            tx.parsedInfo?.sender === entity.address || 
            tx.parsedInfo?.receiver === entity.address
          );
          
          const isExchange = await entityService.detectExchangePatterns(entity.address, relatedTxs);
          if (isExchange) {
            entity.type = 'exchange';
            if (!entity.tags.includes('exchange')) {
              entity.tags.push('exchange');
            }
            if (!entity.label) {
              entity.label = `Exchange ${entity.address.substring(0, 8)}`;
            }
          }
        }
      }
      
      setEntities(enhancedEntities);
    } catch (error) {
      console.error("Failed to analyze entities:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };
  
  const filteredEntities = selectedEntityType === "all" 
    ? entities 
    : entities.filter(entity => entity.type === selectedEntityType);
  
  const getEntityIcon = (type: string) => {
    switch (type) {
      case 'exchange': return <Building size={16} />;
      case 'contract': return <FileCode size={16} />;
      case 'wallet': return <User size={16} />;
      default: return <ArrowRightLeft size={16} />;
    }
  };

  const handleViewRelatedTransactions = (entity: Entity) => {
    console.log("View entity transactions:", entity);
    setSelectedEntity(entity);
    
    const relatedTxs = transactions.filter(tx => 
      tx.parsedInfo?.sender === entity.address || 
      tx.parsedInfo?.receiver === entity.address
    );
    
    setEntityTransactions(relatedTxs);
    setDialogOpen(true);
  };
  
  const formatSolAmount = (amount?: number) => {
    if (amount === undefined) return { sol: 'Unknown', usd: '' };
    
    let formattedSol;
    if (Math.abs(amount) < 0.000001) {
      formattedSol = amount.toFixed(9);
    } else if (Math.abs(amount) < 0.001) {
      formattedSol = amount.toFixed(7);
    } else if (Math.abs(amount) < 1) {
      formattedSol = amount.toFixed(6);
    } else {
      formattedSol = amount.toFixed(4);
    }
    
    formattedSol = formattedSol.replace(/\.?0+$/, '');
    
    const solPrice = 160;
    const usdValue = amount * solPrice;
    
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
  
  if (isLoading || isAnalyzing) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[200px] py-10">
        <Loader2 size={30} className="animate-spin text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Analyzing entities...</p>
      </div>
    );
  }
  
  if (!transactions.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[200px] py-10">
        <AlertTriangle size={30} className="text-muted-foreground mb-4" />
        <p className="text-muted-foreground">No transactions to analyze.</p>
      </div>
    );
  }
  
  const renderCardView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {filteredEntities.map((entity, index) => (
        <Card key={entity.address + index} className="overflow-hidden hover:shadow-md transition-shadow">
          <CardHeader className="p-4 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-800 border-b">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-2">
                {getEntityIcon(entity.type)}
                <CardTitle className="text-md">{entity.label || "Unnamed Entity"}</CardTitle>
              </div>
              <Badge variant="outline" className="capitalize">
                {entity.type}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="font-mono text-sm truncate flex items-center gap-2">
              {entity.address}
              {getEntityIdentificationSync(entity.address).name && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="bg-green-500/10 text-green-600 dark:bg-green-900/20 dark:text-green-400">
                        <Info size={12} className="mr-1" />
                        Verified
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>This entity is verified in our database</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            
            {entity.notes && (
              <p className="text-sm text-muted-foreground">{entity.notes}</p>
            )}
            
            {entity.tags && entity.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {entity.tags.map((tag, idx) => (
                  <Badge key={idx} variant="outline" className="flex items-center gap-1">
                    <Tag size={12} />
                    <span>{tag}</span>
                  </Badge>
                ))}
              </div>
            )}
            
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full mt-2"
              onClick={() => handleViewRelatedTransactions(entity)}
            >
              View Related Transactions
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
  
  const renderTableView = () => (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Entity</TableHead>
            <TableHead>Address</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Tags</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredEntities.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                No entities found matching the selected criteria
              </TableCell>
            </TableRow>
          ) : (
            filteredEntities.map((entity, index) => (
              <TableRow key={entity.address + index}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {getEntityIcon(entity.type)}
                    <span>{entity.label || "Unnamed Entity"}</span>
                    {getEntityIdentificationSync(entity.address).name && (
                      <Badge variant="outline" className="bg-green-500/10 text-green-600 dark:bg-green-900/20 dark:text-green-400">
                        Verified
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {entity.address.substring(0, 12)}...
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {entity.type}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {entity.tags.slice(0, 3).map((tag, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {entity.tags.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{entity.tags.length - 3}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleViewRelatedTransactions(entity)}
                  >
                    View Details
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
  
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-medium">Entity Analysis</h2>
        <div className="flex gap-2">
          <Select 
            value={selectedEntityType} 
            onValueChange={setSelectedEntityType}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Entities</SelectItem>
              <SelectItem value="exchange">Exchanges</SelectItem>
              <SelectItem value="wallet">Wallets</SelectItem>
              <SelectItem value="contract">Contracts</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
          
          <div className="flex rounded-md border">
            <Button 
              variant={viewMode === 'cards' ? 'default' : 'ghost'} 
              size="sm" 
              onClick={() => setViewMode('cards')}
              className="rounded-r-none"
            >
              Cards
            </Button>
            <Button 
              variant={viewMode === 'table' ? 'default' : 'ghost'} 
              size="sm" 
              onClick={() => setViewMode('table')}
              className="rounded-l-none"
            >
              Table
            </Button>
          </div>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={analyzeEntities}
            className="flex items-center gap-1"
          >
            Refresh
          </Button>
        </div>
      </div>
      
      {entities.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">No entities detected in the transaction history.</p>
        </Card>
      ) : (
        viewMode === 'cards' ? renderCardView() : renderTableView()
      )}
      
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedEntity && getEntityIcon(selectedEntity.type)}
              {selectedEntity?.label || "Entity"} Transactions
            </DialogTitle>
          </DialogHeader>
          
          <div className="mt-4">
            {entityTransactions.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No transactions found for this entity.</p>
              </div>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Direction</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entityTransactions.map(tx => {
                      const formattedAmount = formatSolAmount(tx.parsedInfo?.amount);
                      const isIncoming = selectedEntity && tx.parsedInfo?.receiver === selectedEntity.address;
                      
                      return (
                        <TableRow key={tx.signature}>
                          <TableCell className="text-xs">
                            {tx.blockTime ? formatTimestamp(tx.blockTime) : '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {tx.parsedInfo?.type || 'Unknown'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{formattedAmount.sol}</div>
                              <div className="text-xs text-muted-foreground">{formattedAmount.usd}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={isIncoming ? "secondary" : "outline"} className={isIncoming ? "bg-green-500/10 text-green-600 dark:bg-green-900/20 dark:text-green-400" : ""}>
                              {isIncoming ? 'Incoming' : 'Outgoing'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => {
                                onViewDetails(tx.signature);
                                setDialogOpen(false);
                              }}
                            >
                              View Details
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EntityAnalysis;
