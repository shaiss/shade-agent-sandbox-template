import { Hono } from "hono";
import { 
  setNonceIncrementEnabled, 
  isNonceIncrementEnabled, 
  resetNonceTracking 
} from "../utils/nonceManager";
import { resetEthereumNonces } from "../utils/ethereumNonceManager";

const app = new Hono();

// Get current nonce increment status
app.get("/status", async (c) => {
  return c.json({
    nonceIncrementEnabled: isNonceIncrementEnabled(),
    description: isNonceIncrementEnabled() 
      ? "Nonce auto-increment is ENABLED - Multiple chains will work seamlessly"
      : "Nonce auto-increment is DISABLED - Demonstrates NEAR's replay attack protection"
  });
});

// Enable/disable nonce increment
app.post("/toggle", async (c) => {
  const currentStatus = isNonceIncrementEnabled();
  const newStatus = !currentStatus;
  setNonceIncrementEnabled(newStatus);
  
  return c.json({
    nonceIncrementEnabled: newStatus,
    previousStatus: currentStatus,
    message: newStatus 
      ? "Nonce auto-increment ENABLED - Multi-chain transactions will now work smoothly!"
      : "Nonce auto-increment DISABLED - Will demonstrate NEAR's security features"
  });
});

// Reset nonce tracking (useful between demos)
app.post("/reset", async (c) => {
  resetNonceTracking();
  resetEthereumNonces();
  return c.json({
    success: true,
    message: "Nonce tracking reset for both NEAR and Ethereum - Ready for fresh demo"
  });
});

export default app;
