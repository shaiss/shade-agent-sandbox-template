import { Hono } from "hono";
import { getSolanaAdapter, getSolanaPath, solanaRpcUrl } from "../utils/solana";
import { requestSignature } from "../utils/nonceManager";
import { getEthereumPriceUSD } from "../utils/fetch-eth-price";
import { Connection, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { utils } from "chainsig.js";

const { uint8ArrayToHex } = utils.cryptography;

function numberToU64Le(value: number): Uint8Array {
  const v = BigInt(Math.floor(value));
  const b = new Uint8Array(8);
  let x = v;
  for (let i = 0; i < 8; i++) {
    b[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return b;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
}

const app = new Hono();

app.get("/", async (c) => {
  try {
    const contractId = process.env.NEXT_PUBLIC_contractId;
    if (!contractId) return c.json({ error: "Contract ID not configured" }, 500);

    const programIdStr = process.env.SOLANA_PROGRAM_ID;
    const priceAccountStr = process.env.SOLANA_PRICE_ACCOUNT;
    if (!programIdStr || !priceAccountStr) {
      return c.json({
        error: "Solana program configuration missing",
        details: "Set SOLANA_PROGRAM_ID and SOLANA_PRICE_ACCOUNT in .env.development.local",
      }, 500);
    }

    const connection = new Connection(solanaRpcUrl, { commitment: "confirmed" });
    const adapter = getSolanaAdapter("devnet");
    const path = getSolanaPath("devnet");

    // Derive Solana address (fee payer)
    const { address: feePayerBase58 } = await adapter.deriveAddressAndPublicKey(contractId, path);
    const feePayer = new PublicKey(feePayerBase58);

    // Fetch price and scale to cents similar to EVM contracts
    const ethPrice = await getEthereumPriceUSD();
    if (!ethPrice) return c.json({ error: "Failed to fetch ETH price" }, 500);
    const priceScaled = Math.round(Number(ethPrice) * 100);

    // Build instruction to call the oracle program
    const programId = new PublicKey(programIdStr);
    const priceAccount = new PublicKey(priceAccountStr);

    // Minimal data format: 8-byte little-endian u64 price
    const data = numberToU64Le(priceScaled);

    const ix = new TransactionInstruction({
      programId,
      keys: [
        { pubkey: priceAccount, isSigner: false, isWritable: true },
        { pubkey: feePayer, isSigner: true, isWritable: false },
      ],
      data: Buffer.from(data),
    });

    const { blockhash } = await connection.getLatestBlockhash("finalized");
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer });
    tx.add(ix);

    // Hash to sign (ed25519 over message bytes)
    const messageBytes = tx.serializeMessage();

    // Request MPC signature
    const signRes = await requestSignature({
      path,
      payload: uint8ArrayToHex(messageBytes),
    });

    if ((signRes as any)?.error) {
      return c.json({ error: "Signature request failed", details: (signRes as any).error }, 500);
    }

    const signatureHex: string = typeof signRes === "string" ? signRes : (signRes as any)?.signature || (signRes as any);
    const sigBytes = hexToBytes(signatureHex);

    // Attach signature
    tx.addSignature(feePayer, Buffer.from(sigBytes));

    // Serialize and broadcast
    const raw = tx.serialize();
    const txHash = await connection.sendRawTransaction(raw, { skipPreflight: false });

    return c.json({
      txHash,
      newPrice: (priceScaled / 100).toFixed(2),
      success: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: "Failed to send the Solana transaction", details: message }, 500);
  }
});

export default app;


