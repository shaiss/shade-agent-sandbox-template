import { Hono } from "hono";
import { requestSignature } from "@neardefi/shade-agent-js";
import {
  iotexContractAddress,
  iotexRpcUrl,
  iotexContractAbi,
  IoTeX,
  getIoTeXPath,
} from "../utils/iotex";
import { getEthereumPriceUSD } from "../utils/fetch-eth-price";
import { Evm } from "../utils/ethereum";
import { Contract, JsonRpcProvider, ethers } from "ethers";
import { utils } from "chainsig.js";
const { toRSV, uint8ArrayToHex } = utils.cryptography;

const app = new Hono();

app.get("/", async (c) => {
  try {
    console.log("🚀 Starting IoTeX transaction");
    
    const contractId = process.env.NEXT_PUBLIC_contractId;
    if (!contractId) {
      console.log("❌ Contract ID not configured");
      return c.json({ error: "Contract ID not configured" }, 500);
    }
    console.log("✅ Contract ID:", contractId);

    // Get the ETH price (reusing the same price feed)
    console.log("📊 Fetching ETH price...");
    const ethPrice = await getEthereumPriceUSD();
    if (!ethPrice) {
      console.log("❌ Failed to fetch ETH price");
      return c.json({ error: "Failed to fetch ETH price" }, 500);
    }
    console.log("✅ ETH price:", ethPrice);

    // Get the transaction and payload to sign using the IoTeX adapter (fixed gas)
    console.log("🔧 Preparing transaction for signing via IoTeX adapter...");
    const debug = c.req.query("debug") === "1";
    const { transaction, hashesToSign, senderAddress } = await getIoTeXPricePayload(
      ethPrice,
      contractId,
      debug,
    );
    console.log("✅ Transaction prepared, hashes to sign:", hashesToSign.length);
    console.log("🧾 Prepared tx (types):", {
      gas: typeof (transaction as any)?.gas,
      gasPrice: typeof (transaction as any)?.gasPrice,
      value: typeof (transaction as any)?.value,
      nonce: typeof (transaction as any)?.nonce,
      chainId: typeof (transaction as any)?.chainId,
    });

    // Debug path: return transaction shape/types without signing/broadcasting
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

    // Call the agent contract to get a signature for the payload
    const signRes = await requestSignature({
      path: getIoTeXPath("testnet"),
      payload: uint8ArrayToHex(hashesToSign[0]),
    });
    console.log("signRes", signRes);

    // Create signed transaction manually for IoTeX
    console.log("🔧 Serializing signed transaction (ethers)...");
    
    // Convert signature to ethers format
    const rsvSig = toRSV(signRes);
    const signature = {
      r: '0x' + rsvSig.r,
      s: '0x' + rsvSig.s,
      v: rsvSig.v
    };

    // Create ethers Transaction and add signature
    const tx = ethers.Transaction.from({
      to: transaction.to,
      value: transaction.value,
      data: transaction.data,
      gasLimit: transaction.gas,
      gasPrice: transaction.gasPrice,
      nonce: transaction.nonce,
      chainId: transaction.chainId,
      type: 0,
    });

    // Set the signature on the transaction
    tx.signature = signature;

    // Get the serialized signed transaction
    const signedTransaction = tx.serialized;
    console.log("✅ Transaction signed and serialized");

    // Broadcast using viem client directly
    console.log("📡 Broadcasting transaction to IoTeX...");
    const { createPublicClient, http } = await import("viem");
    const iotexClient = createPublicClient({
      transport: http(iotexRpcUrl),
    });

    let txResult;
    try {
      const txHash = await iotexClient.sendRawTransaction({
        serializedTransaction: signedTransaction as `0x${string}`,
      });
      console.log("✅ Transaction broadcasted to IoTeX:", txHash);
      txResult = { hash: txHash };
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      console.error("❌ Broadcast failed:", m);
      throw e;
    }
    const txHash = String(txResult.hash || txResult);
    const blockNumber = null; // Block number not immediately available from sendRawTransaction

    return c.json({
      txHash,
      newPrice: (ethPrice / 100).toFixed(2),
      success: true,
      blockNumber,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("❌ IoTeX transaction failed at step:", message);
    console.error("Full error:", error);
    return c.json({ 
      error: "Failed to send the IoTeX transaction",
      details: message
    }, 500);
  }
});

async function getIoTeXPricePayload(ethPrice: number, contractId: string, debug = false) {
  // Derive the IoTeX address using the IoTeX adapter
  const { address: senderAddress } = await Evm.deriveAddressAndPublicKey(
    contractId,
    getIoTeXPath("testnet"),
  );

  // Use Interface directly to avoid provider/RPC mismatches
  const iface = new ethers.Interface(iotexContractAbi);

  // Encode the function data for the updatePrice function
  const data = iface.encodeFunctionData("updatePrice", [BigInt(ethPrice)]);

  // Prepare via IoTeX adapter (fixed gas + legacy via adapter)
  const { transaction, hashesToSign } = await IoTeX.prepareTransactionForSigning({
    from: senderAddress,
    to: iotexContractAddress,
    data,
    gas: 150000n,
  });

  return { transaction, hashesToSign, senderAddress };
}

export default app; 