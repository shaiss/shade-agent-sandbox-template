import { useState } from "react";
import "./MultiChainDemo.css";

export default function SingleChainDemo({ chainName, chainId, API_URL, onSuccess }) {
  const [status, setStatus] = useState("idle"); // idle | signing | complete | error
  const [txHash, setTxHash] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const getStatusIcon = (current) => {
    switch (current) {
      case "signing":
        return "🔏";
      case "complete":
        return "✅";
      case "error":
        return "❌";
      default:
        return "⏳";
    }
  };

  const getStatusText = (current) => {
    switch (current) {
      case "signing":
        return "Signing with MPC...";
      case "complete":
        return "Transaction confirmed!";
      case "error":
        return "Failed";
      default:
        return "Ready";
    }
  };

  const getExplorerUrl = (hash) => {
    if (chainId === "ethereum") {
      return `https://sepolia.etherscan.io/tx/${hash}`;
    } else if (chainId === "iotex") {
      return `https://testnet.iotexscan.io/tx/${hash}`;
    }
    return "#";
  };

  const getExplorerName = () => {
    if (chainId === "ethereum") return "Etherscan";
    if (chainId === "iotex") return "IoTeXScan";
    return "Explorer";
  };

  const handleSign = async () => {
    setIsLoading(true);
    setStatus("signing");
    setError(null);
    setTxHash(null);

    try {
      const endpoint = chainId === "ethereum"
        ? `${API_URL}/api/transaction`
        : `${API_URL}/api/iotex-transaction`;

      const response = await fetch(endpoint);
      const data = await response.json();

      if (response.ok && !data.error) {
        setTxHash(data.txHash);
        setStatus("complete");
        // Persist last tx to local storage for deterministic UI
        if (data.txHash) {
          localStorage.setItem(`lastTx.${chainId}`, JSON.stringify({ txHash: data.txHash, at: new Date().toISOString() }));
        }
        if (onSuccess) {
          onSuccess({
            chain: chainId,
            txHash: data.txHash,
            newPrice: data.newPrice,
            totalTime: 0,
          });
        }
      } else {
        setError(data.error || "Transaction failed");
        setStatus("error");
        console.log(`${chainName} transaction failed:`, data.error || "Unknown error");
      }
    } catch (err) {
      setError(err.message || "Network error");
      setStatus("error");
      console.log(`${chainName} transaction failed:`, err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`chain-status-box ${status}`}>
      <h3>{chainName}</h3>
      <div className="status-icon">{getStatusIcon(status)}</div>
      <p className="status-text">{getStatusText(status)}</p>

      {txHash ? (
        <div className="tx-details">
          <p className="tx-hash">{txHash.substring(0, 10)}...</p>
          <button
            className="copy-hash-btn"
            onClick={() => {
              navigator.clipboard.writeText(txHash);
              alert("Full hash copied!");
            }}
            title="Copy full hash"
          >
            📋 Copy Full Hash
          </button>
          <a
            href={getExplorerUrl(txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="tx-link"
          >
            🔍 View on {getExplorerName()}
          </a>
        </div>
      ) : status === "error" && (
        <div className="tx-details">
          <p className="tx-error">❌ Transaction failed</p>
          <p className="tx-error-details">{error || "Check console for details"}</p>
        </div>
      )}

      <button
        className={`single-chain-button ${isLoading ? "executing" : ""}`}
        onClick={handleSign}
        disabled={isLoading}
      >
        {isLoading ? "🔄 Signing..." : `🔐 Sign on ${chainName}`}
      </button>
    </div>
  );
}
