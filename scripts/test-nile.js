const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const { computeAddress } = require('ethers');
const { networks } = require('../tronbox-config');

async function main() {
  const keys = ['PRIVATE_KEY_NILE', 'PRIVATE_KEY_NILE_SPENDER'];
  const addresses = [];
  for (const name of keys) {
    const key = process.env[name] || '';
    if (!/^[0-9a-fA-F]{64}$/.test(key)) {
      throw new Error(`Set ${name} in .env to a 64-character hexadecimal private key without 0x.`);
    }
    try {
      addresses.push(`41${computeAddress(`0x${key}`).slice(2)}`);
    } catch {
      throw new Error(`${name} is not a valid private key.`);
    }
  }
  if (addresses[0] === addresses[1]) throw new Error('Use two distinct Nile wallets.');

  // Validate funding before TronBox runs migrations and spends test resources.
  for (const [index, address] of addresses.entries()) {
    const response = await fetch(`${networks.nile.fullHost}/wallet/getaccount`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, visible: false }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Nile account lookup failed: HTTP ${response.status}. Retry later.`);
    const account = await response.json();
    if (!(account.balance > 0)) throw new Error(`Fund the wallet for ${keys[index]} with Nile test TRX first.`);
  }

  const result = spawnSync(process.execPath, [
    require.resolve('tronbox/build/tronbox.js'),
    'test', 'nile-test/game-items.test.js', '--network', 'nile',
  ], { cwd: resolve(__dirname, '..'), stdio: 'inherit' });
  if (result.error) throw new Error('Could not start TronBox. Run npm ci and retry.');
  process.exitCode = result.status ?? 1;
}

main().catch(error => {
  console.error(`Nile test preflight: ${error.message}`);
  process.exitCode = 1;
});
