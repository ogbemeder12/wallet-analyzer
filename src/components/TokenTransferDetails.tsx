
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { formatAddress } from '@/utils/solanaUtils';
import { Card } from '@/components/ui/card';

interface TokenTransferDetailsProps {
  tokenData: {
    preBalances: Array<{
      accountIndex: number;
      mint: string;
      owner: string;
      uiTokenAmount: {
        amount: string;
        decimals: number;
        uiAmount: number | null;
        uiAmountString: string;
      };
    }>;
    postBalances: Array<{
      accountIndex: number;
      mint: string;
      owner: string;
      uiTokenAmount: {
        amount: string;
        decimals: number;
        uiAmount: number | null;
        uiAmountString: string;
      };
    }>;
  };
}

const TokenTransferDetails: React.FC<TokenTransferDetailsProps> = ({ tokenData }) => {
  if (!tokenData || !tokenData.postBalances || !tokenData.preBalances || tokenData.postBalances.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium">Token Balances</h4>
      <div className="grid gap-4">
        {tokenData.postBalances.map((balance, index) => {
          const preBalance = tokenData.preBalances.find(pre => pre.mint === balance.mint && pre.owner === balance.owner) || 
                            tokenData.preBalances[index];
          const change = preBalance 
            ? Number(balance.uiTokenAmount.uiAmountString) - Number(preBalance.uiTokenAmount.uiAmountString)
            : 0;
          
          return (
            <Card key={`${balance.owner}-${index}`} className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Token Account</span>
                <Badge variant={change >= 0 ? "secondary" : "destructive"}>
                  {change >= 0 ? '+' : ''}{change.toFixed(6)}
                </Badge>
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground">Owner</p>
                  <p className="font-mono">{formatAddress(balance.owner)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Mint</p>
                  <p className="font-mono">{formatAddress(balance.mint)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Previous Balance</p>
                  <p>{preBalance?.uiTokenAmount.uiAmountString || '0'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">New Balance</p>
                  <p>{balance.uiTokenAmount.uiAmountString}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default TokenTransferDetails;
