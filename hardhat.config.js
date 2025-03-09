require("@nomicfoundation/hardhat-toolbox");
require('dotenv').config();

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1  // Reduzido para dificultar verificação
      },
      metadata: {
        bytecodeHash: "none"  // Remove metadados do bytecode
      },
      viaIR: true  // Usa compilação intermediária
    }
  },
  networks: {
    bsc: {
      url: process.env.BSC_MAINNET_URL,
      chainId: 56,
      accounts: [process.env.OWNER_PRIVATE_KEY],
      gasLimit: parseInt(process.env.GAS_LIMIT),
      gasPrice: parseInt(process.env.GAS_PRICE) * 1000000000,
      verify: false // Desabilita verificação automática
    },
    bscTestnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545/",
      chainId: 97,
      accounts: [process.env.OWNER_PRIVATE_KEY],
      gasLimit: parseInt(process.env.GAS_LIMIT),
      gasPrice: parseInt(process.env.GAS_PRICE) * 1000000000,
      verify: false
    }
  },
  etherscan: {
    apiKey: {
      bsc: process.env.BSCSCAN_API_KEY,
      bscTestnet: process.env.BSCSCAN_API_KEY
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};