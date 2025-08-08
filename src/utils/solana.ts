import { contracts, chainAdapters } from "chainsig.js";

// Solana network configuration
export const solanaRpcUrl = "https://api.devnet.solana.com"; // Devnet
export const solanaMainnetRpcUrl = "https://api.mainnet-beta.solana.com"; // Mainnet

// Set up a chain signature contract instance (same NEAR contract used elsewhere)
const MPC_CONTRACT = new contracts.ChainSignatureContract({
  networkId: `testnet`,
  contractId: `v1.signer-prod.testnet`,
});

// Create Solana adapters
export const Solana = new (chainAdapters as any).solana.Solana({
  rpcUrl: solanaRpcUrl,
  contract: MPC_CONTRACT,
}) as any;

export const SolanaMainnet = new (chainAdapters as any).solana.Solana({
  rpcUrl: solanaMainnetRpcUrl,
  contract: MPC_CONTRACT,
}) as any;

export type SolanaNetwork = "devnet" | "mainnet";

export function getSolanaAdapter(network: SolanaNetwork = "devnet") {
  return network === "mainnet" ? SolanaMainnet : Solana;
}

export function getSolanaPath(network: SolanaNetwork = "devnet") {
  return network === "mainnet" ? "solana-mainnet" : "solana-1";
}


