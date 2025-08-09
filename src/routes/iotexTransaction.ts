import { Hono } from "hono";
import { requestSignature } from "../utils/nonceManager";
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
import { logInfo, logError } from "../utils/logStream";

const app = new Hono();

app.get("/", async (c) => {
  try {
    logInfo("🚀 Starting IoTeX transaction");
    
    const contractId = process.env.NEXT_PUBLIC_contractId;
    if (!contractId) {
      logError("❌ Contract ID not configured");
      return c.json({ error: "Contract ID not configured" }, 500);
    }
    logInfo(`✅ Contract ID: ${contractId}`);

    // Get the ETH price (reusing the same price feed)
    logInfo("📊 Fetching ETH price...");
    const ethPrice = await getEthereumPriceUSD();
    if (!ethPrice) {
      logError("❌ Failed to fetch ETH price");
      return c.json({ error: "Failed to fetch ETH price" }, 500);
    }
    logInfo(`✅ ETH price: ${ethPrice}`);

    // Get the transaction and payload to sign using the IoTeX adapter (fixed gas)
    logInfo("🔧 Preparing transaction for signing via IoTeX adapter...");
    const debug = c.req.query("debug") === "1";
    const { transaction, hashesToSign, senderAddress } = await getIoTeXPricePayload(
      ethPrice,
      contractId,
      debug,
    );
    logInfo(`✅ Transaction prepared, hashes to sign: ${hashesToSign.length}`);
    logInfo("🧾 Prepared tx (types): " + JSON.stringify({
      gas: typeof (transaction as any)?.gas,
      gasPrice: typeof (transaction as any)?.gasPrice,
      value: typeof (transaction as any)?.value,
      nonce: typeof (transaction as any)?.nonce,
      chainId: typeof (transaction as any)?.chainId,
    }));

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
    logInfo("✍️  Signature received from MPC");

    // Check if there was an error in the signature response
    if ('error' in signRes) {
      logError(`Signature request failed: ${String(signRes.error)}`);
      return c.json({ 
        error: "Signature request failed", 
        details: signRes.error 
      }, 500);
    }

    // Create signed transaction manually for IoTeX
    logInfo("🔧 Serializing signed transaction (ethers)...");
    
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
    logInfo("✅ Transaction signed and serialized");

    // Broadcast transaction (try ethers first, then viem as fallback)
    logInfo("📡 Broadcasting transaction to IoTeX...");
    let txHash: string;
    try {
      const provider = new JsonRpcProvider(iotexRpcUrl);
      const resp = await provider.broadcastTransaction(signedTransaction);
      txHash = String((resp as any)?.hash || resp);
      logInfo(`✅ Transaction broadcasted to IoTeX (ethers): ${txHash}`);
    } catch (e1) {
      const m1 = e1 instanceof Error ? e1.message : String(e1);
      logError(`❌ Ethers broadcast failed, retrying with viem: ${m1}`);
      try {
        const { createPublicClient, http } = await import("viem");
        const iotexClient = createPublicClient({ transport: http(iotexRpcUrl) });
        const rawHash = await iotexClient.sendRawTransaction({
          serializedTransaction: signedTransaction as `0x${string}`,
        });
        txHash = String(rawHash);
        logInfo(`✅ Transaction broadcasted to IoTeX (viem): ${txHash}`);
      } catch (e2) {
        const m2 = e2 instanceof Error ? e2.message : String(e2);
        logError(`❌ Viem broadcast failed: ${m2}`);
        throw e2;
      }
    }
    const blockNumber = null; // Block number not immediately available from sendRawTransaction

    return c.json({
      txHash,
      newPrice: (ethPrice / 100).toFixed(2),
      success: true,
      blockNumber,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError(`❌ IoTeX transaction failed at step: ${message}`);
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