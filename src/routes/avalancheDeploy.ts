import { Hono } from "hono";
import { getAvalanchePath, avalancheChainConfig, avalancheFujiRpcUrls } from "../utils/avalanche";
import { requestSignature } from "../utils/nonceManager";
import { ethers } from "ethers";
import { logInfo, logError } from "../utils/logStream";
import fs from "fs";
import path from "path";
import { utils } from "chainsig.js";
const { toRSV, uint8ArrayToHex } = utils.cryptography;

const app = new Hono();

app.get("/", async (c) => {
  try {
    const contractId = process.env.NEXT_PUBLIC_contractId;
    if (!contractId) return c.json({ error: "Contract ID not configured" }, 500);

    const artifactPath = path.join(process.cwd(), "artifacts/contracts/PriceOracle.sol/PriceOracle.json");
    if (!fs.existsSync(artifactPath)) return c.json({ error: "Artifact not found" }, 500);
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const bytecode: string = artifact.bytecode;

    const pathId = getAvalanchePath('testnet');

    // Derive sender using chainsig EVM adapter via viem fallback
    const { createPublicClient, http } = await import("viem");
    const deriveClient = createPublicClient({ transport: http(avalancheChainConfig.testnet.rpcUrl) });
    const { chainAdapters, contracts } = await import('chainsig.js');
    const mpc = new contracts.ChainSignatureContract({ networkId: 'testnet', contractId: 'v1.signer-prod.testnet' });
    const evm = new chainAdapters.evm.EVM({ publicClient: deriveClient, contract: mpc }) as any;
    const { address: senderAddress } = await evm.deriveAddressAndPublicKey(contractId, pathId);

    // Build legacy create tx (no constructor args)
    const unsignedTxBase = {
      to: null as any,
      value: 0n,
      data: bytecode as `0x${string}`,
      gasLimit: 800000n,
      chainId: avalancheChainConfig.testnet.chainId,
      type: 0 as const,
    };

    // Try endpoints with failover
    let lastError: string | null = null;
    for (const rpc of avalancheFujiRpcUrls) {
      try {
        const pc = createPublicClient({ transport: http(rpc) });
        const [gasPrice, nonce] = await Promise.all([
          pc.getGasPrice(),
          pc.getTransactionCount({ address: senderAddress as `0x${string}`, blockTag: 'pending' }),
        ]);
        const unsignedTx = { ...unsignedTxBase, gasPrice, nonce: Number(nonce) };
        const tx = ethers.Transaction.from(unsignedTx);
        const hashToSign = ethers.getBytes(tx.unsignedHash);
        const signRes = await requestSignature({ path: pathId, payload: uint8ArrayToHex(hashToSign) });
        if ('error' in signRes) throw new Error(String(signRes.error));
        const rsvSig = toRSV(signRes);
        tx.signature = { r: '0x' + rsvSig.r, s: '0x' + rsvSig.s, v: rsvSig.v };
        const serialized = tx.serialized;
        const provider = new ethers.JsonRpcProvider(rpc);
        const rcpt = await provider.broadcastTransaction(serialized);
        const txHash = rcpt.hash;
        logInfo(`📡 Broadcasted Avalanche deploy tx: ${txHash} via ${rpc}`);
        // Poll for receipt and contract address
        const receipt = await provider.waitForTransaction(txHash, { timeout: 30000 });
        // ethers v6 waitForTransaction returns TransactionReceipt | null; if null, continue
        if (!receipt) continue;
        const contractAddress = (receipt as any).contractAddress || null;
        return c.json({ txHash, contractAddress, from: senderAddress, rpc });
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        logError(`Deploy via ${rpc} failed: ${lastError}`);
        continue;
      }
    }

    return c.json({ error: "All RPC endpoints failed for deploy", details: lastError }, 500);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError(`Failed to deploy on Avalanche: ${message}`);
    return c.json({ error: "Failed to deploy on Avalanche", details: message }, 500);
  }
});

export default app;