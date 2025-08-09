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

    // Derive sender address via chainsig EVM
    const { createPublicClient, http } = await import("viem");
    const deriveClient = createPublicClient({ transport: http(avalancheChainConfig.testnet.rpcUrl) });
    const { chainAdapters, contracts } = await import('chainsig.js');
    const mpc = new contracts.ChainSignatureContract({ networkId: 'testnet', contractId: 'v1.signer-prod.testnet' });
    const evm = new chainAdapters.evm.EVM({ publicClient: deriveClient, contract: mpc }) as any;
    const { address: senderAddress } = await evm.deriveAddressAndPublicKey(contractId, path);

    // Build call data
    const referenceProvider = new JsonRpcProvider(avalancheChainConfig.testnet.rpcUrl);
    const contract = new Contract(
      avalancheChainConfig.testnet.contractAddress,
      avalancheContractAbi,
      referenceProvider,
    );
    const data = contract.interface.encodeFunctionData("updatePrice", [ethPrice]);

    let lastError: string | null = null;
    for (const rpc of avalancheFujiRpcUrls) {
      try {
        const pc = createPublicClient({ transport: http(rpc) });
        const [gasPrice, nonce] = await Promise.all([
          pc.getGasPrice(),
          pc.getTransactionCount({ address: senderAddress as `0x${string}`, blockTag: 'pending' }),
        ]);

        const unsignedTx = {
          to: avalancheChainConfig.testnet.contractAddress,
          value: 0n,
          data,
          gasLimit: 150000n,
          gasPrice,
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

        const provider = new ethers.JsonRpcProvider(rpc);
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