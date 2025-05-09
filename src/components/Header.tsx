
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Wallet, LogOut, RefreshCw } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { getWalletBalance } from '@/utils/solanaUtils';
import { useUser } from '@civic/auth/react';

type SolanaWallet = {
  publicKey: string;
  label: string;
  balance: number | null;
  isConnected: boolean;
}

const Header: React.FC<{ onWalletAnalyze?: (address: string) => void }> = ({ onWalletAnalyze }) => {
  const { user, signOut } = useUser();
  const [wallets, setWallets] = useState<SolanaWallet[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const navigate = useNavigate();

  const shortenAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const connectWallet = async () => {
    const publicKey = window?.solana?.publicKey?.toString();

    if (!publicKey) {
      return;
    }
    setIsConnecting(true);

    try {
      // Check if Phantom is installed
      const isPhantomAvailable =
        window.solana &&
        window.solana.isPhantom;

      if (!isPhantomAvailable) {
        toast.error('Wallet not found', {
          description: 'Please install the Phantom wallet extension.'
        });
        return;
      }

      try {
        // Connect to the wallet
        await window?.solana?.connect();

        // Get real-time balance
        let balance: number | null = null;
        try {

          balance = await getWalletBalance(publicKey);

          toast.success('Balance retrieved', {
            description: `Your wallet has ${balance.toFixed(4)} SOL`
          });
        } catch (balanceError) {
          console.error('Error fetching balance:', balanceError);
          toast.error('Error fetching balance', {
            description: 'Could not retrieve wallet balance'
          });
        }

        const newWallet = {
          publicKey,
          label: 'Phantom',
          balance,
          isConnected: true
        };

        setWallets(prev => [...prev, newWallet]);

        toast.success('Wallet connected', {
          description: `Connected to ${shortenAddress(publicKey)}`
        });

        // Analyze the wallet if the handler is provided
        if (onWalletAnalyze) {
          toast.info('Analyzing wallet', {
            description: 'Retrieving transaction history...'
          });
          onWalletAnalyze(publicKey);
        }

      } catch (error: any) {
        console.error('Connection error:', error);
        toast.error('Connection error', {
          description: error.message || 'Failed to connect to wallet'
        });
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const refreshWallets = async () => {
    if (wallets.length === 0) return;

    setIsRefreshing(true);
    try {
      const updatedWallets = await Promise.all(
        wallets.map(async (wallet) => {
          try {
            if (wallet.isConnected) {
              const newBalance = await getWalletBalance(wallet.publicKey);
              return { ...wallet, balance: newBalance };
            }
            return wallet;
          } catch (error) {
            console.error(`Error updating balance for wallet ${wallet.publicKey}:`, error);
            return wallet;
          }
        })
      );

      setWallets(updatedWallets);
      toast.success('Wallet balances updated');
    } catch (error) {
      console.error('Error refreshing wallets:', error);
      toast.error('Failed to refresh wallet data');
    } finally {
      setIsRefreshing(false);
    }
  };

  const disconnectWallet = async (publicKey: string) => {
    try {
      if (window.solana) {
        // Properly disconnect from the wallet
        await window.solana.disconnect();
      }
      // Remove from state
      setWallets(wallets.filter(wallet => wallet.publicKey !== publicKey));
      toast.info('Wallet disconnected');
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
      toast.error('Error disconnecting wallet');
    }
  };

  // Update wallet balances periodically
  useEffect(() => {
    // Skip if no wallets connected
    if (wallets.length === 0) return;

    const updateWalletBalances = async () => {
      const updatedWallets = await Promise.all(
        wallets.map(async (wallet) => {
          try {
            // Only update if connected
            if (wallet.isConnected) {
              const newBalance = await getWalletBalance(wallet.publicKey);
              return { ...wallet, balance: newBalance };
            }
            return wallet;
          } catch (error) {
            console.error(`Error updating balance for wallet ${wallet.publicKey}:`, error);
            return wallet;
          }
        })
      );

      setWallets(updatedWallets);
    };

    // Update immediately on connect
    updateWalletBalances();

    // Set up interval to update every minute
    const intervalId = setInterval(updateWalletBalances, 60000);

    // Clean up
    return () => clearInterval(intervalId);
  }, [wallets]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  // Add TypeScript declaration for window.solana
  useEffect(() => {
    // This is just for TypeScript support of the window.solana property
    return () => { };
  }, []);

  return (
    <header className="py-4 px-6 border-b border-[#8B5CF6]/20 backdrop-blur-md bg-[#1A1F2C]/50">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/lovable-uploads/38239a24-cd46-42d6-a421-87a64a33cfa4.png"
            alt="SolanSight Logo"
            className="h-10 w-10"
          />
          <h1 className="text-xl font-bold bg-gradient-to-r from-[#8B5CF6] to-[#D946EF] bg-clip-text text-transparent">
            SolanSight
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Display connected wallets */}
          {wallets.length > 0 && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={refreshWallets}
                disabled={isRefreshing}
                className="h-8 w-8"
                title="Refresh wallet balances"
              >
                <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
              </Button>

              {wallets.map((wallet) => (
                <DropdownMenu key={wallet.publicKey}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="border-[#8B5CF6]/20 bg-[#1A1F2C]/80 flex items-center gap-2"
                    >
                      <Wallet size={16} className="text-[#8B5CF6]" />
                      {shortenAddress(wallet.publicKey)}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-[#1A1F2C] border-[#8B5CF6]/20 text-white">
                    <DropdownMenuLabel>{wallet.label}</DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-[#8B5CF6]/10" />
                    <DropdownMenuItem className="flex justify-between">
                      <span>Balance:</span>
                      {wallet.balance !== null ? (
                        <span>{wallet.balance.toFixed(4)} SOL</span>
                      ) : (
                        <Skeleton className="h-4 w-20" />
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer" onClick={() => onWalletAnalyze?.(wallet.publicKey)}>
                      Analyze Wallet
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-[#8B5CF6]/10" />
                    <DropdownMenuItem
                      className="text-red-400 cursor-pointer"
                      onClick={() => disconnectWallet(wallet.publicKey)}
                    >
                      Disconnect
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ))}
            </div>
          )}

          {/* Connect Wallet Button */}

          {user &&
            <div>
              Welcome {user.name ?? user.username}
            </div>

          }
          <Button
            onClick={handleSignOut}
            variant="outline"
            className="border-[#8B5CF6]/20 bg-[#1A1F2C]/80 hover:bg-[#8B5CF6]/10"
          >
            {isConnecting ? (
              <span className="flex items-center gap-2">
                <Wallet size={16} className="animate-pulse" />
                Connecting...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Wallet size={16} />
                Sign out
              </span>
            )}
          </Button>
        </div>
      </div>
    </header>
  );
};

export default Header;
