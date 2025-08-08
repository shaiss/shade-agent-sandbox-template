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