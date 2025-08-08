import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import dotenv from "dotenv";

// Load environment variables from .env file (only needed for local development)
if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: ".env.development.local" });
}

// Import routes
import ethAccount from "./routes/ethAccount";
import agentAccount from "./routes/agentAccount";
import transaction from "./routes/transaction";
import iotexAccount from "./routes/iotexAccount";
import iotexTransaction from "./routes/iotexTransaction";
import nonceControl from "./routes/nonceControl";
import solanaAccount from "./routes/solanaAccount";
import solanaTransaction from "./routes/solanaTransaction";
import price from "./routes/price";
import avalancheAccount from "./routes/avalancheAccount";
import avalancheTransaction from "./routes/avalancheTransaction";
import { attachSSE, hookConsole, logInfo } from "./utils/logStream";

// Hook console to broadcast to SSE stream
hookConsole();

const app = new Hono();

// Configure CORS to restrict access to the server
app.use(cors());

// Health check
app.get("/", (c) => c.json({ message: "App is running" }));

// Routes
app.route("/api/eth-account", ethAccount);
app.route("/api/agent-account", agentAccount);
app.route("/api/transaction", transaction);
app.route("/api/iotex-account", iotexAccount);
app.route("/api/iotex-transaction", iotexTransaction);
app.route("/api/nonce-control", nonceControl);
app.route("/api/price", price);
app.route("/api/solana-account", solanaAccount);
app.route("/api/solana-transaction", solanaTransaction);
app.route("/api/avalanche-account", avalancheAccount);
app.route("/api/avalanche-transaction", avalancheTransaction);
// Simple SSE endpoint for log stream
app.get("/api/logs/stream", (c) => attachSSE(c));

// Start the server
const port = Number(process.env.PORT || "3000");

console.log(`App is running on port ${port}`);
logInfo(`SSE log stream ready at /api/logs/stream`);

serve({ fetch: app.fetch, port });
