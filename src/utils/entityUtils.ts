
// Add the missing getKnownEntities function
export async function getKnownEntities(walletAddress: string, transactions: any[] = []) {
  try {
    // Extract unique addresses from transactions
    const addresses = new Set<string>();
    
    // Add the wallet address itself
    addresses.add(walletAddress);
    
    // Add all counterparties from transactions
    transactions.forEach(tx => {
      if (tx.parsedInfo?.sender) addresses.add(tx.parsedInfo.sender);
      if (tx.parsedInfo?.receiver) addresses.add(tx.parsedInfo.receiver);
    });
    
    // Convert to array and filter out empty strings
    const uniqueAddresses = Array.from(addresses).filter(Boolean);
    
    // Fetch entity information from Supabase or use local data
    // For now, we'll return a simple mapping of known entities
    const knownEntities = uniqueAddresses.map(address => {
      // Here you could lookup entities from a database
      // For now, return basic information
      return {
        address,
        label: address === walletAddress ? 'Current Wallet' : 
               address.length < 10 ? 'Invalid Address' : 
               `Address ${address.substring(0, 4)}...${address.substring(address.length - 4)}`,
        type: address === walletAddress ? 'wallet' : 'unknown'
      };
    });
    
    return knownEntities;
  } catch (error) {
    console.error('Error getting known entities:', error);
    return [];
  }
}

// Add the extractEntities function - used by EntityAnalysis.tsx
export async function extractEntities(walletAddress: string, transactions: any[] = []) {
  try {
    // Get known entities first
    const knownEntities = await getKnownEntities(walletAddress, transactions);
    
    // Transform into the Entity format expected by the component
    const entities = knownEntities.map(entity => {
      return {
        address: entity.address,
        label: entity.label,
        type: entity.type as any,
        tags: [],
        notes: '',
        transactionCount: transactions.filter(tx => 
          tx.parsedInfo?.sender === entity.address || 
          tx.parsedInfo?.receiver === entity.address
        ).length
      };
    });
    
    // Add some tags based on transaction patterns
    for (let entity of entities) {
      // Skip the current wallet
      if (entity.address === walletAddress) continue;
      
      const relatedTxs = transactions.filter(tx =>
        tx.parsedInfo?.sender === entity.address || 
        tx.parsedInfo?.receiver === entity.address
      );
      
      // Check for frequent interactions (more than 3)
      if (relatedTxs.length > 3) {
        entity.tags.push('frequent');
      }
      
      // Check for high value transactions
      const highValueTx = relatedTxs.find(tx => 
        tx.parsedInfo?.amount && 
        parseFloat(tx.parsedInfo.amount) > 10
      );
      
      if (highValueTx) {
        entity.tags.push('high-value');
      }
      
      // Add recency tag if transaction in last day
      const recentTx = relatedTxs.find(tx => {
        if (!tx.blockTime) return false;
        const txDate = new Date(tx.blockTime * 1000);
        const dayAgo = new Date();
        dayAgo.setDate(dayAgo.getDate() - 1);
        return txDate > dayAgo;
      });
      
      if (recentTx) {
        entity.tags.push('recent');
      }
    }
    
    return entities;
  } catch (error) {
    console.error('Error extracting entities:', error);
    return [];
  }
}

