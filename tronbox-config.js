const { existsSync } = require('node:fs');
const { join } = require('node:path');

const envPath = join(__dirname, '.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);

module.exports = {
  networks: {
    nile: {
      privateKey: process.env.PRIVATE_KEY_NILE,
      fullHost: 'https://nile.trongrid.io',
      network_id: '3',
      userFeePercentage: 100,
      feeLimit: 1_000 * 1_000_000,
    },
  },
  compilers: {
    solc: {
      version: '0.8.25', // TronBox downloads the TRON Solidity compiler.
      settings: {
        optimizer: { enabled: true, runs: 200 },
        evmVersion: 'istanbul',
      },
    },
  },
};
