import { Contract, JsonRpcProvider } from "ethers";
import { NETWORKS } from "./networks";

export const ethContractAbi = [
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
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "uint256", name: "newPrice", type: "uint256" },
      { indexed: false, internalType: "address", name: "updatedBy", type: "address" },
    ],
    name: "PriceUpdated",
    type: "event",
  },
];

function getNetworkContract(networkId) {
  const network = NETWORKS[networkId];
  const provider = new JsonRpcProvider(network.rpcUrl);
  const contract = new Contract(network.contractAddress, ethContractAbi, provider);
  return { provider, contract };
}

export async function getContractPrice(networkId = 'sepolia') {
  try {
    const { contract } = getNetworkContract(networkId);
    const price = await contract.getPrice();
    return price;
  } catch (error) {
    console.log(`Failed to get price from ${networkId} contract:`, error.message);
    return null;
  }
}

export async function getAllContractPrices() {
  const ids = ['sepolia','iotex','avalanche'];
  const results = await Promise.all(ids.map(async id => {
    try {
      const p = await getContractPrice(id);
      return { id, price: p ? Number(p) : null };
    } catch {
      return { id, price: null };
    }
  }));
  return results.reduce((acc, cur) => { acc[cur.id] = cur.price; return acc; }, {});
}

export async function getLastUpdateInfo(networkId = 'sepolia') {
  try {
    const { provider, contract } = getNetworkContract(networkId);
    const filter = contract.filters.PriceUpdated();
    const latest = await provider.getBlockNumber();
    // Keep ranges conservative to avoid RPC 400s on public providers
    const window = networkId === 'sepolia' ? 5000 : 20000;
    let to = latest;
    for (let attempts = 0; attempts < 12 && to >= 0; attempts++) {
      const from = Math.max(0, to - window + 1);
      try {
        const logs = await contract.queryFilter(filter, from, to);
        if (logs && logs.length) {
          const last = logs[logs.length - 1];
          const block = await provider.getBlock(last.blockNumber);
          const price = last.args?.newPrice ?? last.args?.[0] ?? null;
          return {
            txHash: last.transactionHash,
            blockNumber: Number(last.blockNumber),
            timestamp: block?.timestamp ? new Date(block.timestamp * 1000).toISOString() : null,
            price: price !== null ? Number(price) : null,
          };
        }
      } catch {}
      to = from - 1;
    }
    return null;
  } catch (e) {
    console.log(`Failed to get last update info for ${networkId}:`, e?.message || e);
    return null;
  }
}

export async function getTimestampFromTxHash(networkId, txHash) {
  try {
    const { provider } = getNetworkContract(networkId);
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt || !receipt.blockNumber) return null;
    const block = await provider.getBlock(receipt.blockNumber);
    return block?.timestamp ? new Date(block.timestamp * 1000).toISOString() : null;
  } catch (e) {
    return null;
  }
}

export function formatBalance(balance, decimals, decimalPlaces = 6) {
  let strValue = balance.toString();
  if (strValue.length <= decimals) {
    strValue = strValue.padStart(decimals + 1, "0");
  }
  const decimalPos = strValue.length - decimals;
  const result = strValue.slice(0, decimalPos) + "." + strValue.slice(decimalPos);
  return parseFloat(result).toFixed(decimalPlaces);
}

export async function broadcastRawTransaction(networkId, serializedTransaction) {
  try {
    const network = NETWORKS[networkId];
    const provider = new JsonRpcProvider(network.rpcUrl);
    const response = await provider.broadcastTransaction(serializedTransaction);
    return response?.hash || null;
  } catch (e) {
    console.error(`Broadcast failed on ${networkId}:`, e?.message || e);
    return null;
  }
}
