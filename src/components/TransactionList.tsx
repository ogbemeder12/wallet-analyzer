
import React, { useState } from 'react';
import { Filter, Loader2 } from 'lucide-react';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { EnrichedTransaction } from '@/types';
import TransactionCard from './TransactionCard';

interface TransactionListProps {
  transactions: EnrichedTransaction[];
  isLoading: boolean;
  onViewDetails: (signature: string) => void;
}

const TransactionList: React.FC<TransactionListProps> = ({ 
  transactions, 
  isLoading, 
  onViewDetails 
}) => {
  const [sortBy, setSortBy] = useState<'time' | 'amount' | 'risk'>('time');
  const [filterRisk, setFilterRisk] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [filterType, setFilterType] = useState<string | null>(null);
  
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[200px] py-10">
        <Loader2 size={30} className="animate-spin text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Loading transactions...</p>
      </div>
    );
  }
  
  if (!transactions.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[200px] py-10">
        <p className="text-muted-foreground">No transactions found.</p>
      </div>
    );
  }
  
  // Filter transactions
  let filteredTransactions = [...transactions];
  
  if (filterRisk !== 'all') {
    filteredTransactions = filteredTransactions.filter(tx => {
      const score = tx.riskScore || 0;
      if (filterRisk === 'high') return score > 70;
      if (filterRisk === 'medium') return score > 40 && score <= 70;
      if (filterRisk === 'low') return score <= 40;
      return true;
    });
  }
  
  if (filterType) {
    filteredTransactions = filteredTransactions.filter(tx => 
      tx.parsedInfo?.type === filterType
    );
  }
  
  // Sort transactions
  filteredTransactions.sort((a, b) => {
    if (sortBy === 'time') {
      return (b.blockTime || 0) - (a.blockTime || 0);
    }
    if (sortBy === 'amount') {
      return (b.parsedInfo?.amount || 0) - (a.parsedInfo?.amount || 0);
    }
    if (sortBy === 'risk') {
      return (b.riskScore || 0) - (a.riskScore || 0);
    }
    return 0;
  });
  
  // Get unique transaction types for filter
  const transactionTypes = Array.from(
    new Set(transactions.map(tx => tx.parsedInfo?.type).filter(Boolean) as string[])
  );
  
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-medium">Transactions ({filteredTransactions.length})</h2>
        <div className="flex gap-2">
          {/* Sort Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="flex items-center gap-1">
                <span>Sort: {sortBy === 'time' ? 'Time' : sortBy === 'amount' ? 'Amount' : 'Risk'}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Sort By</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setSortBy('time')}>
                  Time
                  {sortBy === 'time' && <Check className="ml-auto h-4 w-4" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy('amount')}>
                  Amount
                  {sortBy === 'amount' && <Check className="ml-auto h-4 w-4" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy('risk')}>
                  Risk Score
                  {sortBy === 'risk' && <Check className="ml-auto h-4 w-4" />}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          
          {/* Filter Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="flex items-center gap-1">
                <Filter size={14} />
                <span>Filter</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Risk Level</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setFilterRisk('all')}>
                  All Risks
                  {filterRisk === 'all' && <Check className="ml-auto h-4 w-4" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterRisk('high')}>
                  High Risk
                  {filterRisk === 'high' && <Check className="ml-auto h-4 w-4" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterRisk('medium')}>
                  Medium Risk
                  {filterRisk === 'medium' && <Check className="ml-auto h-4 w-4" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterRisk('low')}>
                  Low Risk
                  {filterRisk === 'low' && <Check className="ml-auto h-4 w-4" />}
                </DropdownMenuItem>
              </DropdownMenuGroup>
              
              {transactionTypes.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Transaction Type</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => setFilterType(null)}>
                      All Types
                      {filterType === null && <Check className="ml-auto h-4 w-4" />}
                    </DropdownMenuItem>
                    {transactionTypes.map((type) => (
                      <DropdownMenuItem key={type} onClick={() => setFilterType(type)}>
                        {type}
                        {filterType === type && <Check className="ml-auto h-4 w-4" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTransactions.map((transaction, index) => (
          <div 
            key={transaction.signature} 
            className={`animation-delay-${(index % 3) * 100}`}
          >
            <TransactionCard 
              transaction={transaction} 
              onViewDetails={onViewDetails} 
            />
          </div>
        ))}
      </div>
      
      {filteredTransactions.length === 0 && (
        <div className="flex flex-col items-center justify-center min-h-[200px] py-10">
          <p className="text-muted-foreground">No transactions match your filters.</p>
          <Button 
            variant="link" 
            onClick={() => {
              setFilterRisk('all');
              setFilterType(null);
            }}
          >
            Clear Filters
          </Button>
        </div>
      )}
    </div>
  );
};

// We need to import Check for the dropdown menu checkmarks
import { Check } from 'lucide-react';

export default TransactionList;
