import { Hono } from "hono";
import { getSolanaAdapter, getSolanaPath } from "../utils/solana";

const app = new Hono();

app.get("/", async (c) => {
  const contractId = process.env.NEXT_PUBLIC_contractId;
  const network = (c.req.query("network") as "devnet" | "mainnet") || "devnet";

  try {
    const adapter = getSolanaAdapter(network);
    const path = getSolanaPath(network);

    const { address } = await adapter.deriveAddressAndPublicKey(contractId, path);
    const balance = await adapter.getBalance(address);

    return c.json({
      address,
      balance: Number(balance.balance),
      network,
    });
  } catch (error) {
    return c.json(
      {
        error: "Failed to get the derived Solana address",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

export default app;


