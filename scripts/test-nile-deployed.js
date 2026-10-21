const assert = require('node:assert/strict');
const { TronWeb } = require('tronweb');
const { Interface } = require('ethers');
const { networks } = require('../tronbox-config');
const artifact = require('../build/contracts/GameItems.json');

async function main() {
  const keys = ['PRIVATE_KEY_NILE', 'PRIVATE_KEY_NILE_SPENDER'].map(name => {
    const key = process.env[name] || '';
    assert.match(key, /^[0-9a-fA-F]{64}$/, `Set ${name} in .env (64 hex characters, no 0x).`);
    assert.ok(TronWeb.address.fromPrivateKey(key), `${name} is invalid.`);
    return key;
  });
  const [A, B] = keys.map(key => TronWeb.address.fromPrivateKey(key));
  assert.notEqual(A, B, 'Use distinct holder and spender wallets.');
  const contractAddress = process.env.CONTRACT_ADDRESS_NILE?.trim();
  assert.ok(TronWeb.isAddress(contractAddress), 'Set CONTRACT_ADDRESS_NILE in .env to your deployed Nile contract address.');
  const tronWeb = new TronWeb({ fullHost: networks.nile.fullHost, privateKey: keys[0] });
  const inventory = tronWeb.contract(artifact.abi, contractAddress);
  const iface = new Interface(artifact.abi);
  console.log({ contract: tronWeb.address.fromHex(contractAddress), holder: A, player: B });

  const balance = async (owner, id) => (await inventory.balanceOf(owner, id).call()).toString();
  const allowance = async id => (await inventory.allowance(A, B, id).call()).toString();
  async function check(label, actual, expected) {
    const value = await actual;
    assert.equal(value, expected, `${label}: expected ${expected}, got ${value}`);
    console.log(`PASS ${label}: ${expected}`);
  }
  async function send(label, method, key = keys[0], expectedError) {
    const txId = await method.send({ feeLimit: networks.nile.feeLimit }, key);
    console.log(`${label}: ${txId}`);
    // Poll receipts explicitly so RPC, signing and resource failures cannot pass
    // as an expected contract revert.
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      const info = await tronWeb.trx.getTransactionInfo(txId);
      if (info.receipt) {
        if (expectedError) {
          assert.equal(info.receipt.result, 'REVERT', `${label}: expected REVERT`);
          const error = iface.parseError(`0x${info.contractResult?.[0] || ''}`);
          assert.equal(error?.name, expectedError, label);
          console.log(`PASS ${label}: ${expectedError}`);
        } else {
          assert.equal(info.receipt.result, 'SUCCESS', `${label}: execution failed`);
          console.log(`PASS ${label}`);
        }
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    throw new Error(`${label}: receipt timeout for ${txId}; inspect it before retrying.`);
  }

  // Compare changes against this deployment's current balances.
  const [aGold, aSwords, bGold, bSwords] = await Promise.all([
    balance(A, 0), balance(A, 1), balance(B, 0), balance(B, 1),
  ]).then(values => values.map(BigInt));
  console.log('Starting balances (smallest units):', {
    holderGold: aGold.toString(), holderSwords: aSwords.toString(),
    playerGold: bGold.toString(), playerSwords: bSwords.toString(),
  });
  assert.ok(aGold >= 25_000_000n, 'A needs at least 25 gold.');
  // Three swords ensure the overspend could succeed on balance alone,
  // so the rejection specifically demonstrates the allowance limit.
  assert.ok(aSwords >= 3n, 'A needs at least three swords for the allowance test.');
  await check('initial operator', inventory.isOperator(A, B).call(), false);
  for (const wallet of [A, B]) {
    assert.ok(await tronWeb.trx.getBalance(wallet) > 0, `Fund ${wallet} with Nile test TRX.`);
  }

  await send('transfer 25 gold', inventory.transfer(B, 0, '25000000'));
  await check('A gold after transfer', balance(A, 0), (aGold - 25_000_000n).toString());
  await check('B gold after transfer', balance(B, 0), (bGold + 25_000_000n).toString());
  await send('approve two swords', inventory.approve(B, 1, '2'));
  await check('approved sword allowance', allowance(1), '2');
  await send('B spends one sword', inventory.transferFrom(A, B, 1, '1'), keys[1]);
  await check('A swords', balance(A, 1), (aSwords - 1n).toString());
  await check('B swords', balance(B, 1), (bSwords + 1n).toString());
  await check('remaining sword allowance', allowance(1), '1');
  const denied = 'TRC6909InsufficientAllowance';
  await send('reject overspending', inventory.transferFrom(A, B, 1, '2'), keys[1], denied);
  await check('allowance after rejected overspend', allowance(1), '1');
  await check('A swords after rejected overspend', balance(A, 1), (aSwords - 1n).toString());
  await check('B swords after rejected overspend', balance(B, 1), (bSwords + 1n).toString());
  console.log('Both deployed Nile feature tests passed. B retains an allowance of one sword.');
}

main().catch(error => {
  if (error instanceof assert.AssertionError) console.error(error.message);
  // SDK errors can contain signed request data; keep diagnostics free of keys.
  console.error('Walkthrough failed. Check the last printed step/transaction and initial balances, .env keys, funding, and Nile connectivity. No deployment was performed.');
  process.exitCode = 1;
});
