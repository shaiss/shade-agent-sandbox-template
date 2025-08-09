import { contracts, chainAdapters } from "chainsig.js";
import { createPublicClient, http } from "viem";

export const avalancheFujiRpcUrl = "https://api.avax-test.network/ext/bc/C/rpc";
export const avalancheFujiRpcUrls = [
  "https://avalanche-fuji-c-chain.publicnode.com",
  "https://api.avax-test.network/ext/bc/C/rpc",
  "https://endpoints.omniatech.io/v1/avalanche/fuji/public"
];
export const avalancheMainnetRpcUrl = "https://api.avax.network/ext/bc/C/rpc";

// TODO: Update after deploying PriceOracle on Fuji/Mainnet
export const avalancheFujiContractAddress = "0xE06Afdf580021DD475cd280D4ae4BB519314a995";
export const avalancheMainnetContractAddress = "0x0000000000000000000000000000000000000000";

export const avalancheContractAbi = [
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

const MPC_CONTRACT = new contracts.ChainSignatureContract({
  networkId: "testnet",
  contractId: "v1.signer-prod.testnet",
});

const fujiClient = createPublicClient({ transport: http(avalancheFujiRpcUrl) });
const mainnetClient = createPublicClient({ transport: http(avalancheMainnetRpcUrl) });

export const AvalancheFuji = new chainAdapters.evm.EVM({ publicClient: fujiClient, contract: MPC_CONTRACT }) as any;
export const AvalancheMainnet = new chainAdapters.evm.EVM({ publicClient: mainnetClient, contract: MPC_CONTRACT }) as any;

export const avalancheChainConfig = {
  testnet: {
    rpcUrl: avalancheFujiRpcUrl,
    contractAddress: avalancheFujiContractAddress,
    path: "ethereum-1", // using ethereum-1 as reliable fallback for MPC path
    chainId: 43113,
    adapter: AvalancheFuji,
  },
  mainnet: {
    rpcUrl: avalancheMainnetRpcUrl,
    contractAddress: avalancheMainnetContractAddress,
    path: "avalanche-mainnet", // fallback to "ethereum-mainnet" if not configured in MPC
    chainId: 43114,
    adapter: AvalancheMainnet,
  },
} as const;

export function getAvalanchePath(network: 'testnet' | 'mainnet' = 'testnet') {
  return avalancheChainConfig[network].path;
}

export function getAvalancheAdapter(network: 'testnet' | 'mainnet' = 'testnet') {
  return avalancheChainConfig[network].adapter;
}