# TRC-6909 on TRON

A small game inventory built with [OpenZeppelin Contracts for TRON](https://docs.openzeppelin.com/tron-contracts/trc6909). One contract manages two token types:

| Token ID | Name | Symbol | Decimals | Initial supply | Smallest units |
| --- | --- | --- | --- | --- | --- |
| `0` | Gold | GOLD | 6 | 1,000 gold | `1000000000` |
| `1` | Sword | SWORD | 0 | 10 swords | `10` |

`GameItems` inherits `TRC6909Metadata`. Its constructor assigns both fixed supplies to `initialHolder`. OpenZeppelin supplies the balance, transfer, allowance, operator, and interface implementations. There are no public mint, burn, or metadata setters, so the example needs no administrator or access-control layer.

## Run locally

Requirements: Node.js 22 or newer, npm, Docker, and Docker Compose v2 with `--wait` support. Port 9090 must be free. The first install needs internet access for dependencies and the TRON Solidity compiler.

```sh
npm ci
npm run compile
npm run tre:start
npm test
npm run deploy:local
```

`tre:start` starts a disposable [TronBox Runtime Environment (TRE)](https://tronbox.io/docs/guides/test-contracts) and waits for funded test accounts. Compilation uses **TRON Solidity 0.8.25**, and tests execute on the **TRON Virtual Machine**, using TronBox 4.11.0 and OpenZeppelin 5.6.0. Dependencies, the compiler version, and the TRE image digest are pinned for reproducibility.

## Test on Nile

Use Node.js 22 or newer. Docker is not required for Nile.

1. Create two dedicated test wallets in TronLink and select Nile: a holder and a
   spender. Export their private keys locally; never share them or use mainnet keys.
2. Run `cp .env.sample .env` if you do not already have `.env`. Set
   `PRIVATE_KEY_NILE` to the holder key and `PRIVATE_KEY_NILE_SPENDER` to the
   different spender key. Both are 64 hexadecimal characters without `0x`.
   Configuration loads `.env` automatically; no API key is required for this endpoint.
3. Request test TRX for **both wallets' public addresses** at
   <https://nileex.io/join/getJoinPage>. Confirm the balance on
   <https://nile.tronscan.org>. Each deployment and transaction consumes resources
   or test TRX. The configured fee limit is a per-transaction cap of 1,000 TRX,
   not an estimated fee.
4. Run `npm ci`, then `npm run compile`.
5. Run `npm run test:nile`. Expect **17 passing** tests. The same suite runs locally
   with `npm test`; it deploys a fresh inventory for every test. It checks balances,
   metadata, direct and delegated transfers, finite/unlimited allowances, operator
   permissions and revocation, events and return values, interface detection,
   rollback after failures, and boundary cases. Failed transactions are intentional:
   tests require the expected custom error and verify relevant state stays intact.
   Public contract addresses and transaction IDs are printed for inspection in the
   Nile explorer. The recipient is randomly generated and never signs; only the
   holder and spender need TRX. Preflight checks key format, distinct wallets, and
   nonzero TRX balances before TronBox starts migrations. Nonzero balances do not
   guarantee enough resources for the full run; this suite makes many deployments
   and transactions and may take several minutes. Refill either wallet as needed.
6. Optionally run `npm run deploy:nile` to deploy a separate inventory for manual
   use, then `npm run console:nile` to interact with it. Each reset deployment and
   each test run creates new contracts and spends more test resources.

Do not run plain `npm test` for Nile: it targets the local TRE chain. Nile
transactions can take longer; allow the command to finish. For insufficient
balance or energy errors, obtain more Nile TRX and retry. Never paste your `.env`
contents into logs or support messages.

## Test an already deployed Nile inventory

Configure both wallet keys and your deployed contract address in `.env`:

```dotenv
CONTRACT_ADDRESS_NILE=YOUR_NILE_CONTRACT_ADDRESS
```

Then run:

```sh
npm run test:nile:deployed
```

This reads `CONTRACT_ADDRESS_NILE` from `.env`, without deploying or running
migrations. The address is required; a missing or invalid address stops the run.

The script tests two features: a direct 25-gold transfer, and a two-sword
allowance with one sword spent followed by a rejected attempt to spend two more.
It verifies both wallets' balances, the remaining allowance, mined receipts, and
the expected custom error for overspending. It prints public addresses,
transaction IDs, and passing assertions. Both wallets need test TRX, including
for the deliberately reverted transaction.

The script records current balances and checks exact changes, so it can run
against an inventory you have already used. A needs at least 25 gold and three
swords, and B must not already be an operator for A. These checks run before
any writes. Each successful run moves 25 gold and one sword from A to B and
replaces B's sword allowance with two, then spends one. B retains permission to
spend one more sword. You can rerun while A has sufficient balances.
A partial failure leaves earlier successful transactions in place; inspect the
last printed transaction before retrying. Avoid other transfers involving these
wallets during the test so the balance comparisons remain valid.

## Transfers and approvals

The following calls illustrate the flow exercised by [the tests](test-support/game-items-suite.js). They run inside an async TronBox test callback, where `accounts` and `waitForTransactionReceipt` are provided by TronBox. This snippet uses the local TRE accounts; on Nile, the shared suite signs delegated calls explicitly with the spender key. Amounts are strings in the smallest token unit to avoid JavaScript number precision problems.

```js
const GameItems = artifacts.require('GameItems');
const items = await GameItems.deployed();
const [holder, player, spender] = accounts;

// 25 gold = 25 * 10^6 units; wait for execution before reading the balance.
let txId = await items.transfer(player, 0, '25000000', { from: holder });
await waitForTransactionReceipt(txId);
(await items.balanceOf(player, 0)).toString(); // '25000000'

// Permit a spender to transfer at most two swords.
txId = await items.approve(spender, 1, '2', { from: holder });
await waitForTransactionReceipt(txId);
txId = await items.transferFrom(holder, player, 1, '1', { from: spender });
await waitForTransactionReceipt(txId);
(await items.allowance(holder, spender, 1)).toString(); // '1'

// Revoke the remaining sword allowance.
txId = await items.approve(spender, 1, '0', { from: holder });
await waitForTransactionReceipt(txId);

// Alternatively, authorize a spender for every token ID, then revoke it.
txId = await items.setOperator(spender, true, { from: holder });
await waitForTransactionReceipt(txId);
txId = await items.setOperator(spender, false, { from: holder });
await waitForTransactionReceipt(txId);
```

A transaction ID means the transaction was broadcast. If `transactionInfo` is the result returned by `waitForTransactionReceipt(txId)`, check that `transactionInfo.receipt.result` is `SUCCESS`. The test helper also decodes OpenZeppelin custom errors for reverted transactions.

For token names in TronBox, use `items['name(uint256)'](0)`; the full signature avoids JavaScript's existing `name` property.

Stop the local chain when finished:

```sh
npm run tre:stop
```

Stopping TRE discards its chain state. Start it again and redeploy before interacting with the contract. `deploy:local` uses `--reset` and creates fresh contracts each time.

## What this demonstrates

- `balanceOf(holder, id)` tracks balances separately for each ID.
- `transfer(receiver, id, amount)` moves the caller's tokens.
- `approve(spender, id, amount)` sets an allowance for one ID; `transferFrom(sender, receiver, id, amount)` spends it. A gold approval cannot move swords.
- `setOperator(spender, true)` grants access to all the holder's IDs, without consuming per-token allowances. Revoking operator status leaves any separately granted allowances intact.
- Decimals affect display only. All on-chain amounts are integers; this example treats swords as whole items, not individually unique NFTs.

As described in [OpenZeppelin's TRC-6909 guide](https://docs.openzeppelin.com/tron-contracts/trc6909), this draft standard removes batch operations and receiver callbacks. Transfers to contracts do not check whether the recipient can return the tokens. Metadata here provides names, symbols, and decimals; it does not provide content URIs or a `totalSupply` getter. Unconfigured IDs have default metadata and zero supply; they cannot acquire a positive balance because minting is limited to the constructor.

## Project layout

```text
contracts/GameItems.sol          The example token contract
contracts/Migrations.sol         TronBox migration bookkeeping
migrations/                     Deployment scripts
test/game-items.test.js          Local suite entry point
nile-test/game-items.test.js     Nile suite entry point
test-support/game-items-suite.js Shared 17-test TVM behavior suite
scripts/test-nile.js             Nile key/funding preflight and test runner
tronbox-config.js                Local network and compiler settings
compose.yaml                    Pinned local TRON runtime
```

Use the tests as interaction examples: each test deploys a fresh inventory, and assertions check mined receipts and balances. To extend the contract with ongoing minting, add an explicitly authorized function using OpenZeppelin's access-control contracts. Keep the dependency code unchanged. The npm overrides pin patched versions of transitive development dependencies reported by `npm audit`.

The committed private key is TRE's public development key and is only configured for localhost. This project is an educational example; the application contract has not been audited.

MIT licensed. See [LICENSE](LICENSE).
