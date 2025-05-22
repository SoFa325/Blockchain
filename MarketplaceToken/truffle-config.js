/**
 * MNEMONIC = <Your 12 phrase mnemonic>
 * PROJECT_ID = <Your Infura project id>
 */

// require('dotenv').config();
// const { MNEMONIC, PROJECT_ID } = process.env;

// const HDWalletProvider = require('@truffle/hdwallet-provider');

module.exports = {
  networks: {
    development: {
      host: "127.0.0.1", // Локальный хост
      port: 7545,       // Порт Ganache
      network_id: "*"   // Любая сеть
    }
  },
  compilers: {
    solc: {
      version: "0.8.13" // Версия Solidity
    }
  },
  mocha: {
    // timeout: 100000
  }
};
