
import { supabase } from '@/integrations/supabase/client';

// Known exchange wallets and entity database
// This would typically be loaded from an external API or database
export const knownExchanges: Record<string, string> = {
  'HN8SG8J4vd29mTU4pD4x4tJSMJ5XTgP9mJbngwsvuXh6': 'Binance',
  'FmhXe9uG6NtTfWzJTzR2SCJ3LJHLvn1HpMJR3GyLoqSD': 'Kraken',
  'D5yQ3Q76KSqkrBmWYxEMZhhP1A3EncWYPU91XxRLUcGQ': 'Coinbase',
  '4pmfRbPCXzbwHzFzAR3ornVYc3zLuLv8YbYjvra3Y8JA': 'FTX',
  'GEhAuFe9ixNBGiY86UihzCQ3HJLcd2Tbj3UU9AQCFihM': 'Gemini',
  '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E': 'Solana Foundation',
  '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM': 'Solana Labs Treasury',
};

// Known project wallets
export const knownProjects: Record<string, string> = {
  'E2TGeCi89XiR4UUdqKFiRxocfPjDXkfNQP9CwZfHVBCU': 'Serum',
  'BQcdHdAQW1hczDbBi9hiegXAR7A98Q9jx3X3iBBBDiq4': 'Mango Markets',
  'So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo': 'Solend',
  'BXAbeHVpoV4MZ6kGcZ3zX9LfgWRKpMac9SjkHnoZZLMJ': 'Raydium',
  'A4P5xQ371g7YnM49dCK8wBmJQwjuZeT9ti7qMxLPwLNF': 'Jupiter Aggregator'
};

// Platforms and other known entities
export const knownEntities: Record<string, { name: string, type: string }> = {
  '11111111111111111111111111111111': { name: 'System Program', type: 'core-protocol' },
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA': { name: 'Token Program', type: 'core-protocol' },
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL': { name: 'Associated Token Program', type: 'core-protocol' },
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr': { name: 'Memo Program', type: 'core-protocol' },
  '4skJ85cdxQAFVKbcGgfun8iZPL7BadVYXG3kGEGkufqA': { name: 'Orca Whirlpool', type: 'dex' },
  'DjVE6JNiYqPL2QXyCUUh8rNjHrbz9hXHNYt99MQ59qw1': { name: 'Metaplex', type: 'nft-protocol' },
  'GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR': { name: 'Magic Eden', type: 'nft-marketplace' },
};

/**
 * Check if an address belongs to a known exchange
 */
export const identifyExchange = (address: string): string | null => {
  return knownExchanges[address] || null;
};

/**
 * Check if an address belongs to a known project
 */
export const identifyProject = (address: string): string | null => {
  return knownProjects[address] || null;
};

/**
 * Check if an address belongs to a known entity
 */
export const identifyEntity = (address: string): { name: string, type: string } | null => {
  return knownEntities[address] || null;
};

/**
 * Identify the type of wallet based on transaction patterns
 * This would normally use more sophisticated analysis
 */
export const identifyWalletType = (transactions: any[]): string => {
  if (transactions.length > 100) {
    return 'high-volume-trader';
  } else if (transactions.length > 50) {
    return 'active-trader';
  } else if (transactions.length > 20) {
    return 'casual-trader';
  } else {
    return 'light-user';
  }
};

/**
 * Fetch entity information from the Supabase database
 */
export const fetchEntityFromDatabase = async (address: string): Promise<any | null> => {
  try {
    const { data, error } = await supabase
      .rpc('get_entity_info', { wallet_addr: address });
    
    if (error) {
      console.error('Error fetching entity from database:', error);
      return null;
    }
    
    if (data && data.length > 0) {
      return {
        name: data[0].entity_label,
        type: data[0].entity_type,
        tags: data[0].entity_tags,
        verified: data[0].entity_verified,
        notes: data[0].entity_notes,
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching entity details:', error);
    return null;
  }
};

/**
 * Get a complete entity identification for an address
 * First checks the database, then falls back to local lookup
 */
export const getEntityIdentification = async (address: string): Promise<{
  name: string | null;
  type: string | null;
  isExchange: boolean;
  isProject: boolean;
  isKnownEntity: boolean;
  isVerified: boolean;
}> => {
  // First try to get from the database
  const dbEntity = await fetchEntityFromDatabase(address);
  
  if (dbEntity) {
    return {
      name: dbEntity.name,
      type: dbEntity.type,
      isExchange: dbEntity.type === 'exchange',
      isProject: dbEntity.type === 'project',
      isKnownEntity: true,
      isVerified: dbEntity.verified
    };
  }
  
  // Fall back to local lookup
  const exchangeName = identifyExchange(address);
  const projectName = identifyProject(address);
  const entity = identifyEntity(address);
  
  return {
    name: exchangeName || projectName || (entity ? entity.name : null),
    type: entity ? entity.type : (exchangeName ? 'exchange' : (projectName ? 'project' : null)),
    isExchange: !!exchangeName,
    isProject: !!projectName,
    isKnownEntity: !!entity,
    isVerified: false
  };
};

/**
 * Synchronous version for backward compatibility
 */
export const getEntityIdentificationSync = (address: string): {
  name: string | null;
  type: string | null;
  isExchange: boolean;
  isProject: boolean;
  isKnownEntity: boolean;
} => {
  const exchangeName = identifyExchange(address);
  const projectName = identifyProject(address);
  const entity = identifyEntity(address);
  
  return {
    name: exchangeName || projectName || (entity ? entity.name : null),
    type: entity ? entity.type : (exchangeName ? 'exchange' : (projectName ? 'project' : null)),
    isExchange: !!exchangeName,
    isProject: !!projectName,
    isKnownEntity: !!entity
  };
};
