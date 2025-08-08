import { Hono } from "hono";
import { requestSignature } from "../utils/nonceManager";
import { getAvalanchePath, avalancheChainConfig, avalancheContractAbi } from "../utils/avalanche";
import { getEthereumPriceUSD } from "../utils/fetch-eth-price";
import { Contract, JsonRpcProvider, ethers } from "ethers";
import { utils } from "chainsig.js";
import { logInfo, logError } from "../utils/logStream";
const { toRSV, uint8ArrayToHex } = utils.cryptography;

const app = new Hono();

app.get("/", async (c) => {
  try {
    const contractId = process.env.NEXT_PUBLIC_contractId;
    if (!contractId) return c.json({ error: "Contract ID not configured" }, 500);

    const ethPrice = await getEthereumPriceUSD();
    if (!ethPrice) return c.json({ error: "Failed to fetch ETH price" }, 500);
    logInfo(`🧮 ETH price (cents): ${ethPrice}`);

    const path = getAvalanchePath('testnet');

    // Derive sender address
    const { createPublicClient, http } = await import("viem");
    const viemClient = createPublicClient({ transport: http(avalancheChainConfig.testnet.rpcUrl) });
    const { address: senderAddress } = await viemClient.request({
      method: 'eth_accountByPath',
      params: [contractId, path]
    }).catch(async () => {
      // Fallback: use EVM derivation via chainsig directly if node method not available
      const { chainAdapters, contracts } = await import('chainsig.js');
      const mpc = new contracts.ChainSignatureContract({ networkId: 'testnet', contractId: 'v1.signer-prod.testnet' });
      const evm = new chainAdapters.evm.EVM({ publicClient: viemClient, contract: mpc }) as any;
      const res = await evm.deriveAddressAndPublicKey(contractId, path);
      return { address: res.address };
    }) as any;

    // Build call data
    const provider = new JsonRpcProvider(avalancheChainConfig.testnet.rpcUrl);
    const contract = new Contract(
      avalancheChainConfig.testnet.contractAddress,
      avalancheContractAbi,
      provider,
    );
    const data = contract.interface.encodeFunctionData("updatePrice", [ethPrice]);

    // Fetch gas price and nonce
    const [gasPrice, nonce] = await Promise.all([
      viemClient.getGasPrice(),
      viemClient.getTransactionCount({ address: senderAddress as `0x${string}`, blockTag: 'pending' }),
    ]);

    // Construct legacy tx
    const unsignedTx = {
      to: avalancheChainConfig.testnet.contractAddress,
      value: 0n,
      data,
      gasLimit: 150000n,
      gasPrice,
      nonce: Number(nonce),
      chainId: avalancheChainConfig.testnet.chainId,
      type: 0 as const,
    };

    const tx = ethers.Transaction.from(unsignedTx);
    const hashToSign = ethers.getBytes(tx.unsignedHash);

    // MPC sign
    const signRes = await requestSignature({ path, payload: uint8ArrayToHex(hashToSign) });
    if ('error' in signRes) {
      logError(`Signature request failed: ${String(signRes.error)}`);
      return c.json({ error: 'Signature request failed', details: signRes.error }, 500);
    }

    const rsvSig = toRSV(signRes);
    tx.signature = { r: '0x' + rsvSig.r, s: '0x' + rsvSig.s, v: rsvSig.v };
    const serialized = tx.serialized;

    // Broadcast using ethers provider
    const receipt = await provider.broadcastTransaction(serialized);
    const txHash = receipt.hash;
    logInfo(`📡 Broadcasted Avalanche tx: ${txHash}`);
    return c.json({ txHash, newPrice: (ethPrice / 100).toFixed(2) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError(`Failed to send Avalanche transaction: ${message}`);
    return c.json({ error: "Failed to send Avalanche transaction", details: message }, 500);
  }
});

export default app;