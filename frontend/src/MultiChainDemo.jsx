import { useState, useEffect } from "react";
import "./MultiChainDemo.css";

export default function MultiChainDemo({ API_URL, onSuccess }) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [ethStatus, setEthStatus] = useState('idle');
  const [iotexStatus, setIotexStatus] = useState('idle');
  const [results, setResults] = useState(null);
  const [startTime, setStartTime] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [nonceIncrementEnabled, setNonceIncrementEnabled] = useState(true);
  const [showEducational, setShowEducational] = useState(false);

  // Check nonce increment status on mount
  useEffect(() => {
    fetchNonceStatus();
  }, []);

  const fetchNonceStatus = async () => {
    try {
      const response = await fetch(`${API_URL}/api/nonce-control/status`);
      const data = await response.json();
      setNonceIncrementEnabled(data.nonceIncrementEnabled);
    } catch (error) {
      console.error('Failed to fetch nonce status:', error);
    }
  };

  const toggleNonceIncrement = async () => {
    try {
      const response = await fetch(`${API_URL}/api/nonce-control/toggle`, { method: 'POST' });
      const data = await response.json();
      setNonceIncrementEnabled(data.nonceIncrementEnabled);
      setShowEducational(!data.nonceIncrementEnabled);
      
      // Reset demo state when toggling
      setResults(null);
      setEthStatus('idle');
      setIotexStatus('idle');
    } catch (error) {
      console.error('Failed to toggle nonce increment:', error);
    }
  };

  const executeMultiChain = async () => {
    setIsExecuting(true);
    setEthStatus('signing');
    setIotexStatus('signing');
    setResults(null);
    
    const start = Date.now();
    setStartTime(start);
    
    // Update elapsed time every 100ms
    const timer = setInterval(() => {
      setElapsedTime(((Date.now() - start) / 1000).toFixed(1));
    }, 100);

    try {
      // Execute both transactions in parallel
      // With nonce increment enabled, they'll work seamlessly
      const [ethResponse, iotexResponse] = await Promise.allSettled([
        fetch(`${API_URL}/api/transaction`).then(async r => {
          const data = await r.json();
          if (!r.ok) {
            return { error: data.error || 'Transaction failed', status: r.status };
          }
          return data;
        }),
        fetch(`${API_URL}/api/iotex-transaction`).then(async r => {
          const data = await r.json();
          if (!r.ok) {
            return { error: data.error || 'Transaction failed', status: r.status };
          }
          return data;
        })
      ]);

      clearInterval(timer);
      const finalTime = ((Date.now() - start) / 1000).toFixed(1);
      setElapsedTime(finalTime);

      // Update statuses based on results
      if (ethResponse.status === 'fulfilled' && !ethResponse.value.error) {
        setEthStatus('complete');
      } else {
        setEthStatus('error');
        console.log('Ethereum transaction failed:', ethResponse.value?.error || 'Unknown error');
      }

      if (iotexResponse.status === 'fulfilled' && !iotexResponse.value.error) {
        setIotexStatus('complete');
      } else {
        setIotexStatus('error');
        console.log('IoTeX transaction failed:', iotexResponse.value?.error || 'Unknown error');
      }

      const successCount = 
        (ethResponse.status === 'fulfilled' && !ethResponse.value.error ? 1 : 0) +
        (iotexResponse.status === 'fulfilled' && !iotexResponse.value.error ? 1 : 0);

      setResults({
        ethereum: ethResponse.status === 'fulfilled' ? ethResponse.value : null,
        iotex: iotexResponse.status === 'fulfilled' ? iotexResponse.value : null,
        totalTime: finalTime,
        successCount
      });

      if (onSuccess && successCount > 0) {
        onSuccess({
          multiChain: true,
          results,
          totalTime: finalTime
        });
      }

    } catch (error) {
      clearInterval(timer);
      console.error('Multi-chain execution failed:', error);
      setEthStatus('error');
      setIotexStatus('error');
    } finally {
      setIsExecuting(false);
    }
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'signing': return '🔏';
      case 'complete': return '✅';
      case 'error': return '❌';
      default: return '⏳';
    }
  };

  const getStatusText = (status) => {
    switch(status) {
      case 'signing': return 'Signing with MPC...';
      case 'complete': return 'Transaction confirmed!';
      case 'error': return 'Failed';
      default: return 'Ready';
    }
  };

  return (
    <div className="multi-chain-demo">
      <h2 className="multi-chain-title">🚀 Multi-Chain Magic Demo</h2>
      
      {/* Nonce Control Toggle */}
      <div className="nonce-control">
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={nonceIncrementEnabled}
            onChange={toggleNonceIncrement}
            className="toggle-input"
          />
          <span className="toggle-slider"></span>
          <span className="toggle-text">
            Nonce Auto-Increment: {nonceIncrementEnabled ? 'ENABLED' : 'DISABLED'}
          </span>
        </label>
        <div className="nonce-description">
          {nonceIncrementEnabled 
            ? "✅ Multiple chains will execute seamlessly in parallel"
            : "🔒 Demonstrating NEAR's replay attack protection"
          }
        </div>
      </div>

      {/* Educational Content when disabled */}
      {showEducational && !nonceIncrementEnabled && (
        <div className="educational-box">
          <h4>🎓 Learning Moment: NEAR's Security</h4>
          <p>
            With nonce increment disabled, you'll see how NEAR protects against replay attacks.
            The second transaction may fail with a nonce error - this is a security feature!
          </p>
          <p>
            <strong>Try it:</strong> Click the button and watch one transaction succeed while the other 
            shows a nonce conflict. This demonstrates NEAR's MPC bridge security.
          </p>
        </div>
      )}
      
      {/* Timer Display */}
      {isExecuting && (
        <div className="timer-display">
          <h3>⏱️ Elapsed Time: {elapsedTime}s</h3>
          <p className="timer-comparison">Traditional bridge would need 30-60 minutes...</p>
        </div>
      )}

      {/* Chain Status */}
      <div className="chains-container">
        <div className={`chain-status-box ${ethStatus}`}>
          <h3>Ethereum (Sepolia)</h3>
          <div className="status-icon">{getStatusIcon(ethStatus)}</div>
          <p className="status-text">{getStatusText(ethStatus)}</p>
          {results?.ethereum?.txHash ? (
            <div className="tx-details">
              <p className="tx-hash">{results.ethereum.txHash.substring(0, 10)}...</p>
              <button 
                className="copy-hash-btn"
                onClick={() => {
                  navigator.clipboard.writeText(results.ethereum.txHash);
                  alert('Full hash copied!');
                }}
                title="Copy full hash"
              >
                📋 Copy Full Hash
              </button>
              <a 
                href={`https://sepolia.etherscan.io/tx/${results.ethereum.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="tx-link"
              >
                🔍 View on Etherscan
              </a>
            </div>
          ) : ethStatus === 'error' && (
            <div className="tx-details">
              <p className="tx-error">❌ Transaction failed</p>
              <p className="tx-error-details">Check console for details</p>
            </div>
          )}
        </div>

        <div className={`chain-status-box ${iotexStatus}`}>
          <h3>IoTeX (Testnet)</h3>
          <div className="status-icon">{getStatusIcon(iotexStatus)}</div>
          <p className="status-text">{getStatusText(iotexStatus)}</p>
          {results?.iotex?.txHash ? (
            <div className="tx-details">
              <p className="tx-hash">{results.iotex.txHash.substring(0, 10)}...</p>
              <button 
                className="copy-hash-btn"
                onClick={() => {
                  navigator.clipboard.writeText(results.iotex.txHash);
                  alert('Full hash copied!');
                }}
                title="Copy full hash"
              >
                📋 Copy Full Hash
              </button>
              <a 
                href={`https://testnet.iotexscan.io/tx/${results.iotex.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="tx-link"
              >
                🔍 View on IoTeXScan
              </a>
            </div>
          ) : iotexStatus === 'error' && (
            <div className="tx-details">
              <p className="tx-error">❌ Transaction failed</p>
              <p className="tx-error-details">Check console for details</p>
            </div>
          )}
        </div>
      </div>

      {/* Execute Button */}
      <button
        className={`multi-chain-button ${isExecuting ? 'executing' : ''}`}
        onClick={executeMultiChain}
        disabled={isExecuting}
      >
        {isExecuting ? '🔄 Executing on Multiple Chains...' : '🚀 Update Price on BOTH Chains!'}
      </button>

      {/* Results Summary */}
      {results && (
        <div className="results-summary">
          <h3>🎉 Multi-Chain Update Complete!</h3>
          <div className="results-stats">
            <div className="stat">
              <span className="stat-label">Total Time:</span>
              <span className="stat-value">{results.totalTime}s</span>
            </div>
            <div className="stat">
              <span className="stat-label">Chains Updated:</span>
              <span className="stat-value">{results.successCount}/2</span>
            </div>
            <div className="stat">
              <span className="stat-label">vs Traditional Bridge:</span>
              <span className="stat-value highlight">600x faster!</span>
            </div>
          </div>
          
          {results.ethereum?.newPrice && (
            <p className="new-price">New ETH Price: ${results.ethereum.newPrice}</p>
          )}
        </div>
      )}
    </div>
  );
}
