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
];

// Function to get provider and contract for a specific network
function getNetworkContract(networkId) {
  const network = NETWORKS[networkId];
  const provider = new JsonRpcProvider(network.rpcUrl);
  const contract = new Contract(network.contractAddress, ethContractAbi, provider);
  return { provider, contract };
}

// Function to get the price from the contract (network-agnostic)
export async function getContractPrice(networkId = 'sepolia') {
  try {
    const { contract } = getNetworkContract(networkId);
    const price = await contract.getPrice();
    return price;
  } catch (error) {
    console.log(`Failed to get price from ${networkId} contract:`, error.message);
    // Return null or 0 to indicate no price is set yet
    return null;
  }
}

// Function to format account balances
export function formatBalance(balance, decimals, decimalPlaces = 6) {
  let strValue = balance.toString();

  if (strValue.length <= decimals) {
    strValue = strValue.padStart(decimals + 1, "0");
  }

  const decimalPos = strValue.length - decimals;

  const result =
    strValue.slice(0, decimalPos) + "." + strValue.slice(decimalPos);

  return parseFloat(result).toFixed(decimalPlaces);
}
