
import { supabase } from '@/integrations/supabase/client';

/**
 * Service for interacting with the entity database
 */
export const entityService = {
  /**
   * Get entity information from the database
   */
  async getEntityInfo(address: string) {
    try {
      const { data, error } = await supabase
        .rpc('get_entity_info', { wallet_addr: address });
      
      if (error) {
        console.error('Error fetching entity info:', error);
        return null;
      }
      
      return data && data.length > 0 ? data[0] : null;
    } catch (error) {
      console.error('Failed to fetch entity info:', error);
      return null;
    }
  },
  
  /**
   * Check if an address might be an exchange based on transaction patterns
   */
  async detectExchangePatterns(address: string, transactions: any[]) {
    // Calculate some basic metrics
    const transactionCount = transactions.length;
    
    // Count unique counterparties
    const counterparties = new Set();
    transactions.forEach(tx => {
      if (tx.parsedInfo?.sender && tx.parsedInfo.sender !== address) {
        counterparties.add(tx.parsedInfo.sender);
      }
      if (tx.parsedInfo?.receiver && tx.parsedInfo.receiver !== address) {
        counterparties.add(tx.parsedInfo.receiver);
      }
    });
    
    // Calculate total volume
    const totalVolume = transactions.reduce((sum, tx) => sum + (tx.parsedInfo?.amount || 0), 0);
    const highVolume = totalVolume > 1000; // Arbitrary threshold
    
    try {
      const { data, error } = await supabase
        .rpc('detect_exchange_patterns', {
          wallet_address: address,
          transaction_count: transactionCount,
          unique_counterparties: counterparties.size,
          high_volume: highVolume
        });
      
      if (error) {
        console.error('Error detecting exchange patterns:', error);
        return false;
      }
      
      return data || false;
    } catch (error) {
      console.error('Failed to detect exchange patterns:', error);
      return false;
    }
  },
  
  /**
   * Get all known entities from the database
   */
  async getAllEntities() {
    try {
      const { data, error } = await supabase
        .from('known_entities')
        .select('*');
      
      if (error) {
        console.error('Error fetching entities:', error);
        return [];
      }
      
      return data || [];
    } catch (error) {
      console.error('Failed to fetch entities:', error);
      return [];
    }
  },
  
  /**
   * Search entities by address or label
   */
  async searchEntities(query: string) {
    try {
      const { data, error } = await supabase
        .from('known_entities')
        .select('*')
        .or(`address.ilike.%${query}%,label.ilike.%${query}%`)
        .limit(10);
      
      if (error) {
        console.error('Error searching entities:', error);
        return [];
      }
      
      return data || [];
    } catch (error) {
      console.error('Failed to search entities:', error);
      return [];
    }
  }
};
