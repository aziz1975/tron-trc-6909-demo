const assert = require('node:assert/strict');
const { Interface } = require('ethers');
const GameItems = artifacts.require('GameItems');

const GOLD = 0;
const SWORD = 1;
const GOLD_SUPPLY = 1_000_000_000n;
const SWORD_SUPPLY = 10n;
const ZERO_ADDRESS = '410000000000000000000000000000000000000000';
const MAX_UINT256 = ((1n << 256n) - 1n).toString();

// TRON returns a transaction ID before execution; inspect the mined receipt.
async function sendAndCheck(transaction, expectedError) {
  const transactionId = await transaction;
  const receipt = await waitForTransactionReceipt(transactionId);
  if (tronWeb.networkConfig.fullNode === 'https://nile.trongrid.io') {
    console.log(`    Transaction: ${transactionId}`);
  }
  if (expectedError) {
    assert.equal(receipt.receipt.result, 'REVERT');
    const error = new Interface(GameItems.abi).parseError(`0x${receipt.contractResult[0]}`);
    assert.equal(error.name, expectedError);
  } else {
    assert.equal(receipt.receipt.result, 'SUCCESS');
  }
  return receipt;
}

module.exports = function registerSuite({ nile = false } = {}) {
  contract(nile ? 'GameItems on Nile' : 'GameItems', function (accounts) {
    let items;
    let holder;
    let player;
    let spender;

    let holderKey;
    let spenderKey;
    const iface = new Interface(GameItems.abi);
    const address = value => `0x${tronWeb.address.toHex(value).slice(2)}`.toLowerCase();

    before(async function () {
      if (nile) {
        holderKey = process.env.PRIVATE_KEY_NILE;
        spenderKey = process.env.PRIVATE_KEY_NILE_SPENDER;
        for (const [label, key] of [['PRIVATE_KEY_NILE', holderKey], ['PRIVATE_KEY_NILE_SPENDER', spenderKey]]) {
          assert.ok(/^[0-9a-fA-F]{64}$/.test(key || ''), `Set ${label} to a 64-character hex key in .env`);
        }
        holder = tronWeb.address.fromPrivateKey(holderKey);
        spender = tronWeb.address.fromPrivateKey(spenderKey);
        assert.notEqual(holder, spender, 'Use two distinct Nile wallets');
        player = (await tronWeb.createAccount()).address.base58;
        for (const wallet of [holder, spender]) {
          assert.ok(await tronWeb.trx.getBalance(wallet) > 0, `Fund Nile wallet ${wallet} with test TRX`);
        }
        console.log(`    Holder: ${holder}; spender: ${spender}; recipient: ${player}`);
      } else {
        assert.ok(accounts.length >= 3, 'Start TRE with npm run tre:start before testing.');
        [holder, player, spender] = accounts;
        const data = await tronWeb.fullNode.request('admin/accounts-json', {}, 'get');
        const keys = Array.isArray(data) ? data : data.privateKeys;
        holderKey = keys.find(key => tronWeb.address.fromPrivateKey(key) === holder);
        spenderKey = keys.find(key => tronWeb.address.fromPrivateKey(key) === spender);
        assert.ok(holderKey && spenderKey, 'TRE must provide signing keys for the test wallets');
      }
    });

    function withSigners(instance) {
      const writes = new Set(['transfer', 'transferFrom', 'approve', 'setOperator']);
      const raw = tronWeb.contract(GameItems.abi, instance.address);
      return new Proxy(instance, {
        get(target, property) {
          if (!writes.has(property)) return target[property];
          return (...args) => {
            const options = args.pop();
            const key = options.from === spender ? spenderKey : holderKey;
            assert.ok(options.from === holder || options.from === spender, 'Unknown signer');
            return raw[property](...args).send({ feeLimit: 1_000_000_000 }, key);
          };
        },
      });
    }

    function event(info, name, expected) {
      const events = (info.log || []).filter(log =>
        address(`41${log.address.replace(/^0x/, '').slice(-40)}`) === address(items.address)
      ).map(log => iface.parseLog({
        topics: log.topics.map(topic => `0x${topic.replace(/^0x/, '')}`),
        data: `0x${log.data.replace(/^0x/, '')}`,
      })).filter(entry => entry && entry.name === name);
      assert.equal(events.length, 1, `Expected one ${name} event`);
      assert.deepEqual(Array.from(events[0].args).map(value =>
        typeof value === 'string' && value.startsWith('0x') ? value.toLowerCase() : value
      ), expected);
    }

    beforeEach(async function () {
      // TRON derives contract addresses from transaction IDs. A fresh timestamp
      // prevents identical constructor calls in one block from producing the same ID.
      const blockHeader = await tronWeb.trx.getCurrentRefBlockParams();
      blockHeader.timestamp = Date.now();
      items = withSigners(await GameItems.new(holder, { from: holder, blockHeader }));
      if (nile) console.log(`    Contract: ${items.address}`);
      await sendAndCheck(items.transactionHash);
    });

    it('mints both fixed supplies to an explicit initial holder', async function () {
      const playerItems = await GameItems.new(player, { from: holder });
      await sendAndCheck(playerItems.transactionHash);
      assert.equal((await playerItems.balanceOf(player, GOLD)).toString(), GOLD_SUPPLY.toString());
      assert.equal((await playerItems.balanceOf(player, SWORD)).toString(), SWORD_SUPPLY.toString());
      assert.equal((await playerItems.balanceOf(holder, GOLD)).toString(), '0');
    });

    it('exposes metadata and different decimals for each token', async function () {
      // Use the full signature because JavaScript functions already have a name property.
      assert.equal(await items['name(uint256)'](GOLD), 'Gold');
      assert.equal(await items.symbol(GOLD), 'GOLD');
      assert.equal((await items.decimals(GOLD)).toString(), '6');
      assert.equal(await items['name(uint256)'](SWORD), 'Sword');
      assert.equal(await items.symbol(SWORD), 'SWORD');
      assert.equal((await items.decimals(SWORD)).toString(), '0');
    });

    it('transfers gold without changing sword balances', async function () {
      await sendAndCheck(items.transfer(player, GOLD, '25000000', { from: holder }));
      assert.equal((await items.balanceOf(holder, GOLD)).toString(), '975000000');
      assert.equal((await items.balanceOf(player, GOLD)).toString(), '25000000');
      assert.equal((await items.balanceOf(holder, SWORD)).toString(), '10');
    });

    it('spends a per-token allowance and prevents spending beyond it', async function () {
      await sendAndCheck(items.approve(spender, GOLD, '5000000', { from: holder }));
      await sendAndCheck(items.transferFrom(holder, player, GOLD, '2000000', { from: spender }));
      assert.equal((await items.allowance(holder, spender, GOLD)).toString(), '3000000');
      assert.equal((await items.balanceOf(player, GOLD)).toString(), '2000000');
      await sendAndCheck(
        items.transferFrom(holder, player, GOLD, '4000000', { from: spender }),
        'TRC6909InsufficientAllowance',
      );
      // A gold approval never authorizes spending swords.
      await sendAndCheck(
        items.transferFrom(holder, player, SWORD, '1', { from: spender }),
        'TRC6909InsufficientAllowance',
      );
      assert.equal((await items.allowance(holder, spender, GOLD)).toString(), '3000000');
      assert.equal((await items.balanceOf(player, SWORD)).toString(), '0');
    });

    it('revokes a per-token allowance by approving zero', async function () {
      await sendAndCheck(items.approve(spender, SWORD, '2', { from: holder }));
      await sendAndCheck(items.approve(spender, SWORD, '0', { from: holder }));
      await sendAndCheck(
        items.transferFrom(holder, player, SWORD, '1', { from: spender }),
        'TRC6909InsufficientAllowance',
      );
    });

    it('preserves an unlimited allowance after spending', async function () {
      await sendAndCheck(items.approve(spender, GOLD, MAX_UINT256, { from: holder }));
      await sendAndCheck(items.transferFrom(holder, player, GOLD, '1', { from: spender }));
      assert.equal((await items.allowance(holder, spender, GOLD)).toString(), MAX_UINT256);
    });

    it('allows an operator to transfer either token and supports revocation', async function () {
      await sendAndCheck(items.setOperator(spender, true, { from: holder }));
      assert.equal(await items.isOperator(holder, spender), true);
      await sendAndCheck(items.transferFrom(holder, player, GOLD, '1000000', { from: spender }));
      await sendAndCheck(items.transferFrom(holder, player, SWORD, '1', { from: spender }));
      assert.equal((await items.balanceOf(player, GOLD)).toString(), '1000000');
      assert.equal((await items.balanceOf(player, SWORD)).toString(), '1');
      assert.equal((await items.allowance(holder, spender, SWORD)).toString(), '0');
      await sendAndCheck(items.setOperator(spender, false, { from: holder }));
      assert.equal(await items.isOperator(holder, spender), false);
      await sendAndCheck(
        items.transferFrom(holder, player, SWORD, '1', { from: spender }),
        'TRC6909InsufficientAllowance',
      );
    });

    it('rejects insufficient balances and zero-address recipients', async function () {
      await sendAndCheck(
        items.transfer(player, SWORD, '11', { from: holder }),
        'TRC6909InsufficientBalance',
      );
      await sendAndCheck(
        items.transfer(ZERO_ADDRESS, SWORD, '1', { from: holder }),
        'TRC6909InvalidReceiver',
      );
      assert.equal((await items.balanceOf(holder, SWORD)).toString(), '10');
      assert.equal((await items.balanceOf(player, SWORD)).toString(), '0');
    });

    it('advertises TRC-165, TRC-6909 and metadata interfaces only', async function () {
      function interfaceId(signatures) {
        const value = signatures.reduce((id, signature) => id ^ BigInt(iface.getFunction(signature).selector), 0n);
        return `0x${value.toString(16).padStart(8, '0')}`;
      }
      const core = interfaceId(['balanceOf', 'allowance', 'isOperator', 'approve', 'setOperator', 'transfer', 'transferFrom']);
      assert.equal(core, '0x0f632fb3');
      assert.equal(await items.supportsInterface('0x01ffc9a7'), true);
      assert.equal(await items.supportsInterface(core), true);
      assert.equal(await items.supportsInterface(interfaceId(['name', 'symbol', 'decimals'])), true);
      assert.equal(await items.supportsInterface('0xffffffff'), false);
      assert.equal(await items.supportsInterface('0x00000000'), false);
    });

    it('emits mint, transfer, approval and operator events and returns true', async function () {
      const mint = await waitForTransactionReceipt(items.transactionHash);
      const transfers = (mint.log || []).map(log => iface.parseLog({
        topics: log.topics.map(topic => `0x${topic.replace(/^0x/, '')}`),
        data: `0x${log.data.replace(/^0x/, '')}`,
      })).filter(entry => entry && entry.name === 'Transfer');
      assert.equal(transfers.length, 2);
      for (const [i, amount] of [GOLD_SUPPLY, SWORD_SUPPLY].entries()) {
        assert.deepEqual(Array.from(transfers[i].args).map(value =>
          typeof value === 'string' ? value.toLowerCase() : value
        ), [address(holder), address(ZERO_ADDRESS), address(holder), BigInt(i), amount]);
      }
      function returnsTrue(info, method) {
        assert.equal(iface.decodeFunctionResult(method, `0x${info.contractResult[0]}`)[0], true);
      }
      let info = await sendAndCheck(items.approve(spender, SWORD, '2', { from: holder }));
      event(info, 'Approval', [address(holder), address(spender), 1n, 2n]);
      returnsTrue(info, 'approve');
      info = await sendAndCheck(items.transferFrom(holder, player, SWORD, '1', { from: spender }));
      event(info, 'Transfer', [address(spender), address(holder), address(player), 1n, 1n]);
      returnsTrue(info, 'transferFrom');
      info = await sendAndCheck(items.setOperator(spender, true, { from: holder }));
      event(info, 'OperatorSet', [address(holder), address(spender), true]);
      returnsTrue(info, 'setOperator');
      info = await sendAndCheck(items.transfer(player, GOLD, '1', { from: holder }));
      event(info, 'Transfer', [address(holder), address(holder), address(player), 0n, 1n]);
      returnsTrue(info, 'transfer');
      info = await sendAndCheck(items.setOperator(spender, false, { from: holder }));
      event(info, 'OperatorSet', [address(holder), address(spender), false]);
      info = await sendAndCheck(items.approve(spender, SWORD, '0', { from: holder }));
      event(info, 'Approval', [address(holder), address(spender), 1n, 0n]);
    });

    it('preserves finite allowances during operator transfers and after revocation', async function () {
      await sendAndCheck(items.approve(spender, SWORD, '2', { from: holder }));
      await sendAndCheck(items.setOperator(spender, true, { from: holder }));
      await sendAndCheck(items.transferFrom(holder, player, SWORD, '3', { from: spender }));
      assert.equal((await items.allowance(holder, spender, SWORD)).toString(), '2');
      await sendAndCheck(items.setOperator(spender, false, { from: holder }));
      await sendAndCheck(items.transferFrom(holder, player, SWORD, '2', { from: spender }));
      assert.equal((await items.allowance(holder, spender, SWORD)).toString(), '0');
      assert.equal((await items.balanceOf(holder, SWORD)).toString(), '5');
      assert.equal((await items.balanceOf(player, SWORD)).toString(), '5');
      await sendAndCheck(items.transferFrom(holder, player, SWORD, '1', { from: spender }), 'TRC6909InsufficientAllowance');
    });

    it('rolls back allowance spending and balances when a transfer reverts', async function () {
      await sendAndCheck(items.approve(spender, SWORD, '11', { from: holder }));
      await sendAndCheck(items.transferFrom(holder, player, SWORD, '11', { from: spender }), 'TRC6909InsufficientBalance');
      assert.equal((await items.allowance(holder, spender, SWORD)).toString(), '11');
      await sendAndCheck(items.transferFrom(holder, ZERO_ADDRESS, SWORD, '1', { from: spender }), 'TRC6909InvalidReceiver');
      assert.equal((await items.allowance(holder, spender, SWORD)).toString(), '11');
      assert.equal((await items.balanceOf(holder, SWORD)).toString(), '10');
      assert.equal((await items.balanceOf(player, SWORD)).toString(), '0');
    });

    it('allows holder transferFrom without self-approval and handles self/zero transfers', async function () {
      await sendAndCheck(items.transferFrom(holder, player, SWORD, '1', { from: holder }));
      assert.equal((await items.allowance(holder, holder, SWORD)).toString(), '0');
      await sendAndCheck(items.transfer(holder, SWORD, '2', { from: holder }));
      const info = await sendAndCheck(items.transfer(player, SWORD, '0', { from: holder }));
      event(info, 'Transfer', [address(holder), address(holder), address(player), 1n, 0n]);
      assert.equal((await items.balanceOf(holder, SWORD)).toString(), '9');
      assert.equal((await items.balanceOf(player, SWORD)).toString(), '1');
    });

    it('returns defaults for unknown IDs and rejects positive transfers', async function () {
      const id = '999';
      assert.equal((await items.balanceOf(holder, id)).toString(), '0');
      assert.equal(await items['name(uint256)'](id), '');
      assert.equal(await items.symbol(id), '');
      assert.equal((await items.decimals(id)).toString(), '0');
      assert.equal((await items.allowance(holder, spender, id)).toString(), '0');
      await sendAndCheck(items.transfer(player, id, '1', { from: holder }), 'TRC6909InsufficientBalance');
      await sendAndCheck(items.transfer(player, id, '0', { from: holder }));
      assert.equal((await items.balanceOf(player, id)).toString(), '0');
    });

    it('rejects zero-address spenders and operators', async function () {
      await sendAndCheck(items.approve(ZERO_ADDRESS, SWORD, '1', { from: holder }), 'TRC6909InvalidSpender');
      await sendAndCheck(items.setOperator(ZERO_ADDRESS, true, { from: holder }), 'TRC6909InvalidSpender');
      assert.equal((await items.allowance(holder, ZERO_ADDRESS, SWORD)).toString(), '0');
      assert.equal(await items.isOperator(holder, ZERO_ADDRESS), false);
    });

    it('replaces rather than adds approvals and isolates permissions by owner', async function () {
      await sendAndCheck(items.approve(spender, SWORD, '5', { from: holder }));
      await sendAndCheck(items.approve(spender, SWORD, '2', { from: holder }));
      assert.equal((await items.allowance(holder, spender, SWORD)).toString(), '2');
      await sendAndCheck(items.transferFrom(holder, player, SWORD, '1', { from: spender }));
      await sendAndCheck(items.transferFrom(player, holder, SWORD, '1', { from: spender }), 'TRC6909InsufficientAllowance');
      assert.equal((await items.balanceOf(player, SWORD)).toString(), '1');
      assert.equal((await items.allowance(holder, spender, SWORD)).toString(), '1');
    });

    it('rejects a zero-address initial holder', async function () {
      const transaction = await tronWeb.transactionBuilder.createSmartContract({
        abi: GameItems.abi,
        bytecode: GameItems.bytecode.replace(/^0x/, ''),
        parameters: [ZERO_ADDRESS],
        feeLimit: 1_000_000_000,
        userFeePercentage: 100,
      }, holder);
      const signed = await tronWeb.trx.sign(transaction, holderKey);
      const broadcast = await tronWeb.trx.sendRawTransaction(signed);
      assert.equal(broadcast.result, true, 'Invalid constructor transaction must be broadcast');
      await sendAndCheck(signed.txID, 'TRC6909InvalidReceiver');
    });

  });
};
