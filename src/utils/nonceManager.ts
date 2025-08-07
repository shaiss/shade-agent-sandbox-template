import { requestSignature as originalRequestSignature } from "@neardefi/shade-agent-js";

// Global nonce tracking
let lastNonce: bigint | null = null;
let nonceIncrementEnabled = true;
let nonceIncrement = 0n;

// Lock mechanism to ensure sequential nonce handling
let nonceLock = Promise.resolve();

export function setNonceIncrementEnabled(enabled: boolean) {
  nonceIncrementEnabled = enabled;
  if (!enabled) {
    // Reset when disabled
    nonceIncrement = 0n;
  }
}

export function isNonceIncrementEnabled(): boolean {
  return nonceIncrementEnabled;
}

interface SignatureParams {
  path: string;
  payload: string;
  useNonce?: string;
}

export async function requestSignature(params: SignatureParams): Promise<any> {
  if (!nonceIncrementEnabled) {
    // Pass through to original function without modification
    return originalRequestSignature(params);
  }

  // Use a lock to ensure sequential processing
  return nonceLock = nonceLock.then(async () => {
    try {
      // First attempt without nonce modification
      if (nonceIncrement === 0n) {
        const result = await originalRequestSignature(params);
        
        // If successful, return it
        if (!('error' in result)) {
          return result;
        }
        
        // If it's a nonce error, extract the current nonce and retry
        if (result.error && result.error.includes('must be larger than nonce')) {
          const match = result.error.match(/nonce of the used access key (\d+)/);
          if (match) {
            lastNonce = BigInt(match[1]);
            nonceIncrement = 1n;
            console.log(`📊 Detected current nonce: ${lastNonce}, will increment for next request`);
          }
        }
      }
      
      // Calculate the new nonce
      if (lastNonce !== null) {
        const newNonce = (lastNonce + nonceIncrement).toString();
        console.log(`🔢 Using incremented nonce: ${newNonce} (increment: ${nonceIncrement})`);
        
        const result = await originalRequestSignature({
          ...params,
          useNonce: newNonce
        } as any);
        
        if (!('error' in result)) {
          // Success! Increment for next request
          nonceIncrement += 1n;
          return result;
        }
        
        // If still getting nonce errors, update our base
        if (result.error && result.error.includes('must be larger than nonce')) {
          const match = result.error.match(/nonce of the used access key (\d+)/);
          if (match) {
            lastNonce = BigInt(match[1]);
            nonceIncrement = 1n;
            // Retry one more time
            const retryNonce = (lastNonce + nonceIncrement).toString();
            console.log(`🔄 Retrying with updated nonce: ${retryNonce}`);
            const retryResult = await originalRequestSignature({
              ...params,
              useNonce: retryNonce
            } as any);
            if (!('error' in retryResult)) {
              nonceIncrement += 1n;
            }
            return retryResult;
          }
        }
        
        return result;
      }
      
      // Fallback to original behavior
      return originalRequestSignature(params);
      
    } catch (error) {
      console.error("Error in nonce-managed signature request:", error);
      throw error;
    }
  });
}

// Reset nonce tracking (useful between demos)
export function resetNonceTracking() {
  lastNonce = null;
  nonceIncrement = 0n;
  console.log("🔄 Nonce tracking reset");
}
