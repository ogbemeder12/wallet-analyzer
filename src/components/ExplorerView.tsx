
import React, { useState, useEffect } from 'react';
import { Search, ArrowRight, Loader2, AlertTriangle, ExternalLink, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { EnrichedTransaction } from '@/types';
import { formatAddress, formatTimestamp } from '@/utils/solanaUtils';

interface ExplorerViewProps {
  walletAddress: string;
  transactions: EnrichedTransaction[];
  isLoading: boolean;
  onViewDetails: (signature: string) => void;
}

const ExplorerView: React.FC<ExplorerViewProps> = ({ 
  walletAddress, 
  transactions, 
  isLoading, 
  onViewDetails 
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filteredTxs, setFilteredTxs] = useState<EnrichedTransaction[]>([]);
  const [addressRelations, setAddressRelations] = useState<{address: string, txCount: number}[]>([]);
  const [explorerTab, setExplorerTab] = useState<string>('transactions');
  
  useEffect(() => {
    if (transactions.length) {
      // Apply search filter when transactions or search query changes
      applySearchFilter();
      
      // Extract address relations
      extractAddressRelations();
    }
  }, [transactions, searchQuery]);
  
  const applySearchFilter = () => {
    if (!searchQuery.trim()) {
      setFilteredTxs(transactions);
      return;
    }
    
    const query = searchQuery.toLowerCase();
    const filtered = transactions.filter(tx => 
      tx.signature.toLowerCase().includes(query) ||
      tx.parsedInfo?.sender?.toLowerCase().includes(query) ||
      tx.parsedInfo?.receiver?.toLowerCase().includes(query) ||
      tx.parsedInfo?.type?.toLowerCase().includes(query) ||
      (tx.tags && tx.tags.some(tag => tag.toLowerCase().includes(query)))
    );
    
    setFilteredTxs(filtered);
  };
  
  const extractAddressRelations = () => {
    const addressMap = new Map<string, number>();
    
    transactions.forEach(tx => {
      const sender = tx.parsedInfo?.sender;
      const receiver = tx.parsedInfo?.receiver;
      
      if (sender && sender !== walletAddress) {
        addressMap.set(sender, (addressMap.get(sender) || 0) + 1);
      }
      
      if (receiver && receiver !== walletAddress) {
        addressMap.set(receiver, (addressMap.get(receiver) || 0) + 1);
      }
    });
    
    const sortedRelations = Array.from(addressMap.entries())
      .map(([address, txCount]) => ({ address, txCount }))
      .sort((a, b) => b.txCount - a.txCount)
      .slice(0, 10);
    
    setAddressRelations(sortedRelations);
  };
  
  // Format SOL amount to avoid scientific notation and add USD value
  const formatSolAmount = (amount?: number) => {
    if (amount === undefined) return '-';
    
    // Format SOL with appropriate precision based on value size
    let formattedSol;
    if (amount < 0.001) {
      formattedSol = amount.toFixed(9); // More precision for very small amounts
    } else if (amount < 1) {
      formattedSol = amount.toFixed(6); // Medium precision for small amounts
    } else {
      formattedSol = amount.toFixed(4); // Standard precision for normal amounts
    }
    
    // Remove trailing zeros after decimal
    formattedSol = formattedSol.replace(/\.?0+$/, '');
    
    return `${formattedSol} SOL`;
  };
  
  const exportTransactionsCSV = () => {
    if (!filteredTxs.length) return;
    
    const headers = [
      'Signature', 
      'Block Time', 
      'Sender', 
      'Receiver', 
      'Amount', 
      'Type', 
      'Risk Score'
    ];
    
    const csvRows = [
      headers.join(','),
      ...filteredTxs.map(tx => [
        tx.signature,
        tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : '',
        tx.parsedInfo?.sender || '',
        tx.parsedInfo?.receiver || '',
        tx.parsedInfo?.amount || '',
        tx.parsedInfo?.type || '',
        tx.riskScore || ''
      ].join(','))
    ];
    
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `solana-transactions-${walletAddress.slice(0, 8)}.csv`);
    link.click();
  };
  
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[200px] py-10">
        <Loader2 size={30} className="animate-spin text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Loading explorer view...</p>
      </div>
    );
  }
  
  if (!transactions.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[200px] py-10">
        <AlertTriangle size={30} className="text-muted-foreground mb-4" />
        <p className="text-muted-foreground">No transaction data to explore.</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-xl font-medium">Explorer</h2>
        
        <div className="flex w-full md:w-auto gap-2">
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search transactions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          
          <Button
            variant="outline"
            size="icon"
            onClick={exportTransactionsCSV}
            disabled={!filteredTxs.length}
            title="Export as CSV"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <Tabs value={explorerTab} onValueChange={setExplorerTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="addresses">Related Addresses</TabsTrigger>
        </TabsList>
        
        <TabsContent value="transactions" className="space-y-4">
          {filteredTxs.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No transactions match your search.</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="px-4 py-3 text-left font-medium">Signature</th>
                      <th className="px-4 py-3 text-left font-medium">Time</th>
                      <th className="px-4 py-3 text-left font-medium">From</th>
                      <th className="px-4 py-3 text-left font-medium">To</th>
                      <th className="px-4 py-3 text-left font-medium">Amount</th>
                      <th className="px-4 py-3 text-left font-medium">Type</th>
                      <th className="px-4 py-3 text-left font-medium">Risk</th>
                      <th className="px-4 py-3 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTxs.map((tx) => (
                      <tr 
                        key={tx.signature} 
                        className="border-t hover:bg-muted/50 transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs">
                          {formatAddress(tx.signature, 8)}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {tx.blockTime ? formatTimestamp(tx.blockTime) : '-'}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {tx.parsedInfo?.sender ? formatAddress(tx.parsedInfo.sender, 4) : '-'}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {tx.parsedInfo?.receiver ? formatAddress(tx.parsedInfo.receiver, 4) : '-'}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {formatSolAmount(tx.parsedInfo?.amount)}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {tx.parsedInfo?.type ? (
                            <Badge variant="outline" className="capitalize">
                              {tx.parsedInfo.type}
                            </Badge>
                          ) : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center">
                            <div 
                              className={`h-2 w-full max-w-24 rounded-full ${
                                (tx.riskScore || 0) > 70 ? 'bg-red-500' :
                                (tx.riskScore || 0) > 40 ? 'bg-amber-500' :
                                'bg-green-500'
                              }`}
                            ></div>
                            <span className="ml-2 text-xs">
                              {tx.riskScore || '0'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => onViewDetails(tx.signature)}
                              title="View Details"
                            >
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => window.open(`https://explorer.solana.com/tx/${tx.signature}`, '_blank')}
                              title="View on Solana Explorer"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="addresses" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Related Addresses</CardTitle>
            </CardHeader>
            <CardContent>
              {addressRelations.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">
                  No related addresses found.
                </p>
              ) : (
                <div className="space-y-4">
                  {addressRelations.map((relation) => (
                    <div 
                      key={relation.address}
                      className="flex items-center justify-between p-3 rounded-md border hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="font-mono text-sm truncate">{relation.address}</div>
                        <div className="text-xs text-muted-foreground">
                          {relation.txCount} transaction{relation.txCount !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSearchQuery(relation.address)}
                          className="text-xs"
                        >
                          View Transactions
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => window.open(`https://explorer.solana.com/address/${relation.address}`, '_blank')}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ExplorerView;
