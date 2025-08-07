import { contracts, chainAdapters } from "chainsig.js";
import { createPublicClient, http } from "viem";

// IoTeX network configuration
export const iotexRpcUrl = "https://babel-api.testnet.iotex.io"; // Testnet
export const iotexMainnetRpcUrl = "https://babel-api.mainnet.iotex.io"; // Mainnet

// IoTeX contract addresses (deployed)
export const iotexContractAddress = "0xd0E0ea5F7542B12164Dc213d63bC149eC6cD68d5"; // Deployed with NEAR-derived owner
export const iotexMainnetContractAddress = "0x..."; // Deploy contract here for mainnet

export const iotexContractAbi = [
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_price",
        type: "uint256",
      },
    ],
    name: "updatePrice",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "getPrice",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Set up a chain signature contract instance (same as Ethereum)
const MPC_CONTRACT = new contracts.ChainSignatureContract({
  networkId: `testnet`,
  contractId: `v1.signer-prod.testnet`,
});

// Set up a public client for the IoTeX network
const iotexPublicClient = createPublicClient({
  transport: http(iotexRpcUrl),
});

// Create a wrapper class that overrides gas estimation
class IoTeXAdapter {
  private evmAdapter: any;
  private publicClient: any;

  constructor(publicClient: any, contract: any) {
    this.publicClient = publicClient;
    this.evmAdapter = new chainAdapters.evm.EVM({
      publicClient,
      contract,
    });
  }

  // Delegate address derivation and balance methods
  async deriveAddressAndPublicKey(contractId: string, path: string) {
    return this.evmAdapter.deriveAddressAndPublicKey(contractId, path);
  }

  async getBalance(address: string) {
    return this.evmAdapter.getBalance(address);
  }

  // Custom prepareTransactionForSigning with fixed gas
  async prepareTransactionForSigning(params: any) {
    console.log("🔧 Preparing IoTeX tx manually with fixed gas");
    
    // Get nonce and gas price
    const nonce = await this.publicClient.getTransactionCount({
      address: params.from,
    });
    const gasPrice = await this.publicClient.getGasPrice();
    
    // Build transaction object
    const transaction = {
      to: params.to,
      value: params.value || 0n,
      data: params.data,
      gas: params.gas || 150000n,
      gasPrice: gasPrice,
      nonce: Number(nonce),
      chainId: 4690, // IoTeX testnet
    };
    
    // Create hash for signing
    const { ethers } = await import("ethers");
    const unsignedTx = {
      to: transaction.to,
      value: transaction.value,
      data: transaction.data,
      gasLimit: transaction.gas,
      gasPrice: transaction.gasPrice,
      nonce: transaction.nonce,
      chainId: transaction.chainId,
      type: 0,
    };
    
    const ethersTx = ethers.Transaction.from(unsignedTx);
    const hashToSign = ethers.getBytes(ethersTx.unsignedHash);
    
    return {
      transaction,
      hashesToSign: [hashToSign],
    };
  }

  // Delegate other methods
  finalizeTransactionSigning(params: any) {
    return this.evmAdapter.finalizeTransactionSigning(params);
  }

  async broadcastTx(signedTransaction: any) {
    return this.evmAdapter.broadcastTx(signedTransaction);
  }
}

// Set up a chain signatures chain adapter for the IoTeX network
export const IoTeX = new IoTeXAdapter(iotexPublicClient, MPC_CONTRACT) as any;

// IoTeX mainnet adapter
const iotexMainnetPublicClient = createPublicClient({
  transport: http(iotexMainnetRpcUrl),
});

export const IoTeXMainnet = new IoTeXAdapter(iotexMainnetPublicClient, MPC_CONTRACT) as any;

// Chain configuration for easy switching
export const iotexChainConfig = {
  testnet: {
    rpcUrl: iotexRpcUrl,
    contractAddress: iotexContractAddress,
    path: "ethereum-1", // Use ethereum-1 since IoTeX is EVM-compatible and iotex-1 path may not be configured
    chainId: 4690,
    adapter: IoTeX,
  },
  mainnet: {
    rpcUrl: iotexMainnetRpcUrl,
    contractAddress: iotexMainnetContractAddress,
    path: "ethereum-1", // Use ethereum-1 since IoTeX is EVM-compatible
    chainId: 4689,
    adapter: IoTeXMainnet,
  },
};

// Helper function to get IoTeX adapter based on network
export function getIoTeXAdapter(network: 'testnet' | 'mainnet' = 'testnet') {
  return iotexChainConfig[network].adapter;
}

// Helper function to get IoTeX path based on network
export function getIoTeXPath(network: 'testnet' | 'mainnet' = 'testnet') {
  return iotexChainConfig[network].path;
} 