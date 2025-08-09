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