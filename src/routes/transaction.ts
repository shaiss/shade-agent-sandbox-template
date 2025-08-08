import { Hono } from "hono";
import { requestSignature } from "../utils/nonceManager";
import {
  ethContractAbi,
  ethContractAddress,
  ethRpcUrl,
  Evm,
} from "../utils/ethereum";
import { getEthereumPriceUSD } from "../utils/fetch-eth-price";
import { getNextEthereumNonce } from "../utils/ethereumNonceManager";
import { Contract, JsonRpcProvider } from "ethers";
import { utils } from "chainsig.js";
const { toRSV, uint8ArrayToHex } = utils.cryptography;
import { logInfo, logError } from "../utils/logStream";

const app = new Hono();

app.get("/", async (c) => {
  try {
    // Fetch the environment variable inside the route
    const contractId = process.env.NEXT_PUBLIC_contractId;
    if (!contractId) {
      return c.json({ error: "Contract ID not configured" }, 500);
    }

    // Get the ETH price
    const ethPrice = await getEthereumPriceUSD();
    if (!ethPrice) {
      return c.json({ error: "Failed to fetch ETH price" }, 500);
    }

    logInfo(`🧮 ETH price (cents): ${ethPrice}`);
    // Get the transaction and payload to sign
    const { transaction, hashesToSign } = await getPricePayload(
      ethPrice,
      contractId,
    );
    logInfo("🔧 Prepared Ethereum tx for signing (1 hash)");

    // Call the agent contract to get a signature for the payload
    const signRes = await requestSignature({
      path: "ethereum-1",
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

    // Reconstruct the signed transaction
    const signedTransaction = Evm.finalizeTransactionSigning({
      transaction,
      rsvSignatures: [toRSV(signRes)],
    });

    // Broadcast the signed transaction
    const txHash = await Evm.broadcastTx(signedTransaction);
    logInfo(`📡 Broadcasted Ethereum tx: ${txHash.hash}`);

    // Send back both the txHash and the new price optimistically
    return c.json({
      txHash: txHash.hash,
      newPrice: (ethPrice / 100).toFixed(2),
    });
  } catch (error) {
    logError(`Failed to send the Ethereum transaction: ${error instanceof Error ? error.message : String(error)}`);
    return c.json({ error: "Failed to send the transaction" }, 500);
  }
});

async function getPricePayload(ethPrice: number, contractId: string) {
  // Derive the price pusher Ethereum address
  const { address: senderAddress } = await Evm.deriveAddressAndPublicKey(
    contractId,
    "ethereum-1",
  );
  
  // Get the next nonce for this address
  const nonce = await getNextEthereumNonce(senderAddress);
  
  // Create a new JSON-RPC provider for the Ethereum network
  const provider = new JsonRpcProvider(ethRpcUrl);
  // Create a new contract interface for the Ethereum Oracle contract
  const contract = new Contract(ethContractAddress, ethContractAbi, provider);
  // Encode the function data for the updatePrice function
  const data = contract.interface.encodeFunctionData("updatePrice", [ethPrice]);
  
  // Prepare the transaction for signing with explicit nonce
  const { transaction, hashesToSign } = await Evm.prepareTransactionForSigning({
    from: senderAddress,
    to: ethContractAddress,
    data,
    nonce,
  });

  return { transaction, hashesToSign };
}

export default app;
