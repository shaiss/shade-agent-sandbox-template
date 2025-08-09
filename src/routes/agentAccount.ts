import { Hono } from "hono";
import { agentAccountId, agent } from "@neardefi/shade-agent-js";

const app = new Hono();

app.get("/", async (c) => {
  try {
    // Get the agent's NEAR account id
    const accountIdResponse = await agentAccountId();
    const accountId =
      typeof accountIdResponse === "string"
        ? accountIdResponse
        : (accountIdResponse as any)?.accountId || (accountIdResponse as any)?.id || "";

    // Get the balance of the agent account
    const balanceResponse = await agent("getBalance");
    const balance =
      typeof balanceResponse === "object" && balanceResponse && "balance" in (balanceResponse as any)
        ? (balanceResponse as any).balance
        : (balanceResponse as any);

    return c.json({ accountId, balance });
  } catch (error) {
    console.log("Error getting agent account:", error);
    return c.json({ error: "Failed to get agent account " + error }, 500);
  }
});

export default app;
