// Network configurations for Sepolia and IoTeX
export const NETWORKS = {
  sepolia: {
    id: 'sepolia',
    name: 'Ethereum Sepolia',
    rpcUrl: 'https://sepolia.drpc.org',
    contractAddress: '0xb8d9b079F1604e9016137511464A1Fe97F8e2Bd8',
    chainId: 11155111,
    explorerUrl: 'https://sepolia.etherscan.io',
    faucetUrl: 'https://cloud.google.com/application/web3/faucet/ethereum/sepolia',
    currency: 'ETH',
    apiEndpoints: {
      account: '/api/eth-account',
      transaction: '/api/transaction'
    }
  },
  iotex: {
    id: 'iotex',
    name: 'IoTeX Testnet',
    rpcUrl: 'https://babel-api.testnet.iotex.io',
    contractAddress: '0xd0E0ea5F7542B12164Dc213d63bC149eC6cD68d5', // Deployed IoTeX contract with NEAR owner
    chainId: 4690,
    explorerUrl: 'https://testnet.iotexscan.io',
    faucetUrl: 'https://faucet.iotex.io/',
    currency: 'IOTX',
    apiEndpoints: {
      account: '/api/iotex-account',
      transaction: '/api/iotex-transaction'
    }
  },
  avalanche: {
    id: 'avalanche',
    name: 'Avalanche Fuji',
    rpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc',
    contractAddress: '0x0000000000000000000000000000000000000000',
    chainId: 43113,
    explorerUrl: 'https://testnet.snowtrace.io',
    faucetUrl: 'https://faucet.avax.network/',
    currency: 'AVAX',
    apiEndpoints: {
      account: '/api/avalanche-account',
      transaction: '/api/avalanche-transaction'
    }
  }
};

export const DEFAULT_NETWORK = 'sepolia';
