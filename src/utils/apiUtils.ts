
/**
 * Utility functions for API requests with rate limiting and retry logic
 */

type RetryableRequest = () => Promise<any>;

interface QueuedRequest {
  requestFn: RetryableRequest;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  retries: number;
  lastError?: Error;
}

// Configuration options
const DEFAULT_RETRY_OPTIONS = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffFactor: 2,
};

class RequestQueue {
  private queue: QueuedRequest[] = [];
  private processing = false;
  private requestRateMs: number;
  private lastRequestTime: number = 0;
  private batchSizeLimit: number;
  private batchIntervalMs: number;
  private currentBatchCount: number = 0;
  private batchResetTimeout: NodeJS.Timeout | null = null;

  constructor(
    requestsPerSecond: number = 4, 
    batchSizeLimit: number = 5, 
    batchIntervalMs: number = 2000
  ) {
    // Convert requests per second to delay between requests in ms
    this.requestRateMs = 1000 / requestsPerSecond;
    this.batchSizeLimit = batchSizeLimit;
    this.batchIntervalMs = batchIntervalMs;
  }

  /**
   * Add a request to the queue with retry capabilities
   */
  enqueue<T>(
    requestFn: RetryableRequest, 
    options = DEFAULT_RETRY_OPTIONS, 
    priority: boolean = false
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const request = {
        requestFn,
        resolve: resolve as (value: any) => void,
        reject,
        retries: options.maxRetries,
      };

      if (priority) {
        // Add high-priority requests to the front of the queue
        this.queue.unshift(request);
      } else {
        // Add normal requests to the end of the queue
        this.queue.push(request);
      }

      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  /**
   * Process requests in the queue with rate limiting and batch constraints
   */
  private async processQueue() {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const now = Date.now();
    const timeToWait = Math.max(0, this.requestRateMs - (now - this.lastRequestTime));

    // Check if we've reached the batch limit
    if (this.currentBatchCount >= this.batchSizeLimit) {
      // Wait for the batch interval before processing more requests
      console.log(`Batch limit reached (${this.currentBatchCount}/${this.batchSizeLimit}), pausing for ${this.batchIntervalMs}ms`);
      await new Promise(resolve => setTimeout(resolve, this.batchIntervalMs));
      this.currentBatchCount = 0;
    }

    // Wait to respect rate limiting
    if (timeToWait > 0) {
      await new Promise(resolve => setTimeout(resolve, timeToWait));
    }

    const request = this.queue.shift()!;
    this.lastRequestTime = Date.now();
    this.currentBatchCount++;

    // Reset batch count after the batch interval
    if (this.batchResetTimeout) {
      clearTimeout(this.batchResetTimeout);
    }
    this.batchResetTimeout = setTimeout(() => {
      this.currentBatchCount = 0;
    }, this.batchIntervalMs);

    try {
      const result = await request.requestFn();
      request.resolve(result);
    } catch (error) {
      if (request.retries > 0) {
        // Calculate backoff delay using exponential backoff
        const backoffDelay = Math.min(
          DEFAULT_RETRY_OPTIONS.maxDelayMs,
          DEFAULT_RETRY_OPTIONS.initialDelayMs * 
            Math.pow(DEFAULT_RETRY_OPTIONS.backoffFactor, 
              DEFAULT_RETRY_OPTIONS.maxRetries - request.retries)
        );
        
        console.log(`Request failed, retrying in ${backoffDelay}ms (${request.retries} retries left)`, error);
        
        // Re-queue the request with one fewer retry
        setTimeout(() => {
          this.queue.push({
            ...request,
            retries: request.retries - 1,
            lastError: error instanceof Error ? error : new Error(String(error)),
          });
          
          if (this.queue.length === 1 && !this.processing) {
            this.processQueue();
          }
        }, backoffDelay);
      } else {
        // No retries left, reject the promise
        const finalError = error instanceof Error ? error : new Error(String(error));
        if (request.lastError) {
          console.error('Request failed after all retries', {
            originalError: request.lastError,
            finalError
          });
        }
        request.reject(finalError);
      }
    }

    // Process next request
    setTimeout(() => this.processQueue(), 0);
  }
}

// Create a singleton request queue for Helius API
// Configure for 5 requests per 2 seconds
export const heliusRequestQueue = new RequestQueue(2.5, 5, 2000);

/**
 * Wrap a request function with retry and rate limiting logic
 */
export function withRetry<T>(
  requestFn: RetryableRequest, 
  options = DEFAULT_RETRY_OPTIONS,
  priority: boolean = false
): Promise<T> {
  return heliusRequestQueue.enqueue<T>(requestFn, options, priority);
}
