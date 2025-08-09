import { useState, useEffect } from "react";
import "../styles/globals.css";
import { getContractPrice, getAllContractPrices, getLastUpdateInfo, getTimestampFromTxHash, formatBalance } from "./ethereum";
import Overlay from "./Overlay";
import { API_URL } from "./config";

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
  const [selectedChains, setSelectedChains] = useState([]); // ['ethereum','iotex']
  const [isBatchExecuting, setIsBatchExecuting] = useState(false);
  const [nonceIncrementEnabled, setNonceIncrementEnabled] = useState(true);
  const [nerdLog, setNerdLog] = useState([]);
  const [nerdPanelOpen, setNerdPanelOpen] = useState(false);
  const [hidePriceLogs, setHidePriceLogs] = useState(true);

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

  // Nonce auto-increment status helpers
  const fetchNonceStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/api/nonce-control/status`).then(r => r.json());
      if (typeof res?.nonceIncrementEnabled === 'boolean') setNonceIncrementEnabled(res.nonceIncrementEnabled);
    } catch (e) {}
  };

  const toggleNonceIncrement = async () => {
    try {
      const res = await fetch(`${API_URL}/api/nonce-control/toggle`, { method: 'POST' }).then(r => r.json());
      const enabled = !!res?.nonceIncrementEnabled;
      setNonceIncrementEnabled(enabled);
      if (!enabled) {
        setMessageHide(
          "⚠️ Auto nonce increment disabled. With nonce increment disabled, you'll see how NEAR protects against replay attacks. The second transaction may fail with a nonce error - this is a security feature!\n\nTry it: Click the button and watch one transaction succeed while the other shows a nonce conflict. This demonstrates NEAR's MPC bridge security.",
          6000,
          false
        );
      }
    } catch (e) {}
  };

  const toggleChainSelected = (chain) => {
    setSelectedChains((prev) =>
      prev.includes(chain) ? prev.filter((c) => c !== chain) : [...prev, chain]
    );
  };

  const getNetworkAccounts = async () => {
    try {
      const ethRes = await fetch(`${API_URL}/api/eth-account`).then((r) => r.json());
      setEthereumAddress(ethRes.senderAddress);
      setEthereumBalance(formatBalance(ethRes.balance, 18));
      const iotexRes = await fetch(`${API_URL}/api/iotex-account`).then((r) => r.json());
      setIotexAddress(iotexRes.senderAddress);
      setIotexBalance(formatBalance(iotexRes.balance, 18));
      // Solana UI temporarily disabled
    } catch (error) { setError("Failed to fetch network account details"); }
  };

  const handleSingleChainSuccess = async (data) => {
    await Promise.all([getMarketPrice(), refreshOnchain()]);
    const chainName = data.chain === 'ethereum' ? 'Ethereum Sepolia' : 'IoTeX Testnet';
    const successMsg = `✅ ${chainName} transaction successful!\n💰 New price: $${data.newPrice}\n🔗 Hash: ${data.txHash?.substring(0, 10)}...`;
    setMessageHide(successMsg, 3000, true);
  };

  const pollForOnchainUpdate = async (chain, expectedPriceDisplay, txHash) => {
    const networkId = chain === 'ethereum' ? 'sepolia' : 'iotex';
    const expectedFixed = expectedPriceDisplay != null ? Number(expectedPriceDisplay).toFixed(2) : null;
    
    // First, wait a bit for the transaction to be mined
    await sleep(3000);
    
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 3;
    
    for (let i = 0; i < 30; i++) { // Increased to ~60s total with 2s delay
      try {
        // First try to get the transaction receipt to ensure it's mined
        if (txHash && i < 10) {
          const ts = await getTimestampFromTxHash(networkId, txHash);
          if (!ts) {
            // Transaction not mined yet, wait and continue
            await sleep(2000);
            continue;
          }
        }
        
        // Refresh just the targeted chain first to minimize RPC load
        const info = await getLastUpdateInfo(networkId);
        
        if (info?.price != null) {
          // Check if this is a newer update than what we have
          const currentInfo = lastUpdateInfo[networkId];
          const isNewer = !currentInfo || 
            (info.blockNumber > (currentInfo.blockNumber || 0)) ||
            (info.timestamp && currentInfo.timestamp && new Date(info.timestamp) > new Date(currentInfo.timestamp));
          
          if (isNewer) {
            setLastUpdateInfo((prev) => ({ ...prev, [networkId]: info }));
            setPerChainPrices((prev) => ({ ...prev, [networkId]: (info.price / 100).toFixed(2) }));
            
            // If we found the expected price, we're done
            if (!expectedFixed || (info.price / 100).toFixed(2) === expectedFixed) {
              console.log(`✅ Found on-chain update for ${chain}: $${(info.price / 100).toFixed(2)}`);
              break;
            }
          }
        }
        
        // Reset error counter on successful request
        consecutiveErrors = 0;
      } catch (e) {
        console.log(`Error polling ${chain}:`, e?.message || e);
        consecutiveErrors++;
        
        // If too many consecutive errors, wait longer before retrying
        if (consecutiveErrors >= maxConsecutiveErrors) {
          console.log(`Too many errors polling ${chain}, waiting 5s before retry...`);
          await sleep(5000);
          consecutiveErrors = 0;
        }
      }
      
      await sleep(2000);
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
        pollForOnchainUpdate(chain, data.newPrice, data.txHash);
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
    fetchNonceStatus();
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

  // Live backend log stream for "stats for nerds" panel
  useEffect(() => {
    try {
      const es = new EventSource(`${API_URL}/api/logs/stream`);
      es.addEventListener('log', (ev) => {
        try {
          const data = JSON.parse(ev.data);
          setNerdLog((prev) => [...prev.slice(-299), data]);
        } catch {}
      });
      return () => es.close();
    } catch (e) {}
  }, []);

  const lastLocalEth = (() => { try { return JSON.parse(localStorage.getItem('lastTx.ethereum') || 'null'); } catch { return null; }})();
  const lastLocalIotex = (() => { try { return JSON.parse(localStorage.getItem('lastTx.iotex') || 'null'); } catch { return null; }})();

  const updateSelectedChains = async () => {
    if (selectedChains.length < 2) return; // require at least 2 as per UX
    setIsBatchExecuting(true);
    // mark each selected chain as signing
    setIsSigning((prev) => selectedChains.reduce((acc, ch) => ({ ...acc, [ch]: true }), { ...prev }));
    try {
      const requests = selectedChains.map((ch) =>
        fetch(ch === 'ethereum' ? `${API_URL}/api/transaction` : `${API_URL}/api/iotex-transaction`).then(async (r) => {
          const data = await r.json();
          return r.ok && !data.error ? { chain: ch, data } : { chain: ch, error: data.error || 'Transaction failed' };
        })
      );
      const results = await Promise.allSettled(requests);
      let successCount = 0;
      for (const r of results) {
        if (r.status === 'fulfilled' && !r.value.error) {
          successCount += 1;
          const ch = r.value.chain;
          const d = r.value.data;
          try { localStorage.setItem(`lastTx.${ch}`, JSON.stringify({ txHash: d.txHash, at: new Date().toISOString() })); } catch {}
          pollForOnchainUpdate(ch, d.newPrice, d.txHash);
          await handleSingleChainSuccess({ chain: ch, ...d });
        } else if (r.status === 'fulfilled') {
          setMessageHide(`${r.value.chain} error: ${r.value.error}`, 2500, false);
        }
      }
      if (successCount > 0) {
        setMessageHide(`🎉 Updated ${successCount} chain(s)!`, 3000, true);
      }
    } catch (e) {
      setMessageHide(e?.message || 'Batch update failed', 3000, false);
    } finally {
      setIsBatchExecuting(false);
      setIsSigning((prev) => selectedChains.reduce((acc, ch) => ({ ...acc, [ch]: false }), { ...prev }));
      // keep selections so user can re-run
    }
  };

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

          <div className="card card-with-action selectable">
            <div className="card-header-row">
              <h3>🧾 Contract Price — Ethereum (Sepolia)</h3>
              <label className="select-checkbox" title="Select chain for batch update">
                <input
                  type="checkbox"
                  checked={selectedChains.includes('ethereum')}
                  onChange={() => toggleChainSelected('ethereum')}
                />
              </label>
            </div>
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

          <div className="card card-with-action selectable">
            <div className="card-header-row">
              <h3>🧾 Contract Price — IoTeX (Testnet)</h3>
              <label className="select-checkbox" title="Select chain for batch update">
                <input
                  type="checkbox"
                  checked={selectedChains.includes('iotex')}
                  onChange={() => toggleChainSelected('iotex')}
                />
              </label>
            </div>
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

        {/* Floating bulk action when selecting at least two chains */}
        {selectedChains.length >= 2 && (
          <div className="bulk-action-popup">
            <button
              className={`bulk-action-btn ${isBatchExecuting ? 'executing' : ''}`}
              onClick={updateSelectedChains}
              disabled={isBatchExecuting}
            >
              {isBatchExecuting ? '🔄 Updating selected chains…' : '🚀 Update selected chains'}
            </button>
            <div className="mini-toggle-row">
              <label className="mini-toggle">
                <input type="checkbox" checked={nonceIncrementEnabled} onChange={toggleNonceIncrement} />
                <span>Nonce auto-increment</span>
              </label>
            </div>
          </div>
        )}

        {/* Funding cards */}
        <div className="grid">
          <div className="card">
            <h3>Fund Agent Account</h3>
            <div>
              <br />
              {agentAddress ? (
                <p>
                  {agentAddress.length >= 24
                    ? `${agentAddress.substring(0, 10)}...${agentAddress.substring(agentAddress.length - 4)}`
                    : agentAddress}
                  <br />
                  <button
                    className="btn"
                    onClick={() => { try { navigator.clipboard.writeText(agentAddress); setMessageHide("Copied", 500, true);} catch(e){} }}
                  >
                    copy
                  </button>
                  <br /><br />
                  balance: {agentBalance || '0'}
                  <br />
                  <a href="https://near-faucet.io/" target="_blank" rel="noopener noreferrer" className="faucet-link">Get Testnet NEAR tokens from faucet →</a>
                </p>
              ) : (
                <p>Loading...</p>
              )}
            </div>
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

          {null}
        </div>

        {/* Multi-Chain demo removed in favor of per-card selection UI */}

        {/* Nerd panel toggle */}
        <div className="nerd-toggle-bar">
          <button className="btn" onClick={() => setNerdPanelOpen((v) => !v)}>
            {nerdPanelOpen ? 'Close stats for nerds' : '📊 Stats for nerds'}
          </button>
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

      {/* Right-hand stats for nerds panel */}
      <aside className={`nerd-panel ${nerdPanelOpen ? 'open' : ''}`}>
        <div className="nerd-panel-header">
          <span>📡 Stats for nerds</span>
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <label className="mini-toggle" title="Hide noisy price feed logs">
              <input type="checkbox" checked={hidePriceLogs} onChange={(e)=>setHidePriceLogs(e.target.checked)} />
              <span>Hide price updates</span>
            </label>
            <button className="btn" onClick={() => setNerdPanelOpen(false)}>close</button>
          </div>
        </div>
        <div className="nerd-log" role="log" aria-live="polite">
          {nerdLog
            .filter((row)=>{
              if (!hidePriceLogs) return true;
              const m = row?.message || '';
              return !(m.startsWith('Coinbase ETH Price') || m.startsWith('OKX ETH Price') || m.startsWith('Average ETH Price'));
            })
            .map((row, idx) => (
            <div key={idx} className={`nerd-line ${row.level || 'info'}`}>
              <span className="nerd-ts">{new Date(row.ts).toLocaleTimeString()}</span>
              <span className="nerd-msg">{row.message}</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
