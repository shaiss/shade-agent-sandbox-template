import { useState, useEffect } from "react";
import "../styles/globals.css";
import { getContractPrice, formatBalance } from "./ethereum";
import Overlay from "./Overlay";
import { API_URL } from "./config";
import { NETWORKS, DEFAULT_NETWORK } from "./networks";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function Home() {
  const [message, setMessage] = useState("");
  const [selectedNetwork, setSelectedNetwork] = useState(DEFAULT_NETWORK);
  const [agentAddress, setAgentAddress] = useState();
  const [agentBalance, setAgentBalance] = useState("0");
  const [networkAddress, setNetworkAddress] = useState("");
  const [networkBalance, setNetworkBalance] = useState("0");
  const [contractPrice, setContractPrice] = useState(null);
  const [lastTxHash, setLastTxHash] = useState(null);
  const [lastTxDetails, setLastTxDetails] = useState(null);
  const [error, setError] = useState("");

  const setMessageHide = async (message, dur = 3000, success = false) => {
    setMessage({ text: message, success });
    await sleep(dur);
    setMessage("");
  };

  // Get the current price from the value in the contract
  const getPrice = async () => {
    try {
      const price = await getContractPrice(selectedNetwork);
      if (price === null || price === 0 || price === "0") {
        setContractPrice(null);
        console.log(`No price set yet in ${selectedNetwork} contract`);
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

  // Call the API to get the network account details
  const getNetworkAccount = async () => {
    try {
      const network = NETWORKS[selectedNetwork];
      const res = await fetch(`${API_URL}${network.apiEndpoints.account}`).then((r) =>
        r.json(),
      );
      setNetworkAddress(res.senderAddress);
      const decimals = selectedNetwork === 'iotex' ? 18 : 18; // Both use 18 decimals
      const formattedBalance = formatBalance(res.balance, decimals);
      setNetworkBalance(formattedBalance);
    } catch (error) {
      console.log("Error fetching network account info:", error);
      setError("Failed to fetch network account details");
    }
  };

  // Call the API to set the price in the contract
  const setPrice = async () => {
    try {
      const network = NETWORKS[selectedNetwork];
      const res = await fetch(`${API_URL}${network.apiEndpoints.transaction}`).then((r) =>
        r.json(),
      );
      
      if (res.error) {
        throw new Error(res.error);
      }
      
      setContractPrice(res.newPrice);
      setLastTxHash(res.txHash);
      setLastTxDetails({
        ...res,
        network: selectedNetwork,
        explorerUrl: `${NETWORKS[selectedNetwork].explorerUrl}/tx/${res.txHash}`,
        timestamp: new Date().toLocaleString()
      });
      
      const successMsg = `✅ Transaction successful!\n💰 New price: $${res.newPrice}\n🔗 Hash: ${res.txHash?.substring(0, 10)}...`;
      setMessageHide(successMsg, 5000, true);
    } catch (error) {
      setMessageHide(
        "Failed to set price. Check that both accounts are funded.",
        3000,
        false,
      );
      console.log("Error setting price:", error);
      setError("Failed to set price: " + (error.message || "Unknown error"));
    }
  };

  // Set up the initial state
  useEffect(() => {
    getAgentAccount();
    getNetworkAccount();
    getPrice();
  }, [selectedNetwork]);

  // Network change handler
  const handleNetworkChange = (networkId) => {
    setSelectedNetwork(networkId);
    setContractPrice(null);
    setLastTxHash(null);
    setLastTxDetails(null);
    setError("");
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
        
        {/* Network Selector */}
        <div className="network-selector">
          <label htmlFor="network-select">Select Network: </label>
          <select 
            id="network-select"
            value={selectedNetwork} 
            onChange={(e) => handleNetworkChange(e.target.value)}
            className="network-dropdown"
          >
            {Object.entries(NETWORKS).map(([id, network]) => (
              <option key={id} value={id}>{network.name}</option>
            ))}
          </select>
        </div>

        <p>
          This is a simple example of a Verifiable Price Oracle for {NETWORKS[selectedNetwork].name} 
          smart contracts using Shade Agents.
        </p>
        <ol>
          <li>Keep the agent account funded with testnet NEAR tokens</li>
          <li>Fund the {NETWORKS[selectedNetwork].name} account (0.001 {NETWORKS[selectedNetwork].currency} will do)</li>
          <li>Send the ETH price to the {NETWORKS[selectedNetwork].name} contract</li>
        </ol>

        {/* Display the current price in the contract */}
        <div className="contract-price-box">
          <h3 className="contract-price-title">Current Set ETH Price</h3>
          {contractPrice !== null ? (
            <p className="contract-price-value">${contractPrice}</p>
          ) : (
            <p className="contract-price-placeholder">
              {selectedNetwork === 'iotex' ? 
                'No price set yet in IoTeX contract' : 
                'No price set yet in Sepolia contract'
              }
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
                <span className="transaction-value">{NETWORKS[lastTxDetails.network].name}</span>
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
                🔍 View on {selectedNetwork === 'sepolia' ? 'Etherscan' : 'IoTeXScan'}
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

          {/* Display the network account details */}
          <div className="card">
            <h3>Fund {NETWORKS[selectedNetwork].name} Account</h3>
            <div>
              <br />
              {networkAddress ? (
                <>
                  <p>
                    {networkAddress.substring(0, 10)}...
                    {networkAddress.substring(networkAddress.length - 4)}
                    <br />
                    <button
                      className="btn"
                      onClick={() => {
                        try {
                          if (
                            navigator.clipboard &&
                            navigator.clipboard.writeText
                          ) {
                            navigator.clipboard.writeText(networkAddress);
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
                    Balance: {networkBalance ? networkBalance : "0"} {NETWORKS[selectedNetwork].currency}
                    <br />
                    <a
                      href={NETWORKS[selectedNetwork].faucetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="faucet-link"
                    >
                      Get {NETWORKS[selectedNetwork].name} {NETWORKS[selectedNetwork].currency} from faucet →
                    </a>
                  </p>
                </>
              ) : (
                <p>Loading...</p>
              )}
            </div>
          </div>

          {/* Display the button to set the price in the contract */}
          <a
            href="#"
            className="card"
            onClick={async () => {
              setMessage({
                text: `Querying and sending the ETH price to the ${NETWORKS[selectedNetwork].name} contract...`,
                success: false,
              });
              await setPrice();
            }}
          >
            <h3>Set ETH Price</h3>
            <p className="code">
              Click to set the ETH price in the {NETWORKS[selectedNetwork].name} smart contract
            </p>
          </a>
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
