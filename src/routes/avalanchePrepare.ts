import { Hono } from "hono";
import { getAvalancheAdapter, getAvalanchePath, avalancheChainConfig, avalancheContractAbi } from "../utils/avalanche";
import { getEthereumPriceUSD } from "../utils/fetch-eth-price";
import { Contract, JsonRpcProvider } from "ethers";

const app = new Hono();

app.get("/", async (c) => {
  try {
    const contractId = process.env.NEXT_PUBLIC_contractId;
    if (!contractId) return c.json({ error: "Contract ID not configured" }, 500);

    const ethPrice = await getEthereumPriceUSD();
    if (!ethPrice) return c.json({ error: "Failed to fetch ETH price" }, 500);

    const adapter = getAvalancheAdapter('testnet');
    const path = getAvalanchePath('testnet');

    const { address: senderAddress } = await adapter.deriveAddressAndPublicKey(contractId, path);

    const provider = new JsonRpcProvider(avalancheChainConfig.testnet.rpcUrl);
    const contract = new Contract(
      avalancheChainConfig.testnet.contractAddress,
      avalancheContractAbi,
      provider,
    );
    const data = contract.interface.encodeFunctionData("updatePrice", [ethPrice]);

    const { createPublicClient, http } = await import("viem");
    const pc = createPublicClient({ transport: http(avalancheChainConfig.testnet.rpcUrl) });
    const nonce = await pc.getTransactionCount({ address: senderAddress as `0x${string}`, blockTag: 'pending' });

    const { transaction, hashesToSign } = await adapter.prepareTransactionForSigning({
      from: senderAddress,
      to: avalancheChainConfig.testnet.contractAddress,
      data,
      nonce: Number(nonce),
    });

    const t: any = transaction as any;
    return c.json({
      ok: true,
      from: senderAddress,
      tx: {
        to: t?.to,
        value: t?.value != null ? String(t.value) : null,
        data: t?.data?.slice?.(0, 20) + "...",
        gas: t?.gas != null ? String(t.gas) : null,
        gasPrice: t?.gasPrice != null ? String(t.gasPrice) : null,
        nonce: t?.nonce,
        chainId: t?.chainId,
      }
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ ok: false, error: message }, 500);
  }
});

export default app;