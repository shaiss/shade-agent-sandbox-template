import { createPublicClient, http } from "viem";
import { ethRpcUrl } from "./ethereum";

// Track the last used Ethereum nonce per address
const ethereumNonces: Map<string, bigint> = new Map();

// Create a public client for nonce queries
const publicClient = createPublicClient({
  transport: http(ethRpcUrl),
});

export async function getNextEthereumNonce(address: string): Promise<number> {
  try {
    // Get both pending and latest nonce
    const [pendingNonce, latestNonce] = await Promise.all([
      publicClient.getTransactionCount({
        address: address as `0x${string}`,
        blockTag: 'pending'
      }),
      publicClient.getTransactionCount({
        address: address as `0x${string}`,
        blockTag: 'latest'
      })
    ]);

    // Convert to BigInt to ensure consistent types
    const pendingNonceBigInt = BigInt(pendingNonce);
    const latestNonceBigInt = BigInt(latestNonce);
    
    // Use the higher of the two (both are bigint)
    const onchainNonce = pendingNonceBigInt > latestNonceBigInt ? pendingNonceBigInt : latestNonceBigInt;
    
    // Get our tracked nonce (ensure it's bigint)
    const trackedNonce = ethereumNonces.get(address.toLowerCase()) || 0n;
    
    // Use the higher of onchain vs tracked (both are bigint)
    const nextNonce = onchainNonce > trackedNonce ? onchainNonce : trackedNonce;
    
    // Update our tracking
    ethereumNonces.set(address.toLowerCase(), nextNonce + 1n);
    
    console.log(`📊 Ethereum nonce for ${address}: pending=${pendingNonce}, latest=${latestNonce}, using=${nextNonce}`);
    
    return Number(nextNonce);
  } catch (error) {
    console.error("Error getting Ethereum nonce:", error);
    // Fallback to just getting the current count
    const nonce = await publicClient.getTransactionCount({
      address: address as `0x${string}`,
    });
    return Number(nonce);
  }
}

export function resetEthereumNonces() {
  ethereumNonces.clear();
  console.log("🔄 Ethereum nonce tracking reset");
}
