# Integrating Avalanche (C-Chain) into the Shade Agent Demo

This guide shows how to add Avalanche (C-Chain) to the demo using the patterns from the Adding New Chains guide. It covers Fuji testnet first, with clear pointers for Mainnet.

## Quick facts

- Network type: EVM-compatible (C-Chain)
- Native asset: AVAX
- RPC
  - Fuji: `https://api.avax-test.network/ext/bc/C/rpc`
  - Mainnet: `https://api.avax.network/ext/bc/C/rpc`
- Chain IDs
  - Fuji: `43113`
  - Mainnet: `43114`
- Explorer
  - Fuji: `https://testnet.snowtrace.io`
  - Mainnet: `https://snowtrace.io`
- Path suggestion (MPC): `avalanche-1` (Fuji), `avalanche-mainnet` (Mainnet)
  - If your MPC config does not have Avalanche-specific paths, you can temporarily use `ethereum-1` as a fallback because C-Chain is EVM-compatible.

References:
- Avalanche Support (Mainnet): `https://api.avax.network/ext/bc/C/rpc`, ChainID 43114, Explorer `https://snowtrace.io`
- Avalanche Docs (Fuji): `https://api.avax-test.network/ext/bc/C/rpc`, ChainID 43113, Explorer `https://testnet.snowtrace.io`

## Backend integration

We’ll mirror the existing Ethereum route structure, with IoTeX-specific nuances as a reference for when gas or nonce handling needs chain-specific adjustments.

See patterns here (for reference only):
```1:106:/workspace/src/routes/transaction.ts
import { Hono } from "hono";
import { requestSignature } from "../utils/nonceManager";
import {
  ethContractAbi,
  ethContractAddress,
  ethRpcUrl,
  Evm,
} from "../utils/ethereum";
import { getEthereumPriceUSD } from "../utils/fetch-eth-price";
import { getNextEthereumNonce } from "../utils/ethereumNonceManager";
import { Contract, JsonRpcProvider } from "ethers";
import { utils } from "chainsig.js";
const { toRSV, uint8ArrayToHex } = utils.cryptography;
import { logInfo, logError } from "../utils/logStream";

const app = new Hono();

app.get("/", async (c) => {
  try {
    // Fetch the environment variable inside the route
    const contractId = process.env.NEXT_PUBLIC_contractId;
    if (!contractId) {
      return c.json({ error: "Contract ID not configured" }, 500);
    }

    // Get the ETH price
    const ethPrice = await getEthereumPriceUSD();
    if (!ethPrice) {
      return c.json({ error: "Failed to fetch ETH price" }, 500);
    }

    logInfo(`🧮 ETH price (cents): ${ethPrice}`);
    // Get the transaction and payload to sign
    const { transaction, hashesToSign } = await getPricePayload(
      ethPrice,
      contractId,
    );
    logInfo("🔧 Prepared Ethereum tx for signing (1 hash)");

    // Call the agent contract to get a signature for the payload
    const signRes = await requestSignature({
      path: "ethereum-1",
      payload: uint8ArrayToHex(hashesToSign[0]),
    });
    logInfo("✍️  Signature received from MPC");

    // Check if there was an error in the signature response
    if ('error' in signRes) {
      logError(`Signature request failed: ${String(signRes.error)}`);
      return c.json({ 
        error: "Signature request failed", 
        details: signRes.error 
      }, 500);
    }

    // Reconstruct the signed transaction
    const signedTransaction = Evm.finalizeTransactionSigning({
      transaction,
      rsvSignatures: [toRSV(signRes)],
    });

    // Broadcast the signed transaction
    const txHash = await Evm.broadcastTx(signedTransaction);
    logInfo(`📡 Broadcasted Ethereum tx: ${txHash.hash}`);

    // Send back both the txHash and the new price optimistically
    return c.json({
      txHash: txHash.hash,
      newPrice: (ethPrice / 100).toFixed(2),
    });
  } catch (error) {
    logError(`Failed to send the Ethereum transaction: ${error instanceof Error ? error.message : String(error)}`);
    return c.json({ error: "Failed to send the transaction" }, 500);
  }
});

async function getPricePayload(ethPrice: number, contractId: string) {
  // Derive the price pusher Ethereum address
  const { address: senderAddress } = await Evm.deriveAddressAndPublicKey(
    contractId,
    "ethereum-1",
  );
  
  // Get the next nonce for this address
  const nonce = await getNextEthereumNonce(senderAddress);
  
  // Create a new JSON-RPC provider for the Ethereum network
  const provider = new JsonRpcProvider(ethRpcUrl);
  // Create a new contract interface for the Ethereum Oracle contract
  const contract = new Contract(ethContractAddress, ethContractAbi, provider);
  // Encode the function data for the updatePrice function
  const data = contract.interface.encodeFunctionData("updatePrice", [ethPrice]);
  
  // Prepare the transaction for signing with explicit nonce
  const { transaction, hashesToSign } = await Evm.prepareTransactionForSigning({
    from: senderAddress,
    to: ethContractAddress,
    data,
    nonce,
  });

  return { transaction, hashesToSign };
}

export default app;
```

