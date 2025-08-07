import { useState, useEffect } from "react";
import "../styles/globals.css";
import { getContractPrice, formatBalance } from "./ethereum";
import Overlay from "./Overlay";
import { API_URL } from "./config";
import MultiChainDemo from "./MultiChainDemo";
import SingleChainDemo from "./SingleChainDemo";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function Home() {
  const [message, setMessage] = useState("");
  const [agentAddress, setAgentAddress] = useState();
  const [agentBalance, setAgentBalance] = useState("0");
  const [ethereumAddress, setEthereumAddress] = useState("");
  const [ethereumBalance, setEthereumBalance] = useState("0");
  const [iotexAddress, setIotexAddress] = useState("");
  const [iotexBalance, setIotexBalance] = useState("0");
  const [contractPrice, setContractPrice] = useState(null);
  const [lastTxHash, setLastTxHash] = useState(null);
  const [lastTxDetails, setLastTxDetails] = useState(null);
  const [error, setError] = useState("");

  const setMessageHide = async (message, dur = 3000, success = false) => {
    setMessage({ text: message, success });
    await sleep(dur);
    setMessage("");
  };

  // Get the current price from the value in the contract (check both chains)
  const getPrice = async () => {
    try {
      // Try Ethereum first, then IoTeX
      let price = await getContractPrice('sepolia');
      if (price === null || price === 0 || price === "0") {
        price = await getContractPrice('iotex');
      }
      
      if (price === null || price === 0 || price === "0") {
        setContractPrice(null);
        console.log("No price set yet in any contract");
      } else {
        const displayPrice = (parseInt(price.toString()) / 100).toFixed(2);
        setContractPrice(displayPrice);
      }
    } catch (error) {
      console.log("Error fetching contract price:", error);
      setContractPrice(null);
    }
  };

  // Call the API to get the agent account details
  const getAgentAccount = async () => {
    try {
      const res = await fetch(`${API_URL}/api/agent-account`).then((r) =>
        r.json(),
      );
      setAgentAddress(res.accountId);
      const formattedBalance = formatBalance(res.balance, 24);
      setAgentBalance(formattedBalance);
    } catch (error) {
      console.log("Error getting agent account:", error);
      setError("Failed to get agent account details");
    }
  };

  // Call the API to get both network account details
  const getNetworkAccounts = async () => {
    try {
      // Get Ethereum account
      const ethRes = await fetch(`${API_URL}/api/eth-account`).then((r) => r.json());
      setEthereumAddress(ethRes.senderAddress);
      const ethFormattedBalance = formatBalance(ethRes.balance, 18);
      setEthereumBalance(ethFormattedBalance);

      // Get IoTeX account
      const iotexRes = await fetch(`${API_URL}/api/iotex-account`).then((r) => r.json());
      setIotexAddress(iotexRes.senderAddress);
      const iotexFormattedBalance = formatBalance(iotexRes.balance, 18);
      setIotexBalance(iotexFormattedBalance);
    } catch (error) {
      console.log("Error fetching network account info:", error);
      setError("Failed to fetch network account details");
    }
  };

  // Handle single chain transaction success
  const handleSingleChainSuccess = (data) => {
    setContractPrice(data.newPrice);
    setLastTxHash(data.txHash);
    setLastTxDetails({
      ...data,
      network: data.chain,
      explorerUrl: data.chain === 'ethereum' 
        ? `https://sepolia.etherscan.io/tx/${data.txHash}`
        : `https://testnet.iotexscan.io/tx/${data.txHash}`,
      timestamp: new Date().toLocaleString()
    });
    
    const chainName = data.chain === 'ethereum' ? 'Ethereum Sepolia' : 'IoTeX Testnet';
    const successMsg = `✅ ${chainName} transaction successful!\n💰 New price: $${data.newPrice}\n🔗 Hash: ${data.txHash?.substring(0, 10)}...`;
    setMessageHide(successMsg, 5000, true);
  };

  // Set up the initial state
  useEffect(() => {
    getAgentAccount();
    getNetworkAccounts();
    getPrice();
  }, []);

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
        
        {/* Individual Chain Signing */}
        <div className="single-chain-section">
          <h3>🔐 Single Chain Signing</h3>
          <p>Demonstrate cross-chain signatures on individual chains:</p>
          
          <div className="single-chain-grid">
            <SingleChainDemo
              chainName="Ethereum (Sepolia)"
              chainId="ethereum"
              API_URL={API_URL}
              onSuccess={handleSingleChainSuccess}
            />
            <SingleChainDemo
              chainName="IoTeX (Testnet)"
              chainId="iotex"
              API_URL={API_URL}
              onSuccess={handleSingleChainSuccess}
            />
          </div>
        </div>

        {/* Multi-Chain Demo - The Star of the Show! */}
        <div className="multi-chain-section">
          <h3>🚀 Multi-Chain Magic</h3>
          <p>Sign on both chains simultaneously with one click:</p>
          <MultiChainDemo 
            API_URL={API_URL} 
            onSuccess={(data) => {
              // Update price displays for both networks
              getPrice();
              getNetworkAccounts();
              // Show celebration message
              setMessageHide(`🎉 Multi-chain update complete! Both chains updated in ${data.totalTime} seconds!`, 5000, true);
            }}
          />
        </div>

        <p>
          This is a simple example of a Verifiable Price Oracle that demonstrates cross-chain transactions 
          using Shade Agents. The oracle fetches the current ETH price from Coinbase and OKX, averages them, 
          and stores the result in smart contracts on multiple blockchains.
        </p>
        <ol>
          <li>Keep the agent account funded with testnet NEAR tokens</li>
          <li>Fund the Ethereum (Sepolia) account (0.001 ETH will do)</li>
          <li>Fund the IoTeX (Testnet) account (0.001 IOTX will do)</li>
          <li>Send the ETH price to the contracts on either or both chains</li>
        </ol>

        {/* Display the current price in the contract */}
        <div className="contract-price-box">
          <h3 className="contract-price-title">Current Set ETH Price</h3>
          {contractPrice !== null ? (
            <p className="contract-price-value">${contractPrice}</p>
          ) : (
            <p className="contract-price-placeholder">
              No price set yet in any contract
            </p>
          )}
        </div>

        {/* Display detailed transaction information */}
        {lastTxDetails && (
          <div className="transaction-details-box">
            <h3 className="transaction-details-title">✅ Last Transaction Details</h3>
            <div className="transaction-info">
              <div className="transaction-row">
                <span className="transaction-label">💰 Price Set:</span>
                <span className="transaction-value">${lastTxDetails.newPrice}</span>
              </div>
              <div className="transaction-row">
                <span className="transaction-label">🌐 Network:</span>
                <span className="transaction-value">
                  {lastTxDetails.network === 'ethereum' ? 'Ethereum (Sepolia)' : 
                   lastTxDetails.network === 'iotex' ? 'IoTeX (Testnet)' : 
                   lastTxDetails.network}
                </span>
              </div>
              <div className="transaction-row">
                <span className="transaction-label">🔗 Transaction:</span>
                <span className="transaction-value transaction-hash">{lastTxDetails.txHash}</span>
              </div>
              {lastTxDetails.blockNumber && (
                <div className="transaction-row">
                  <span className="transaction-label">📦 Block:</span>
                  <span className="transaction-value">#{lastTxDetails.blockNumber}</span>
                </div>
              )}
              <div className="transaction-row">
                <span className="transaction-label">⏰ Time:</span>
                <span className="transaction-value">{lastTxDetails.timestamp}</span>
              </div>
            </div>
            <div className="transaction-links">
              <a
                href={lastTxDetails.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="transaction-link"
              >
                🔍 View on {lastTxDetails.network === 'ethereum' ? 'Etherscan' : 'IoTeXScan'}
              </a>
              <button
                className="copy-hash-btn"
                onClick={() => {
                  try {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                      navigator.clipboard.writeText(lastTxDetails.txHash);
                      setMessageHide("Transaction hash copied!", 500, true);
                    } else {
                      setMessageHide("Clipboard not supported", 3000, true);
                    }
                  } catch (e) {
                    setMessageHide("Copy failed", 3000, true);
                  }
                }}
              >
                📋 Copy Hash
              </button>
            </div>
          </div>
        )}

        {/* Display the agent account details */}
        <div className="grid">
          <div className="card">
            <h3>Fund Agent Account</h3>
            <p>
              <br />
              {agentAddress?.length >= 24
                ? `${agentAddress.substring(0, 10)}...${agentAddress.substring(agentAddress.length - 4)}`
                : agentAddress}
              <br />
              <button
                className="btn"
                onClick={() => {
                  try {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                      navigator.clipboard.writeText(agentAddress);
                      setMessageHide("Copied", 500, true);
                    } else {
                      setMessageHide("Clipboard not supported", 3000, true);
                    }
                  } catch (e) {
                    setMessageHide("Copy failed", 3000, true);
                  }
                }}
              >
                copy
              </button>
              <br />
              <br />
              balance:{" "}
              {(() => {
                if (!agentBalance) {
                  return "0";
                }
                try {
                  return agentBalance;
                } catch (error) {
                  console.error("Error formatting balance:", error);
                  return "0";
                }
              })()}
              <br />
              <a
                href="https://near-faucet.io/"
                target="_blank"
                rel="noopener noreferrer"
                className="faucet-link"
              >
                Get Testnet NEAR tokens from faucet →
              </a>
            </p>
          </div>

          {/* Display the Ethereum account details */}
          <div className="card">
            <h3>Fund Ethereum (Sepolia) Account</h3>
            <div>
              <br />
              {ethereumAddress ? (
                <>
                  <p>
                    {ethereumAddress.substring(0, 10)}...
                    {ethereumAddress.substring(ethereumAddress.length - 4)}
                    <br />
                    <button
                      className="btn"
                      onClick={() => {
                        try {
                          if (
                            navigator.clipboard &&
                            navigator.clipboard.writeText
                          ) {
                            navigator.clipboard.writeText(ethereumAddress);
                            setMessageHide("Copied", 500, true);
                          } else {
                            setMessageHide("Clipboard not supported", 3000, true);
                          }
                        } catch (e) {
                          setMessageHide("Copy failed", 3000, true);
                        }
                      }}
                    >
                      copy
                    </button>
                    <br />
                    <br />
                    Balance: {ethereumBalance ? ethereumBalance : "0"} ETH
                    <br />
                    <a
                      href="https://sepoliafaucet.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="faucet-link"
                    >
                      Get Sepolia ETH from faucet →
                    </a>
                  </p>
                </>
              ) : (
                <p>Loading...</p>
              )}
            </div>
          </div>

          {/* Display the IoTeX account details */}
          <div className="card">
            <h3>Fund IoTeX (Testnet) Account</h3>
            <div>
              <br />
              {iotexAddress ? (
                <>
                  <p>
                    {iotexAddress.substring(0, 10)}...
                    {iotexAddress.substring(iotexAddress.length - 4)}
                    <br />
                    <button
                      className="btn"
                      onClick={() => {
                        try {
                          if (
                            navigator.clipboard &&
                            navigator.clipboard.writeText
                          ) {
                            navigator.clipboard.writeText(iotexAddress);
                            setMessageHide("Copied", 500, true);
                          } else {
                            setMessageHide("Clipboard not supported", 3000, true);
                          }
                        } catch (e) {
                          setMessageHide("Copy failed", 3000, true);
                        }
                      }}
                    >
                      copy
                    </button>
                    <br />
                    <br />
                    Balance: {iotexBalance ? iotexBalance : "0"} IOTX
                    <br />
                    <a
                      href="https://faucet.iotex.io/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="faucet-link"
                    >
                      Get IoTeX IOTX from faucet →
                    </a>
                  </p>
                </>
              ) : (
                <p>Loading...</p>
              )}
            </div>
          </div>


        </div>
      </main>

      {/* Display the terms of use link */}
      <div className="terms-link-box">
        <a
          href="https://fringe-brow-647.notion.site/Terms-for-Price-Oracle-1fb09959836d807a9303edae0985d5f3"
          target="_blank"
          rel="noopener noreferrer"
          className="terms-link"
        >
          Terms of Use
        </a>
      </div>

      {/* Display the footer */}
      <footer className="footer">
        <a
          href="https://proximity.dev"
          target="_blank"
          rel="noopener noreferrer"
        >
          <img src="/symbol.svg" alt="Proximity Logo" className="logo" />
          <img
            src="/wordmark_black.svg"
            alt="Proximity Logo"
            className="wordmark"
          />
        </a>
      </footer>

      {/* Display the error message */}
      {error && <div className="error-toast">{error}</div>}
    </div>
  );
}