// Add the clusterTransactions function - used by TransactionClusters.tsx
export async function clusterTransactions(transactions: any[] = []) {
  // Default cluster types we'll check for
  const clusterTypes = ['address-based', 'time-based', 'amount-based'];
  const results = [];
  
  try {
    // Create unique ID for each cluster
    let clusterId = 1;
    
    // 1. Address-based clustering (transactions with the same counterparty)
    const addressGroups = new Map();
    
    for (const tx of transactions) {
      const counterparty = tx.parsedInfo?.sender !== tx.parsedInfo?.receiver ? 
        (tx.parsedInfo?.sender || tx.parsedInfo?.receiver) : null;
      
      if (counterparty) {
        if (!addressGroups.has(counterparty)) {
          addressGroups.set(counterparty, []);
        }
        addressGroups.get(counterparty).push(tx);
      }
    }
    
    // Add address clusters with more than 2 transactions
    for (const [address, txs] of addressGroups.entries()) {
      if (txs.length >= 2) {
        const riskScore = Math.min(100, Math.max(0, 30 + (txs.length * 5)));
        
        results.push({
          id: `cluster-${clusterId++}`,
          name: `Multiple transactions with ${address.substring(0, 6)}...`,
          type: 'address-based',
          transactions: txs,
          entities: [...new Set(txs.flatMap(tx => [
            tx.parsedInfo?.sender, 
            tx.parsedInfo?.receiver
          ].filter(Boolean)))],
          detectionReason: `Detected ${txs.length} transactions with the same counterparty.`,
          riskScore
        });
      }
    }
    
    // 2. Time-based clustering (transactions close in time)
    const timeGroups = [];
    const sortedByTime = [...transactions].sort((a, b) => 
      (a.blockTime || 0) - (b.blockTime || 0)
    );
    
    let currentGroup = [];
    let previousTime = null;
    
    for (const tx of sortedByTime) {
      if (!tx.blockTime) continue;
      
      if (previousTime === null) {
        currentGroup = [tx];
        previousTime = tx.blockTime;
      } else {
        // If transactions are within 10 minutes (600 seconds)
        const timeDiff = tx.blockTime - previousTime;
        
        if (timeDiff < 600) {
          currentGroup.push(tx);
        } else {
          if (currentGroup.length >= 3) {
            timeGroups.push([...currentGroup]);
          }
          currentGroup = [tx];
        }
        
        previousTime = tx.blockTime;
      }
    }
    
    // Don't forget to add the last group
    if (currentGroup.length >= 3) {
      timeGroups.push(currentGroup);
    }
    
    // Add time-based clusters
    for (const group of timeGroups) {
      const startTime = new Date(group[0].blockTime * 1000);
      const endTime = new Date(group[group.length - 1].blockTime * 1000);
      
      const riskScore = Math.min(100, Math.max(0, 20 + (group.length * 10)));
      
      results.push({
        id: `cluster-${clusterId++}`,
        name: `Rapid transactions (${group.length})`,
        type: 'time-based',
        transactions: group,
        entities: [...new Set(group.flatMap(tx => [
          tx.parsedInfo?.sender, 
          tx.parsedInfo?.receiver
        ].filter(Boolean)))],
        detectionReason: `${group.length} transactions in a short time period (${startTime.toLocaleTimeString()} - ${endTime.toLocaleTimeString()})`,
        riskScore
      });
    }
    
    // 3. Amount-based clustering (similar transaction amounts)
    const amountGroups = new Map();
    
    for (const tx of transactions) {
      if (!tx.parsedInfo?.amount) continue;
      
      const amount = parseFloat(tx.parsedInfo.amount);
      // Round to nearest 0.1 to group similar amounts
      const roundedAmount = Math.round(amount * 10) / 10;
      
      if (!amountGroups.has(roundedAmount)) {
        amountGroups.set(roundedAmount, []);
      }
      amountGroups.get(roundedAmount).push(tx);
    }
    
    // Add amount-based clusters with more than 2 transactions
    for (const [amount, txs] of amountGroups.entries()) {
      if (txs.length >= 2) {
        const riskScore = Math.min(100, Math.max(0, 15 + (txs.length * 10) + (amount * 2)));
        
        results.push({
          id: `cluster-${clusterId++}`,
          name: `Transactions of ${amount} SOL`,
          type: 'amount-based',
          transactions: txs,
          entities: [...new Set(txs.flatMap(tx => [
            tx.parsedInfo?.sender, 
            tx.parsedInfo?.receiver
          ].filter(Boolean)))],
          detectionReason: `${txs.length} transactions with similar amounts around ${amount} SOL.`,
          riskScore
        });
      }
    }
    
    // Sort by risk score (highest first)
    return results.sort((a, b) => b.riskScore - a.riskScore);
  } catch (error) {
    console.error('Error clustering transactions:', error);
    return [];
  }
}
