import React, { useState, useEffect } from 'react';
import { Search, History, Clipboard, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchHistoryItem } from '@/types';
import { toast } from 'sonner';
import { PublicKey } from '@solana/web3.js';
import { getEnhancedTransactions } from '@/utils/heliusApi';

interface SearchBarProps {
  onSearch: (address: string, fetchBalance?: boolean) => void;
  isLoading: boolean;
}

const SearchBar: React.FC<SearchBarProps> = ({ onSearch, isLoading }) => {
  const [address, setAddress] = useState<string>('');
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);

  useEffect(() => {
    // Load search history from localStorage
    const history = localStorage.getItem('searchHistory');
    if (history) {
      try {
        setSearchHistory(JSON.parse(history));
      } catch (e) {
        console.error('Failed to parse search history:', e);
      }
    }
  }, []);

  const saveToHistory = (address: string) => {
    const newItem: SearchHistoryItem = {
      address,
      timestamp: Date.now(),
    };
    
    // Add to beginning, remove duplicates, limit to 10 items
    const updatedHistory = [
      newItem,
      ...searchHistory.filter(item => item.address !== address)
    ].slice(0, 10);
    
    setSearchHistory(updatedHistory);
    localStorage.setItem('searchHistory', JSON.stringify(updatedHistory));
  };

  const isValidSolanaAddress = (address: string): boolean => {
    try {
      // Check if the address can be properly converted to a Solana PublicKey
      new PublicKey(address);
      return true;
    } catch (error) {
      return false;
    }
  };

  const isValidTransactionSignature = (signature: string): boolean => {
    // Solana transaction signatures are base58 encoded and typically 88 characters
    // This is a simple validation - we're just checking the length and character set
    const base58Regex = /^[A-HJ-NP-Za-km-z1-9]+$/;
    return signature.length >= 86 && signature.length <= 90 && base58Regex.test(signature);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim()) return;
    
    const trimmedInput = address.trim();
    
    // Validate if it's a Solana wallet address or transaction signature
    if (!isValidSolanaAddress(trimmedInput) && !isValidTransactionSignature(trimmedInput)) {
      toast.error("Invalid input", {
        description: "Please enter a valid Solana wallet address or transaction signature.",
      });
      return;
    }
    
    // Call onSearch to trigger data fetching
    onSearch(trimmedInput, true);
    saveToHistory(trimmedInput);
    setShowHistory(false);
  };

  const handleHistoryClick = (historyAddress: string) => {
    setAddress(historyAddress);
    onSearch(historyAddress, true);
    setShowHistory(false);
  };

  const handleClearAll = () => {
    localStorage.removeItem('searchHistory');
    setSearchHistory([]);
    setShowHistory(false);
    toast.success("History cleared");
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setAddress(text.trim());
      toast.success("Text pasted from clipboard");
    } catch (error) {
      toast.error("Failed to paste from clipboard");
    }
  };

  return (
    <div className="relative w-full max-w-3xl mx-auto animate-fade-in">
      <form onSubmit={handleSubmit} className="relative z-10">
        <div className="relative flex items-center">
          <Input
            type="text"
            placeholder="Enter Solana wallet address or transaction signature"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onFocus={() => setShowHistory(true)}
            className="glass-input pr-32 pl-4 h-14 text-lg focus:ring-2 focus:ring-[#8B5CF6]/50 transition-all border-[#8B5CF6]/20"
          />
          <div className="absolute right-2 flex items-center gap-2">
            {address && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setAddress('')}
                className="h-10 px-2 text-muted-foreground hover:text-foreground"
              >
                <X size={16} />
              </Button>
            )}
            <Button 
              type="button"
              variant="ghost"
              onClick={handlePaste}
              className="h-10 px-2 text-muted-foreground hover:text-foreground"
              title="Paste from clipboard"
            >
              <Clipboard size={16} />
            </Button>
            <Button 
              type="submit" 
              className="bg-gradient-to-r from-[#8B5CF6] to-[#D946EF] hover:opacity-90 text-white font-medium transition-all"
              disabled={isLoading || !address.trim()}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin h-4 w-4 border-2 border-white/20 border-t-white rounded-full"></span>
                  Searching...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Search size={18} />
                  Search
                </span>
              )}
            </Button>
          </div>
        </div>
      </form>

      {/* Search History Dropdown */}
      {showHistory && searchHistory.length > 0 && (
        <div 
          className="absolute top-full left-0 right-0 mt-1 bg-[#1A1F2C]/90 backdrop-blur-lg shadow-lg rounded-md border border-[#8B5CF6]/20 z-20 animate-fade-in"
          onMouseLeave={() => setShowHistory(false)}
        >
          <div className="py-2 px-3 border-b border-border flex justify-between items-center">
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <History size={14} />
              Recent Searches
            </h3>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleClearAll}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear All
            </Button>
          </div>
          <ul>
            {searchHistory.map((item, index) => (
              <li key={`${item.address}-${index}`}>
                <button
                  className="w-full text-left px-4 py-3 hover:bg-[#8B5CF6]/10 flex items-center justify-between transition-colors"
                  onClick={() => handleHistoryClick(item.address)}
                >
                  <div className="flex items-center gap-3">
                    <Search size={14} className="text-[#8B5CF6]" />
                    <span className="font-mono text-sm truncate max-w-[400px]">{item.address}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(item.timestamp).toLocaleDateString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default SearchBar;
