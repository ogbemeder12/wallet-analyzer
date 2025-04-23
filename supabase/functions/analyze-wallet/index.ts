
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const heliusApiKey = Deno.env.get('HELIUS_API_KEY') || '9f96c937-a104-409b-8e1e-2b2d3079335d';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple implementation of retry with exponential backoff for the edge function
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3, initialDelay = 1000) {
  let retries = 0;
  let delay = initialDelay;
  
  while (true) {
    try {
      const response = await fetch(url, options);
      if (response.ok) {
        return response;
      }
      
      // If response is a rate limit error (429), definitely retry
      if (response.status === 429) {
        console.log(`Rate limit hit, retrying after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        retries++;
        delay *= 2; // Exponential backoff
        continue;
      }
      
      // For other errors, you may want to check if they're worth retrying
      if (retries >= maxRetries) {
        return response; // Return the error response after max retries
      }
      
      console.log(`Request failed with status ${response.status}, retrying after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
      retries++;
      delay *= 2; // Exponential backoff
    } catch (error) {
      if (retries >= maxRetries) {
        throw error; // Throw the error after max retries
      }
      
      console.log(`Network error, retrying after ${delay}ms`, error);
      await new Promise(resolve => setTimeout(resolve, delay));
      retries++;
      delay *= 2; // Exponential backoff
    }
  }
}

// Batch processing helper function for edge function
async function processBatch<T>(items: T[], batchSize: number, intervalMs: number, processFn: (item: T) => Promise<any>) {
  const results = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchPromises = batch.map(processFn);
    
    try {
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    } catch (error) {
      console.error('Error processing batch:', error);
    }
    
    // Add delay between batches for rate limiting
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }
  
  return results;
}

/**
 * Generate a fallback analysis when OpenAI API is unavailable
 */
function generateFallbackAnalysis(walletAddress: string, transactionCount: number, enhancedFundingData: any) {
  const totalInflow = enhancedFundingData?.totalInflow || 0;
  const totalOutflow = enhancedFundingData?.totalOutflow || 0;
  const netBalance = enhancedFundingData?.netBalance || 0;
  const topSourceCount = enhancedFundingData?.topSources?.length || 0;
  
  // Create a more detailed fallback analysis
  return `
## Wallet Analysis Summary

**Wallet Address**: ${walletAddress}

### Transaction Summary
- Total Transactions: ${transactionCount}
- Top Funding Sources: ${topSourceCount} identified

### Financial Overview
- Total Inflow: ${totalInflow.toFixed(4)} SOL
- Total Outflow: ${totalOutflow.toFixed(4)} SOL
- Net Balance: ${netBalance.toFixed(4)} SOL

### Basic Assessment
This wallet shows ${transactionCount > 10 ? 'moderate' : 'limited'} activity on the Solana blockchain. 
${netBalance > 0 ? 'The wallet has a positive balance, indicating more funds received than sent.' : 
  netBalance < 0 ? 'The wallet has a negative balance, indicating more funds sent than received.' : 
  'The wallet has a neutral balance, with equal amounts sent and received.'}

${transactionCount > 20 ? 'With a significant number of transactions, this appears to be an actively used wallet.' : 
  transactionCount > 5 ? 'This wallet shows occasional activity, suggesting regular but not intensive use.' : 
  'This wallet shows minimal activity, suggesting it may be new or infrequently used.'}

### Recommendations
- Monitor for unusual transaction patterns
- Explore the funding sources tab for additional details
- Check the transaction timeline for activity patterns
  `;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { walletAddress, transactions, fundingData, entityData } = await req.json();

    // First: Get wallet balance immediately and return it
    let walletBalance = null;
    try {
      const balanceResponse = await fetchWithRetry(`https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'helius-balance',
          method: 'getBalance',
          params: [walletAddress],
        }),
      }, 3, 1000);
      
      if (balanceResponse.ok) {
        const balanceData = await balanceResponse.json();
        if (balanceData.result) {
          walletBalance = balanceData.result.value / 1e9; // Convert lamports to SOL
          console.log(`Retrieved wallet balance: ${walletBalance} SOL`);
        }
      }
    } catch (balanceError) {
      console.error('Error fetching wallet balance:', balanceError);
    }

    // Enhanced transaction processing with Helius API data
    let enhancedTransactionSummary = [];
    
    try {
      // Try to fetch enhanced data from Helius API with retries
      const heliusResponse = await fetchWithRetry(`https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'helius-enriched-transactions',
          method: 'getSignaturesForAddress',
          params: [
            walletAddress,
            { limit: 50 }
          ],
        }),
      }, 3, 2000); // 3 retries, starting with 2 second delay
      
      if (!heliusResponse.ok) {
        throw new Error(`Helius API error: ${heliusResponse.status}`);
      }
      
      const heliusData = await heliusResponse.json();
      
      if (heliusData.error) {
        throw new Error(`Helius API error: ${heliusData.error.message}`);
      }
      
      if (heliusData.result && heliusData.result.length > 0) {
        console.log(`Retrieved ${heliusData.result.length} enhanced transactions from Helius API`);
        
        // Process the enhanced transaction data
        enhancedTransactionSummary = heliusData.result.map(tx => ({
          signature: tx.signature,
          timestamp: tx.blockTime,
          slot: tx.slot,
        }));
        
        // For detailed transaction data, process in smaller batches to avoid rate limits
        // Using our batch processing helper function - 5 requests per 2 seconds
        const processedTransactions = await processBatch(
          enhancedTransactionSummary, 
          5, // Batch size of 5
          2000, // 2 second interval between batches
          async (tx) => {
            try {
              const txResponse = await fetchWithRetry(`https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: 'helius-tx-details',
                  method: 'getTransaction',
                  params: [
                    tx.signature,
                    { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }
                  ],
                }),
              }, 2, 1000);
              
              if (txResponse.ok) {
                const txData = await txResponse.json();
                if (txData.result) {
                  // Extract key information
                  return {
                    ...tx,
                    // Add additional transaction details here
                  };
                }
              }
              return tx;
            } catch (error) {
              console.error(`Error fetching details for tx ${tx.signature}:`, error);
              return tx;
            }
          }
        );
        
        enhancedTransactionSummary = processedTransactions;
      }
    } catch (heliusError) {
      console.error('Error fetching from Helius API:', heliusError);
      // Fallback to standard transaction processing
    }
    
    // If Helius API failed or returned no data, use provided transactions
    if (enhancedTransactionSummary.length === 0) {
      enhancedTransactionSummary = transactions && Array.isArray(transactions) 
        ? transactions.map(tx => {
            // Extract more detailed financial information
            const amount = tx.parsedInfo?.amount || 0;
            const fee = tx.parsedInfo?.fee ? tx.parsedInfo.fee / 1e9 : 0; // Convert lamports to SOL
            
            return {
              signature: tx.signature,
              amount,
              sender: tx.parsedInfo?.sender,
              receiver: tx.parsedInfo?.receiver,
              timestamp: tx.blockTime,
              type: tx.parsedInfo?.type,
              fee,
              // Include inflow/outflow categorization directly in transaction data
              direction: tx.parsedInfo?.receiver === walletAddress ? 'inflow' : 
                        tx.parsedInfo?.sender === walletAddress ? 'outflow' : 'internal'
            };
          })
        : [];
    }

    // Calculate accurate funding data if not provided
    let enhancedFundingData = fundingData;
    
    if (!fundingData || !fundingData.totalInflow) {
      // Calculate funding metrics directly from transaction data
      const totalInflow = enhancedTransactionSummary
        .filter(tx => tx.direction === 'inflow')
        .reduce((sum, tx) => sum + (tx.amount || 0), 0);
        
      const totalOutflow = enhancedTransactionSummary
        .filter(tx => tx.direction === 'outflow')
        .reduce((sum, tx) => sum + (tx.amount || 0), 0);
        
      const netBalance = totalInflow - totalOutflow;
      
      // Identify top funding sources
      const sourceMap = new Map();
      
      enhancedTransactionSummary
        .filter(tx => tx.direction === 'inflow' && tx.sender)
        .forEach(tx => {
          const sender = tx.sender;
          if (!sourceMap.has(sender)) {
            sourceMap.set(sender, {
              address: sender,
              amount: 0,
              transactions: 0,
              firstSeen: tx.timestamp
            });
          }
          const source = sourceMap.get(sender);
          source.amount += tx.amount || 0;
          source.transactions += 1;
          source.firstSeen = Math.min(source.firstSeen, tx.timestamp || Infinity);
        });
      
      const topSources = Array.from(sourceMap.values())
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5)
        .map(source => ({
          ...source,
          percentage: totalInflow > 0 ? (source.amount / totalInflow) * 100 : 0
        }));
        
      enhancedFundingData = {
        totalInflow,
        totalOutflow,
        netBalance,
        topSources,
        transactionCount: enhancedTransactionSummary.length
      };
    }

    // Prepare entity data if available
    const entitySummary = entityData || { 
      knownEntities: [],
      interactionCount: 0
    };

    console.log(`Analyzed wallet ${walletAddress} with ${enhancedTransactionSummary.length} transactions`);
    
    // Generate a fallback analysis in advance in case OpenAI API fails
    const fallbackAnalysis = generateFallbackAnalysis(
      walletAddress, 
      enhancedTransactionSummary.length, 
      enhancedFundingData
    );
    
    // Return balance immediately with minimal data first
    if (walletBalance !== null) {
      return new Response(JSON.stringify({ 
        walletBalance,
        transactionsLoading: true,
        message: "Balance retrieved. Loading transaction data..."
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Continue with the full analysis
    try {
      // Check if we have a valid OpenAI API key before making the request
      if (!openAIApiKey) {
        console.log("OpenAI API key is not configured, using fallback analysis");
        return new Response(JSON.stringify({ 
          aiAnalysis: fallbackAnalysis,
          isFailover: true,
          error: "OpenAI API key is not configured",
          fundingData: enhancedFundingData,
          walletBalance,
          transactionsLoading: false
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Call OpenAI API with retry logic
      const response = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini', // Use the most updated model
          messages: [
            { 
              role: 'system', 
              content: `You are a forensic blockchain analyst specializing in Solana transactions. 
              Provide detailed, professional insights about wallet activity and transaction patterns.
              Focus on identifying notable patterns, potential risks, financial behavior, and possible identity insights.
              Your analysis should be comprehensive yet concise, offering actionable intelligence.
              If there's insufficient data, acknowledge this fact but still provide the best possible analysis.
              IMPORTANT: Always provide a complete analysis with at least 3-4 paragraphs.` 
            },
            { 
              role: 'user', 
              content: `Analyze the on-chain activity for Solana wallet: ${walletAddress}
              
              Transaction Data (${enhancedTransactionSummary.length} transactions):
              ${JSON.stringify(enhancedTransactionSummary.slice(0, 20), null, 2)}
              
              Funding Summary:
              - Total Inflow: ${enhancedFundingData.totalInflow} SOL
              - Total Outflow: ${enhancedFundingData.totalOutflow} SOL
              - Net Balance: ${enhancedFundingData.netBalance} SOL
              - Top Funding Sources: ${JSON.stringify(enhancedFundingData.topSources, null, 2)}
              
              Entity Interactions:
              ${JSON.stringify(entitySummary, null, 2)}
              
              Please provide:
              1. Transaction Pattern Analysis: Key insights on transaction frequency, sizes, and patterns
              2. Entity Assessment: Analysis of the entities this wallet interacts with
              3. Risk Evaluation: Potential financial or security risks based on activity patterns 
              4. Behavioral Profile: Insights into the likely usage patterns of this wallet (trading, everyday use, etc.)
              5. Recommendations for the wallet owner or investigators` 
            }
          ],
          max_tokens: 1000,
          temperature: 0.4 // Lower temperature for more consistent output
        }),
      }, 3, 1000);

      if (!response.ok) {
        const errorData = await response.json();
        console.error("OpenAI API error:", errorData);
        
        // Check if it's a quota error
        if (errorData.error && errorData.error.code === "insufficient_quota") {
          return new Response(JSON.stringify({ 
            aiAnalysis: fallbackAnalysis, // Important: Always include the fallback analysis
            error: "OpenAI API quota exceeded. Please try again later or update your API key.",
            errorDetails: "The OpenAI API key has exceeded its usage limits. This is a billing issue that requires updating the API key or waiting for the quota to reset.",
            isFailover: true,
            fundingData: enhancedFundingData,
            walletBalance,
            fallbackAnalysis
          }), {
            status: 200, // Return 200 even for quota errors since we have fallback content
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        throw new Error(`OpenAI API error: ${errorData.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      console.log("OpenAI API response received");

      // Check if we have a valid response with choices
      if (!data.choices || !data.choices.length) {
        console.error("Invalid response from OpenAI:", data);
        return new Response(JSON.stringify({ 
          aiAnalysis: fallbackAnalysis, // Important: Return the fallback analysis
          isFailover: true,
          error: "Invalid response from OpenAI API",
          fundingData: enhancedFundingData,
          walletBalance,
          transactionsLoading: false
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const aiAnalysis = data.choices[0].message.content;

      // Verify that we have actual content (not empty or too short)
      if (!aiAnalysis || aiAnalysis.length < 100) {
        console.error("OpenAI returned insufficient content:", aiAnalysis);
        return new Response(JSON.stringify({ 
          aiAnalysis: fallbackAnalysis, // Important: Return the fallback analysis
          isFailover: true,
          error: "OpenAI returned insufficient analysis content",
          fundingData: enhancedFundingData,
          walletBalance,
          transactionsLoading: false
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ 
        aiAnalysis,
        fundingData: enhancedFundingData,
        walletBalance,
        transactionsLoading: false
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (openAiError) {
      console.error("Error calling OpenAI API:", openAiError);
      
      // Always return the fallback analysis when OpenAI is unavailable
      return new Response(JSON.stringify({ 
        aiAnalysis: fallbackAnalysis, // Important: Always include the fallback analysis
        isFailover: true,
        error: `AI analysis service temporarily unavailable: ${openAiError.message}`,
        fundingData: enhancedFundingData,
        walletBalance,
        transactionsLoading: false
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('Error in wallet analysis function:', error);
    
    // Generate a very basic fallback analysis even when the main function fails
    const basicFallback = `
    ## Wallet Analysis (Error Recovery)
    
    We encountered an error while analyzing this wallet. This is a basic fallback report.
    
    **Wallet Address**: ${error.walletAddress || "Unknown"}
    
    ### Limited Assessment
    Unable to retrieve complete transaction data. Please try again later or check the wallet address.
    
    ### Recommendations
    - Verify the wallet address is correct
    - Check your internet connection
    - Try again in a few minutes
    `;
    
    return new Response(JSON.stringify({ 
      aiAnalysis: basicFallback,
      error: error.message,
      isFailover: true,
      details: "There was an issue processing your request. Please try again with different parameters or contact support."
    }), {
      status: 200, // Return 200 even for errors since we have fallback content
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
