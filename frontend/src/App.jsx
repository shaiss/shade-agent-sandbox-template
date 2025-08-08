import { useState, useEffect } from "react";
import "../styles/globals.css";
import { getContractPrice, getAllContractPrices, getLastUpdateInfo, getTimestampFromTxHash, formatBalance } from "./ethereum";
import Overlay from "./Overlay";
import { API_URL } from "./config";
import MultiChainDemo from "./MultiChainDemo";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function withinTolerance(a, b, pct = 0.5) {
  if (a == null || b == null) return false;
  const da = Math.abs(Number(a) - Number(b));
  return (da / Number(b)) * 100 <= pct;
}

export default function Home() {
  const [message, setMessage] = useState("");
  const [agentAddress, setAgentAddress] = useState();
  const [agentBalance, setAgentBalance] = useState("0");
  const [ethereumAddress, setEthereumAddress] = useState("");
  const [ethereumBalance, setEthereumBalance] = useState("0");
  const [iotexAddress, setIotexAddress] = useState("");
  const [iotexBalance, setIotexBalance] = useState("0");
  const [contractPrice, setContractPrice] = useState(null);
  const [perChainPrices, setPerChainPrices] = useState({ sepolia: null, iotex: null });
  const [marketPrice, setMarketPrice] = useState(null);
  const [marketUpdatedAt, setMarketUpdatedAt] = useState(null);
  const [marketRefreshIn, setMarketRefreshIn] = useState(30);
  const [lastUpdateInfo, setLastUpdateInfo] = useState({ sepolia: null, iotex: null });
  const [error, setError] = useState("");
  const [isSigning, setIsSigning] = useState({ ethereum: false, iotex: false });

  const setMessageHide = async (message, dur = 3000, success = false) => {
    setMessage({ text: message, success });
    await sleep(dur);
    setMessage("");
  };

  const getMarketPrice = async () => {
    try {
      const res = await fetch(`${API_URL}/api/price`).then(r => r.json());
      if (res?.priceUSD) {
        setMarketPrice(res.priceUSD);
        setMarketUpdatedAt(res.fetchedAt || new Date().toISOString());
      }
    } catch (e) {}
  };

  const refreshOnchain = async () => {
    const all = await getAllContractPrices();
    const mapped = {
      sepolia: all.sepolia != null ? (all.sepolia / 100).toFixed(2) : null,
      iotex: all.iotex != null ? (all.iotex / 100).toFixed(2) : null,
    };
    setPerChainPrices(mapped);
    const [ethInfo, iotexInfo] = await Promise.all([
      getLastUpdateInfo('sepolia'),
      getLastUpdateInfo('iotex')
    ]);

    const lastLocalEth = (() => { try { return JSON.parse(localStorage.getItem('lastTx.ethereum') || 'null'); } catch { return null; }})();
    const lastLocalIotex = (() => { try { return JSON.parse(localStorage.getItem('lastTx.iotex') || 'null'); } catch { return null; }})();

    const [ethTs, iotexTs] = await Promise.all([
      (!ethInfo && lastLocalEth?.txHash) ? getTimestampFromTxHash('sepolia', lastLocalEth.txHash) : null,
      (!iotexInfo && lastLocalIotex?.txHash) ? getTimestampFromTxHash('iotex', lastLocalIotex.txHash) : null,
    ]);

    const finalEth = ethInfo || (lastLocalEth?.txHash && ethTs ? { txHash: lastLocalEth.txHash, timestamp: ethTs } : null);
    const finalIotex = iotexInfo || (lastLocalIotex?.txHash && iotexTs ? { txHash: lastLocalIotex.txHash, timestamp: iotexTs } : null);

    setLastUpdateInfo({ sepolia: finalEth, iotex: finalIotex });
  };

  const getPrice = async () => {
    try {
      let price = await getContractPrice('sepolia');
      if (price === null || price === 0 || price === "0") {
        price = await getContractPrice('iotex');
      }
      if (price === null || price === 0 || price === "0") {
        setContractPrice(null);
      } else {
        const displayPrice = (parseInt(price.toString()) / 100).toFixed(2);
        setContractPrice(displayPrice);
      }
      await refreshOnchain();
    } catch (error) {
      setContractPrice(null);
    }
  };

  const getAgentAccount = async () => {
    try {
      const res = await fetch(`${API_URL}/api/agent-account`).then((r) => r.json());
      setAgentAddress(res.accountId);
      setAgentBalance(formatBalance(res.balance, 24));
    } catch (error) { setError("Failed to get agent account details"); }
  };

  const getNetworkAccounts = async () => {
    try {
      const ethRes = await fetch(`${API_URL}/api/eth-account`).then((r) => r.json());
      setEthereumAddress(ethRes.senderAddress);
      setEthereumBalance(formatBalance(ethRes.balance, 18));
      const iotexRes = await fetch(`${API_URL}/api/iotex-account`).then((r) => r.json());
      setIotexAddress(iotexRes.senderAddress);
      setIotexBalance(formatBalance(iotexRes.balance, 18));
    } catch (error) { setError("Failed to fetch network account details"); }
  };

  const handleSingleChainSuccess = async (data) => {
    await Promise.all([getMarketPrice(), refreshOnchain()]);
    const chainName = data.chain === 'ethereum' ? 'Ethereum Sepolia' : 'IoTeX Testnet';
    const successMsg = `✅ ${chainName} transaction successful!\n💰 New price: $${data.newPrice}\n🔗 Hash: ${data.txHash?.substring(0, 10)}...`;
    setMessageHide(successMsg, 3000, true);
  };

  const pollForOnchainUpdate = async (chain, expectedPriceDisplay) => {
    const networkId = chain === 'ethereum' ? 'sepolia' : 'iotex';
    const expectedFixed = expectedPriceDisplay != null ? Number(expectedPriceDisplay).toFixed(2) : null;
    for (let i = 0; i < 15; i++) { // ~22.5s total with 1.5s delay
      try {
        // Refresh just the targeted chain first to minimize RPC load
        const info = await getLastUpdateInfo(networkId);
        setLastUpdateInfo((prev) => ({ ...prev, [networkId]: info }));
        if (info?.price != null) {
          setPerChainPrices((prev) => ({ ...prev, [networkId]: (info.price / 100).toFixed(2) }));
        }
        if (!expectedFixed || (info?.price != null && (info.price / 100).toFixed(2) === expectedFixed)) break;
      } catch (e) {}
      await sleep(1500);
    }
  };

  const signOnChain = async (chain) => {
    setIsSigning((prev) => ({ ...prev, [chain]: true }));
    try {
      const endpoint = chain === 'ethereum' ? `${API_URL}/api/transaction` : `${API_URL}/api/iotex-transaction`;
      const response = await fetch(endpoint);
      const data = await response.json();
      if (response.ok && !data.error) {
        // Persist last tx for fallback resolution
        try {
          localStorage.setItem(`lastTx.${chain}`, JSON.stringify({ txHash: data.txHash, at: new Date().toISOString() }));
        } catch {}

        // Optimistically resolve timestamp directly from tx
        try {
          const networkId = chain === 'ethereum' ? 'sepolia' : 'iotex';
          if (data.txHash) {
            const ts = await getTimestampFromTxHash(networkId, data.txHash);
            if (ts) {
              setLastUpdateInfo((prev) => ({
                ...prev,
                [networkId]: {
                  txHash: data.txHash,
                  timestamp: ts,
                  blockNumber: null,
                  price: null,
                },
              }));
            }
          }
        } catch {}

        // Start polling for on-chain confirmation to reflect updated price/timestamp
        pollForOnchainUpdate(chain, data.newPrice);
        await handleSingleChainSuccess({ chain, ...data, totalTime: 0 });
      } else {
        setMessageHide(data.error || 'Transaction failed', 3000, false);
      }
    } catch (e) {
      setMessageHide(e?.message || 'Network error', 3000, false);
    } finally {
      setIsSigning((prev) => ({ ...prev, [chain]: false }));
    }
  };

  useEffect(() => {
    getAgentAccount();
    getNetworkAccounts();
    getMarketPrice();
    getPrice();
    // Auto-refresh market price every 30 seconds with countdown
    const countdown = setInterval(() => {
      setMarketRefreshIn((prev) => {
        if (prev <= 1) {
          // fetch latest market price and reset countdown
          getMarketPrice();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(countdown);
  }, []);

  const lastLocalEth = (() => { try { return JSON.parse(localStorage.getItem('lastTx.ethereum') || 'null'); } catch { return null; }})();
  const lastLocalIotex = (() => { try { return JSON.parse(localStorage.getItem('lastTx.iotex') || 'null'); } catch { return null; }})();

  return (
    <div className="container">
      <div>
        <title>ETH Price Oracle</title>
      </div>
      <Overlay message={message} />

      <main className="main">
        <h1 className="title">ETH Price Oracle</h1>
        <div className="subtitleContainer">
          <h2 className="subtitle">Powered by Shade Agents</h2>
        </div>

        <div className="grid" style={{gridTemplateColumns:'repeat(3, minmax(260px, 1fr))'}}>
          <div className="card">
            <h3>📈 Market Price (Avg)</h3>
            <p style={{fontSize:'2rem', margin:0}}>{marketPrice ? `$${marketPrice}` : '—'}</p>
            <p style={{opacity:.8, marginTop:8}}>Source: OKX + Coinbase</p>
            {marketUpdatedAt && <p style={{color:'var(--text-secondary)', fontSize:'0.85rem', marginTop:8}}>Last updated: {new Date(marketUpdatedAt).toLocaleTimeString()}</p>}
            <p className="refresh-row"><span className="spin" aria-hidden>↻</span> Auto-refresh in {marketRefreshIn}s</p>
          </div>

          <div className="card card-with-action">
            <h3>🧾 Contract Price — Ethereum (Sepolia)</h3>
            <div className="card-body-with-action">
              <div className="card-left">
                <p style={{fontSize:'2rem', margin:0}}>{perChainPrices.sepolia ? `$${perChainPrices.sepolia}` : '—'}</p>
                <p style={{opacity:.8, marginTop:8}}>Value stored on-chain</p>
                <p style={{color:'var(--text-secondary)', fontSize:'0.85rem', marginTop:8}}>
                  {lastUpdateInfo.sepolia?.timestamp ? (
                    <>
                      Last updated: {new Date(lastUpdateInfo.sepolia.timestamp).toLocaleTimeString()} · <a href={`https://sepolia.etherscan.io/tx/${lastUpdateInfo.sepolia.txHash}`} target="_blank" rel="noopener noreferrer">view tx</a>
                    </>
                  ) : lastLocalEth?.txHash ? (
                    <>
                      Last updated: resolving… · <a href={`https://sepolia.etherscan.io/tx/${lastLocalEth.txHash}`} target="_blank" rel="noopener noreferrer">view tx</a>
                    </>
                  ) : (
                    <>Last updated: —</>
                  )}
                </p>
              </div>
              <button
                className={`action-btn big ${isSigning.ethereum ? 'loading' : ''}`}
                onClick={() => signOnChain('ethereum')}
                disabled={isSigning.ethereum}
                title="Sign and update price on Ethereum"
              >
                {isSigning.ethereum ? <span className="spin" aria-hidden>↻</span> : '🔑'}
              </button>
            </div>
          </div>

          <div className="card card-with-action">
            <h3>🧾 Contract Price — IoTeX (Testnet)</h3>
            <div className="card-body-with-action">
              <div className="card-left">
                <p style={{fontSize:'2rem', margin:0}}>{perChainPrices.iotex ? `$${perChainPrices.iotex}` : '—'}</p>
                <p style={{opacity:.8, marginTop:8}}>Value stored on-chain</p>
                <p style={{color:'var(--text-secondary)', fontSize:'0.85rem', marginTop:8}}>
                  {lastUpdateInfo.iotex?.timestamp ? (
                    <>
                      Last updated: {new Date(lastUpdateInfo.iotex.timestamp).toLocaleTimeString()} · <a href={`https://testnet.iotexscan.io/tx/${lastUpdateInfo.iotex.txHash}`} target="_blank" rel="noopener noreferrer">view tx</a>
                    </>
                  ) : lastLocalIotex?.txHash ? (
                    <>
                      Last updated: resolving… · <a href={`https://testnet.iotexscan.io/tx/${lastLocalIotex.txHash}`} target="_blank" rel="noopener noreferrer">view tx</a>
                    </>
                  ) : (
                    <>Last updated: —</>
                  )}
                </p>
              </div>
              <button
                className={`action-btn big ${isSigning.iotex ? 'loading' : ''}`}
                onClick={() => signOnChain('iotex')}
                disabled={isSigning.iotex}
                title="Sign and update price on IoTeX"
              >
                {isSigning.iotex ? <span className="spin" aria-hidden>↻</span> : '🔑'}
              </button>
            </div>
          </div>
        </div>

        {/* Funding cards */}
        <div className="grid">
          <div className="card">
            <h3>Fund Agent Account</h3>
            <p>
              <br />
              {agentAddress?.length >= 24
                ? `${agentAddress.substring(0, 10)}...${agentAddress.substring(agentAddress.length - 4)}`
                : agentAddress}
              <br />
              <button className="btn" onClick={() => { try { navigator.clipboard.writeText(agentAddress); setMessageHide("Copied", 500, true);} catch(e){} }}>copy</button>
              <br /><br />
              balance: {agentBalance || '0'}
              <br />
              <a href="https://near-faucet.io/" target="_blank" rel="noopener noreferrer" className="faucet-link">Get Testnet NEAR tokens from faucet →</a>
            </p>
          </div>

          <div className="card">
            <h3>Fund Ethereum (Sepolia) Account</h3>
            <div>
              <br />
              {ethereumAddress ? (
                <>
                  <p>
                    {ethereumAddress.substring(0, 10)}...{ethereumAddress.substring(ethereumAddress.length - 4)}
                    <br />
                    <button className="btn" onClick={() => { try { navigator.clipboard.writeText(ethereumAddress); setMessageHide("Copied", 500, true);} catch(e){} }}>copy</button>
                    <br /><br />
                    Balance: {ethereumBalance ? ethereumBalance : "0"} ETH
                    <br />
                    <a href="https://sepoliafaucet.com/" target="_blank" rel="noopener noreferrer" className="faucet-link">Get Sepolia ETH from faucet →</a>
                  </p>
                </>
              ) : (<p>Loading...</p>)}
            </div>
          </div>

          <div className="card">
            <h3>Fund IoTeX (Testnet) Account</h3>
            <div>
              <br />
              {iotexAddress ? (
                <>
                  <p>
                    {iotexAddress.substring(0, 10)}...{iotexAddress.substring(iotexAddress.length - 4)}
                    <br />
                    <button className="btn" onClick={() => { try { navigator.clipboard.writeText(iotexAddress); setMessageHide("Copied", 500, true);} catch(e){} }}>copy</button>
                    <br /><br />
                    Balance: {iotexBalance ? iotexBalance : "0"} IOTX
                    <br />
                    <a href="https://faucet.iotex.io/" target="_blank" rel="noopener noreferrer" className="faucet-link">Get IoTeX IOTX from faucet →</a>
                  </p>
                </>
              ) : (<p>Loading...</p>)}
            </div>
          </div>
        </div>

        {/* Multi-Chain Demo */}
        <div className="multi-chain-section">
          <h3>🚀 Multi-Chain Magic</h3>
          <p>Sign on both chains simultaneously with one click:</p>
          <MultiChainDemo 
            API_URL={API_URL} 
            onSuccess={(data) => {
              getMarketPrice();
              getPrice();
              getNetworkAccounts();
              setMessageHide(`🎉 Multi-chain update complete! Both chains updated in ${data.totalTime} seconds!`, 5000, true);
            }}
          />
        </div>

        {/* Single Chain Demo removed in favor of per-card actions */}

        {/* Docs text remains the same */}
        <p>This is a simple example of a Verifiable Price Oracle that demonstrates cross-chain transactions using Shade Agents.</p>
        <ol>
          <li>Keep the agent account funded with testnet NEAR tokens</li>
          <li>Fund the Ethereum (Sepolia) account (0.001 ETH will do)</li>
          <li>Fund the IoTeX (Testnet) account (0.001 IOTX will do)</li>
          <li>Send the ETH price to the contracts on either or both chains</li>
        </ol>

        {/* Removed lastTxDetails and transaction-details-box */}

      </main>

      <div className="terms-link-box"><a href="https://fringe-brow-647.notion.site/Terms-for-Price-Oracle-1fb09959836d807a9303edae0985d5f3" target="_blank" rel="noopener noreferrer" className="terms-link">Terms of Use</a></div>

      <footer className="footer">
        <a href="https://proximity.dev" target="_blank" rel="noopener noreferrer">
          <img src="/symbol.svg" alt="Proximity Logo" className="logo" />
          <img src="/wordmark_black.svg" alt="Proximity" className="wordmark" />
        </a>
      </footer>

      {error && <div className="error-toast">{error}</div>}
    </div>
  );
}
