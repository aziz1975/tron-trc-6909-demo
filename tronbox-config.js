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
    development: {
      // Public TRE development key. Use only on the local, disposable chain.
      privateKey: '0000000000000000000000000000000000000000000000000000000000000001',
      fullHost: 'http://127.0.0.1:9090',
      network_id: '9',
      userFeePercentage: 100,
      feeLimit: 1_000 * 1_000_000, // SUN; 1 TRX = 1,000,000 SUN.
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
