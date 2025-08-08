import { Hono } from "hono";
import { requestSignature } from "../utils/nonceManager";
import { getAvalancheAdapter, getAvalanchePath, avalancheChainConfig, avalancheContractAbi } from "../utils/avalanche";
import { getEthereumPriceUSD } from "../utils/fetch-eth-price";
import { Contract, JsonRpcProvider } from "ethers";
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

    const adapter = getAvalancheAdapter('testnet');
    const path = getAvalanchePath('testnet');
    const debug = c.req.query("debug") === "1";

    const { transaction, hashesToSign } = await getPricePayload(ethPrice, contractId, adapter, path);
    logInfo("🔧 Prepared Avalanche tx for signing (1 hash)");

    if (debug) {
      const t: any = transaction as any;
      return c.json({
        debug: true,
        tx: {
          to: t?.to,
          value: t?.value != null ? String(t.value) : null,
          data: t?.data?.slice?.(0, 20) + "...",
          gas: t?.gas != null ? String(t.gas) : null,
          gasPrice: t?.gasPrice != null ? String(t.gasPrice) : null,
          nonce: t?.nonce,
          chainId: t?.chainId,
        },
        types: {
          value: typeof t?.value,
          gas: typeof t?.gas,
          gasPrice: typeof t?.gasPrice,
          nonce: typeof t?.nonce,
          chainId: typeof t?.chainId,
        }
      });
    }

    const signRes = await requestSignature({ path, payload: uint8ArrayToHex(hashesToSign[0]) });
    if ('error' in signRes) {
      logError(`Signature request failed: ${String(signRes.error)}`);
      return c.json({ error: 'Signature request failed', details: signRes.error }, 500);
    }

    const signedTransaction = adapter.finalizeTransactionSigning({
      transaction,
      rsvSignatures: [toRSV(signRes)],
    });

    const txHash = await adapter.broadcastTx(signedTransaction);
    logInfo(`📡 Broadcasted Avalanche tx: ${txHash.hash}`);
    return c.json({ txHash: txHash.hash, newPrice: (ethPrice / 100).toFixed(2) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError(`Failed to send Avalanche transaction: ${message}`);
    return c.json({ error: "Failed to send Avalanche transaction", details: message }, 500);
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

  // Get pending/explicit nonce using viem client
  const { createPublicClient, http } = await import("viem");
  const pc = createPublicClient({ transport: http(avalancheChainConfig.testnet.rpcUrl) });
  const nonce = await pc.getTransactionCount({ address: senderAddress as `0x${string}`, blockTag: 'pending' });

  const { transaction, hashesToSign } = await adapter.prepareTransactionForSigning({
    from: senderAddress,
    to: avalancheChainConfig.testnet.contractAddress,
    data,
    nonce: Number(nonce),
  });
  return { transaction, hashesToSign };
}

export default app;