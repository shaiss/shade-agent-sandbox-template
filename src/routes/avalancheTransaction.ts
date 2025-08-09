import { Hono } from "hono";
import { requestSignature } from "../utils/nonceManager";
import { getAvalanchePath, avalancheChainConfig, avalancheContractAbi, avalancheFujiRpcUrls } from "../utils/avalanche";
import { getEthereumPriceUSD } from "../utils/fetch-eth-price";
import { Contract, JsonRpcProvider, ethers } from "ethers";
import { utils } from "chainsig.js";
import { logInfo, logError } from "../utils/logStream";
const { toRSV, uint8ArrayToHex } = utils.cryptography;

const app = new Hono();

app.get("/", async (c) => {
  try {
    const contractId = process.env.NEXT_PUBLIC_contractId;
    if (!contractId) return c.json({ error: "Contract ID not configured" }, 500);

    const ethPrice = await getEthereumPriceUSD();
    if (!ethPrice) return c.json({ error: "Failed to fetch ETH price" }, 500);
    logInfo(`🧮 ETH price (cents): ${ethPrice}`);

    const path = getAvalanchePath('testnet');
    const mode = c.req.query("mode"); // "prepare" or default broadcast

    // Derive sender address via chainsig EVM using a reference provider
    const referenceProvider = new JsonRpcProvider(avalancheChainConfig.testnet.rpcUrl);
    const { chainAdapters, contracts } = await import('chainsig.js');
    const mpc = new contracts.ChainSignatureContract({ networkId: 'testnet', contractId: 'v1.signer-prod.testnet' });
    const evm = new chainAdapters.evm.EVM({ publicClient: undefined as any, contract: mpc }) as any;
    const { address: senderAddress } = await evm.deriveAddressAndPublicKey(contractId, path);

    // Build call data
    const contract = new Contract(
      avalancheChainConfig.testnet.contractAddress,
      avalancheContractAbi,
      referenceProvider,
    );
    const data = contract.interface.encodeFunctionData("updatePrice", [ethPrice]);

    let lastError: string | null = null;
    for (const rpc of avalancheFujiRpcUrls) {
      try {
        const provider = new ethers.JsonRpcProvider(rpc);
        // Get gasPrice and nonce via ethers
        const [feeData, nonce] = await Promise.all([
          provider.getFeeData(),
          provider.getTransactionCount(senderAddress, 'pending'),
        ]);
        const gasPrice = feeData.gasPrice ?? (await provider.getGasPrice());

        const unsignedTx = {
          to: avalancheChainConfig.testnet.contractAddress,
          value: 0n,
          data,
          gasLimit: 150000n,
          gasPrice: gasPrice as bigint,
          nonce: Number(nonce),
          chainId: avalancheChainConfig.testnet.chainId,
          type: 0 as const,
        };

        const tx = ethers.Transaction.from(unsignedTx);
        const hashToSign = ethers.getBytes(tx.unsignedHash);

        const signRes = await requestSignature({ path, payload: uint8ArrayToHex(hashToSign) });
        if ('error' in signRes) throw new Error(String(signRes.error));

        const rsvSig = toRSV(signRes);
        tx.signature = { r: '0x' + rsvSig.r, s: '0x' + rsvSig.s, v: rsvSig.v };
        const serialized = tx.serialized;

        if (mode === 'prepare') {
          // Return serialized tx without broadcasting
          return c.json({
            mode: 'prepare',
            serializedTransaction: serialized,
            rpc,
            from: senderAddress,
            to: avalancheChainConfig.testnet.contractAddress,
            gasPrice: String(gasPrice),
            gasLimit: String(unsignedTx.gasLimit),
            nonce: unsignedTx.nonce,
            chainId: unsignedTx.chainId,
            newPrice: (ethPrice / 100).toFixed(2),
          });
        }

        const rcpt = await provider.broadcastTransaction(serialized);
        const txHash = rcpt.hash;
        logInfo(`📡 Broadcasted Avalanche tx via ${rpc}: ${txHash}`);
        return c.json({ txHash, newPrice: (ethPrice / 100).toFixed(2) });
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        logError(`❌ Avalanche tx via ${rpc} failed: ${lastError}`);
        continue;
      }
    }

    return c.json({ error: "Failed to send Avalanche transaction", details: lastError }, 500);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError(`Failed to send Avalanche transaction: ${message}`);
    return c.json({ error: "Failed to send Avalanche transaction", details: message }, 500);
  }
});

export default app;