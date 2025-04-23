
import React from 'react';
import { Bar, BarChart, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { formatAddress, formatTimestamp } from '@/utils/solanaUtils';
import { WalletFundingAnalysis } from '@/types';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Calendar, ArrowUpWideNarrow, ArrowDownWideNarrow, ArrowLeftRight } from 'lucide-react';
import TokenTransferDetails from '@/components/TokenTransferDetails';

interface FundingTimelineProps {
  analysis: WalletFundingAnalysis | null;
  onSelectTransaction?: (signature: string) => void;
}

const FundingTimeline: React.FC<FundingTimelineProps> = ({ analysis, onSelectTransaction }) => {
  // Ensure we have valid data, even if empty
  const safeAnalysis = analysis || {
    walletAddress: '',
    topSources: [],
    totalInflow: 0,
    totalOutflow: 0,
    netBalance: 0,
    timelineData: []
  };
  
  const timelineData = Array.isArray(safeAnalysis.timelineData) ? safeAnalysis.timelineData : [];
  
  const totalInflow = typeof safeAnalysis.totalInflow !== 'number' || isNaN(safeAnalysis.totalInflow) ? 0 : safeAnalysis.totalInflow;
  const totalOutflow = typeof safeAnalysis.totalOutflow !== 'number' || isNaN(safeAnalysis.totalOutflow) ? 0 : safeAnalysis.totalOutflow;
  const netBalance = typeof safeAnalysis.netBalance !== 'number' || isNaN(safeAnalysis.netBalance) ? 0 : safeAnalysis.netBalance;
  
  const chartData = timelineData.map(item => ({
    date: formatTimestamp(item.timestamp || 0),
    timestamp: item.timestamp || 0,
    value: item.isDeposit ? (item.amount || 0) : -(item.amount || 0),
    balance: typeof item.balance === 'number' ? item.balance : 0,
    source: item.source ? formatAddress(item.source) : 'Unknown',
    signature: item.transactionSignature || '',
    type: item.isDeposit ? 'Deposit' : 'Withdrawal',
    amount: typeof item.amount === 'number' && !isNaN(item.amount) ? item.amount : 0,
    rawData: item.rawData // Include raw transaction data if available
  })).filter(item => item.signature && (item.amount > 0 || item.value !== 0));
  
  const chartConfig = {
    deposit: {
      label: 'Deposit',
      theme: { light: '#22c55e', dark: '#4ade80' }
    },
    withdrawal: {
      label: 'Withdrawal',
      theme: { light: '#ef4444', dark: '#f87171' }
    },
    balance: {
      label: 'Balance',
      theme: { light: '#3b82f6', dark: '#60a5fa' }
    }
  };
  
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      
      return (
        <div className="bg-background border rounded-md p-3 text-xs shadow-lg max-w-md">
          <p className="font-medium mb-2">{data.date}</p>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <span className="text-muted-foreground">Type:</span>
              <span className={data.value > 0 ? 'text-emerald-600' : 'text-red-600'}>
                {data.type}
              </span>
              
              <span className="text-muted-foreground">Amount:</span>
              <span className="font-medium">{Math.abs(data.amount).toFixed(2)} SOL</span>
              
              <span className="text-muted-foreground">Balance:</span>
              <span className="font-medium">{data.balance.toFixed(2)} SOL</span>
              
              <span className="text-muted-foreground">Source:</span>
              <span className="font-mono">{data.source}</span>
            </div>
            
            {data.rawData && data.rawData.meta && (
              <>
                <div className="border-t pt-2">
                  <p className="font-medium mb-1">Transaction Details</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <span className="text-muted-foreground">Fee:</span>
                    <span>{(data.rawData.meta.fee / 1e9).toFixed(6)} SOL</span>
                    
                    <span className="text-muted-foreground">Status:</span>
                    <span className="text-emerald-600">
                      {data.rawData.meta.err ? 'Failed' : 'Success'}
                    </span>
                  </div>
                </div>
                
                {data.rawData.meta.preTokenBalances && data.rawData.meta.postTokenBalances && (
                  <TokenTransferDetails
                    tokenData={{
                      preBalances: data.rawData.meta.preTokenBalances,
                      postBalances: data.rawData.meta.postTokenBalances
                    }}
                  />
                )}
              </>
            )}
            
            <Button 
              variant="secondary" 
              size="sm" 
              className="w-full mt-1" 
              onClick={() => data.signature && onSelectTransaction?.(data.signature)}
              disabled={!data.signature}
            >
              View Transaction
            </Button>
          </div>
        </div>
      );
    }
    return null;
  };
  
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <h3 className="font-medium text-lg">Wallet Funding Timeline</h3>
        
        <div className="flex flex-wrap gap-3">
          <div className="bg-card border rounded-lg p-2 flex flex-col items-center min-w-[90px]">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <ArrowUpWideNarrow className="h-3 w-3 text-emerald-500" />
              Inflow
            </span>
            <span className="font-mono font-medium">{totalInflow.toFixed(2)} SOL</span>
          </div>
          
          <div className="bg-card border rounded-lg p-2 flex flex-col items-center min-w-[90px]">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <ArrowDownWideNarrow className="h-3 w-3 text-red-500" />
              Outflow
            </span>
            <span className="font-mono font-medium">{totalOutflow.toFixed(2)} SOL</span>
          </div>
          
          <div className="bg-card border rounded-lg p-2 flex flex-col items-center min-w-[90px]">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <ArrowLeftRight className="h-3 w-3 text-blue-500" />
              Net
            </span>
            <span className={`font-mono font-medium ${netBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {netBalance.toFixed(2)} SOL
            </span>
          </div>
        </div>
      </div>
      
      {safeAnalysis.firstDeposit && (
        <div className="bg-muted/30 border rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <h4 className="font-medium">First Deposit</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Date</p>
              <p className="text-sm">{formatTimestamp(safeAnalysis.firstDeposit.timestamp || 0)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Amount</p>
              <p className="text-sm font-medium">
                {typeof safeAnalysis.firstDeposit.amount === 'number' && !isNaN(safeAnalysis.firstDeposit.amount)
                  ? safeAnalysis.firstDeposit.amount.toFixed(2) 
                  : '0.00'} SOL
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Source</p>
              <TooltipProvider>
                <p className="text-sm font-mono">{formatAddress(safeAnalysis.firstDeposit.source || '', 6)}</p>
              </TooltipProvider>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Transaction</p>
              <Button 
                variant="link" 
                className="text-sm p-0 h-auto" 
                onClick={() => safeAnalysis.firstDeposit?.transactionSignature && onSelectTransaction?.(safeAnalysis.firstDeposit.transactionSignature)}
                disabled={!safeAnalysis.firstDeposit?.transactionSignature}
              >
                View Transaction
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {chartData.length > 0 ? (
        <div className="h-60 md:h-80">
          <ChartContainer config={chartConfig} className="h-full">
            <BarChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 10 }} 
                tickFormatter={(value, index) => {
                  return index % Math.ceil(chartData.length / 6) === 0 ? value : '';
                }}
              />
              <YAxis />
              <Tooltip content={CustomTooltip} />
              <ReferenceLine y={0} stroke="#888" />
              <Bar 
                dataKey="value" 
                fill="var(--color-deposit)" 
                fillOpacity={0.8} 
                stroke="var(--color-deposit)" 
                name="deposit"
                isAnimationActive={false}
              />
              <Bar 
                dataKey="value" 
                fill="var(--color-withdrawal)" 
                fillOpacity={0.8} 
                stroke="var(--color-withdrawal)" 
                name="withdrawal"
                isAnimationActive={false}
              />
            </BarChart>
          </ChartContainer>
        </div>
      ) : (
        <div className="h-60 flex items-center justify-center border rounded-lg">
          <p className="text-muted-foreground">No timeline data available for chart display.</p>
        </div>
      )}
    </div>
  );
};

export default FundingTimeline;