### 1) Create Avalanche utils: `src/utils/avalanche.ts`

- Use the same ABI as Ethereum’s `PriceOracle`.
- Point the viem client at Fuji RPC initially.
- Prefer `avalanche-1` path if MPC supports it; otherwise fall back to `ethereum-1`.

Suggested content:

```ts
// src/utils/avalanche.ts
import { contracts, chainAdapters } from "chainsig.js";
import { createPublicClient, http } from "viem";

export const avalancheFujiRpcUrl = "https://api.avax-test.network/ext/bc/C/rpc";
export const avalancheMainnetRpcUrl = "https://api.avax.network/ext/bc/C/rpc";

// Replace after deployment
export const avalancheFujiContractAddress = "0x...";
export const avalancheMainnetContractAddress = "0x...";

export const avalancheContractAbi = [
  { inputs: [{ internalType: "uint256", name: "_price", type: "uint256" }], name: "updatePrice", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [], name: "getPrice", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" },
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
    path: "avalanche-1", // fallback to "ethereum-1" if not configured
    chainId: 43113,
    adapter: AvalancheFuji,
  },
  mainnet: {
    rpcUrl: avalancheMainnetRpcUrl,
    contractAddress: avalancheMainnetContractAddress,
    path: "avalanche-mainnet", // fallback to "ethereum-mainnet" if not configured
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
```

### 2) Add account route: `src/routes/avalancheAccount.ts`

```ts
import { Hono } from "hono";
import { getAvalancheAdapter, getAvalanchePath } from "../utils/avalanche";

const app = new Hono();

app.get("/", async (c) => {
  const contractId = process.env.NEXT_PUBLIC_contractId;
  try {
    const adapter = getAvalancheAdapter('testnet');
    const path = getAvalanchePath('testnet');
    const { address: senderAddress } = await adapter.deriveAddressAndPublicKey(contractId, path);
    const balance = await adapter.getBalance(senderAddress);
    return c.json({ senderAddress, balance: Number(balance.balance), network: 'fuji', chainId: 43113 });
  } catch (error) {
    return c.json({ error: "Failed to get Avalanche derived address" }, 500);
  }
});

export default app;
```

### 3) Add transaction route: `src/routes/avalancheTransaction.ts`

- Same flow as Ethereum: get price, derive address, encode updatePrice, prepare → sign → finalize → broadcast.
- Use `getAvalancheAdapter('testnet')` and `getAvalanchePath('testnet')`.

```ts
import { Hono } from "hono";
import { requestSignature } from "../utils/nonceManager";
import { getAvalancheAdapter, getAvalanchePath, avalancheChainConfig, avalancheContractAbi } from "../utils/avalanche";
import { getEthereumPriceUSD } from "../utils/fetch-eth-price";
import { Contract, JsonRpcProvider } from "ethers";
import { utils } from "chainsig.js";
const { toRSV, uint8ArrayToHex } = utils.cryptography;

const app = new Hono();

app.get("/", async (c) => {
  try {
    const contractId = process.env.NEXT_PUBLIC_contractId;
    if (!contractId) return c.json({ error: "Contract ID not configured" }, 500);

    const ethPrice = await getEthereumPriceUSD();
    if (!ethPrice) return c.json({ error: "Failed to fetch ETH price" }, 500);

    const adapter = getAvalancheAdapter('testnet');
    const path = getAvalanchePath('testnet');
    const { transaction, hashesToSign } = await getPricePayload(ethPrice, contractId, adapter, path);

    const signRes = await requestSignature({ path, payload: uint8ArrayToHex(hashesToSign[0]) });
    if ('error' in signRes) return c.json({ error: 'Signature request failed', details: signRes.error }, 500);

    const signedTransaction = adapter.finalizeTransactionSigning({
      transaction,
      rsvSignatures: [toRSV(signRes)],
    });

    const txHash = await adapter.broadcastTx(signedTransaction);
    return c.json({ txHash: txHash.hash, newPrice: (ethPrice / 100).toFixed(2) });
  } catch (error) {
    return c.json({ error: "Failed to send Avalanche transaction" }, 500);
  }
});

async function getPricePayload(ethPrice: number, contractId: string, adapter: any, path: string) {
  const { address: senderAddress } = await adapter.deriveAddressAndPublicKey(contractId, path);

  const provider = new JsonRpcProvider(avalancheChainConfig.testnet.rpcUrl);
  const contract = new Contract(
    avalancheChainConfig.testnet.contractAddress,
    avalancheContractAbi,
    provider,
  );
  const data = contract.interface.encodeFunctionData("updatePrice", [ethPrice]);

  const { transaction, hashesToSign } = await adapter.prepareTransactionForSigning({
    from: senderAddress,
    to: avalancheChainConfig.testnet.contractAddress,
    data,
  });
  return { transaction, hashesToSign };
}

export default app;
```

### 4) Wire routes in `src/index.ts`

Add:

```ts
import avalancheAccount from "./routes/avalancheAccount";
import avalancheTransaction from "./routes/avalancheTransaction";

app.route("/api/avalanche-account", avalancheAccount);
app.route("/api/avalanche-transaction", avalancheTransaction);
```

## Contract deployment (Fuji)

1) Add Fuji network to Hardhat:

```js
// hardhat.config.js
networks: {
  fuji: {
    url: "https://api.avax-test.network/ext/bc/C/rpc",
    chainId: 43113,
    accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    gasPrice: "auto",
  },
}
```

2) Fund your deployer wallet with test AVAX (Fuji faucet: `https://faucet.avax.network/`).

3) Deploy `PriceOracle` to Fuji and transfer ownership to your NEAR-derived address (the EVM address derived by the agent). You can temporarily deploy with your wallet as owner and then call `transferOwnership(derivedAddress)` after you expose the derived address via `/api/avalanche-account`.

4) Update addresses:
- `src/utils/avalanche.ts` → `avalancheFujiContractAddress`
- `frontend/src/networks.js` → contract address for `avalanche`

## Frontend integration

Add Avalanche to the shared networks configuration used by the reader utilities.

```js
// frontend/src/networks.js
export const NETWORKS = {
  // ... existing
  avalanche: {
    id: 'avalanche',
    name: 'Avalanche Fuji',
    rpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc',
    contractAddress: '0x...', // set after deploy
    chainId: 43113,
    explorerUrl: 'https://testnet.snowtrace.io',
    faucetUrl: 'https://faucet.avax.network/',
    currency: 'AVAX',
    apiEndpoints: {
      account: '/api/avalanche-account',
      transaction: '/api/avalanche-transaction'
    }
  }
};
```

Extend the reader helper to include Avalanche in aggregate calls and timestamp lookups.

```js
// frontend/src/ethereum.js (helpers are chain-agnostic via NETWORKS)
export async function getAllContractPrices() {
  const ids = ['sepolia','iotex','avalanche'];
  // ...rest unchanged
}
```

Add a new UI card in `frontend/src/App.jsx` by duplicating the IoTeX card and adjusting labels, selection key (`'avalanche'`), explorer link (Snowtrace), and endpoint selectors to call `/api/avalanche-transaction` when that chain is clicked.

Tip: follow the same selection and polling pattern used for IoTeX and Ethereum so batch updates include Avalanche.

## Testing

- Account derivation
  - `curl -s http://localhost:3000/api/avalanche-account | jq` (verify `senderAddress`, `balance`, `chainId` 43113)
- Transaction
  - `curl -s http://localhost:3000/api/avalanche-transaction | jq` (verify `txHash`)
  - Open `https://testnet.snowtrace.io/tx/<txHash>` to confirm on-chain
- Frontend
  - Confirm Avalanche card shows price and updates after transactions

## Common issues

- Path not configured: If `avalanche-1` fails in signature requests, switch to `ethereum-1` temporarily and request an Avalanche-specific path in the MPC configuration.
- Nonce/gas: C-Chain is standard EVM; avoid chain-specific gas tweaks (like IoTeX fixed gas) unless your provider signals errors. Public RPCs may rate-limit; consider a dedicated provider for demos.
- Explorer changes: If Snowtrace endpoints change, use Chainlist or the Avalanche Builder Hub to confirm current explorers.

## Cursor rules (mdc) updates

- Add Avalanche to the “supported EVM chains” list
- Add guidance for using `avalanche-1`/`avalanche-mainnet` paths and the `ethereum-1` fallback
- Include Fuji RPC, chainId, explorer, faucet
- Include code ownership notes: contract must be owned by the NEAR-derived address used by the agent

## Rollout checklist

- Backend
  - Avalanche utils created and exported
  - Account and transaction routes added and wired
- Contracts
  - Deployed to Fuji
  - Ownership transferred to derived address
  - Addresses updated in utils and frontend
- Frontend
  - Network entry added
  - UI card added and selectable for batch updates
  - Readers include Avalanche in aggregates and polling
- Docs & rules
  - This doc added
  - Cursor rules updated with Avalanche

When ready for Mainnet: duplicate Fuji config with Mainnet RPC, chainId 43114, explorer `https://snowtrace.io`, and the deployed mainnet address. Preserve path naming parity with MPC (`avalanche-mainnet`).