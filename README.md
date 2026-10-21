# TRC-6909 on TRON with OpenZeppelin

**TRC-6909 lets one smart contract manage multiple token types, each identified by a token ID.** Each account has a separate balance for each ID. A holder can approve a spender for a specific amount of one token, or authorize an operator to move any of their token types.

This project uses [OpenZeppelin Contracts for TRON](https://docs.openzeppelin.com/tron-contracts/trc6909), pinned to `@openzeppelin/tron-contracts` **5.6.0**, to implement a game inventory containing gold and swords. Both assets share one contract address while keeping their balances, metadata, and per-token allowances separate.

OpenZeppelin's `TRC6909` implements transfers, balances, allowances, operators, and TRC-165 interface detection. Its `TRC6909Metadata` extension adds a name, symbol, and decimals value for each ID. The application contract inherits these implementations and only configures its two tokens and initial supplies.

## Smart contract: GameItems

[contracts/GameItems.sol](contracts/GameItems.sol) defines the inventory:

| Token ID | Name | Symbol | Decimals | Initial supply | Smallest units |
| --- | --- | --- | --- | --- | --- |
| `0` | Gold | GOLD | 6 | 1,000 gold | `1000000000` |
| `1` | Sword | SWORD | 0 | 10 swords | `10` |

`GameItems` inherits `TRC6909Metadata`. Its constructor assigns both fixed supplies to `initialHolder`. OpenZeppelin supplies the balance, transfer, allowance, operator, and interface implementations. There are no public mint, burn, or metadata setters, so the example needs no administrator or access-control layer.

### Supply and decimals

The constructor accepts a nonzero `initialHolder` and mints both supplies to that address. The deployment script passes the configured deployer's address, so a normal Nile deployment assigns the inventory to `PRIVATE_KEY_NILE`'s wallet. The holder has tokens but no special administrator privileges.

Gold explicitly uses `_setDecimals(GOLD, 6)`: `1000000` units represent one gold. Sword does not call `_setDecimals`, so OpenZeppelin's metadata storage defaults to **0 decimals**: `1` unit represents one sword. All transfer and approval amounts are integers in the smallest unit; decimals describe display formatting and do not rescale amounts inside the contract.

There is no ongoing minting, burning, or metadata editing through the public API. Swords are interchangeable units of token ID `1`; individual swords do not have unique IDs. Unknown IDs return empty names and symbols, zero decimals, and zero balances. This contract cannot mint them after construction.

### Permissions

| Action | Scope | Effect |
| --- | --- | --- |
| `transfer(receiver, id, amount)` | Caller's balance for one ID | Sends tokens directly |
| `approve(spender, id, amount)` | One owner, spender, and ID | Replaces the allowance; use `0` to revoke |
| `transferFrom(sender, receiver, id, amount)` | Sender's balance for one ID | Spends the caller's allowance unless the caller is the sender or an authorized operator |
| `setOperator(spender, true)` | All IDs owned by the caller | Authorizes transfers without consuming per-token allowances |
| `setOperator(spender, false)` | All IDs owned by the caller | Revokes operator status; existing allowances remain |

A finite allowance decreases when spent; the maximum `uint256` allowance remains unchanged. A sword allowance cannot authorize a gold transfer.

## Choose a workflow

| Goal | Command | Behavior |
| --- | --- | --- |
| Run the full suite locally | `npm test` | Uses local TRE and deploys fresh test inventories |
| Run the full suite on Nile | `npm run test:nile` | Checks wallet configuration/funding, then runs 17 tests with fresh deployments |
| Deploy an inventory on Nile | `npm run deploy:nile` | Runs reset migrations; creates a new inventory for manual use |
| Exercise an existing Nile inventory | `npm run test:nile:deployed` | Uses the configured address; sends transfers and approvals without deploying |

All workflows need `npm ci` and `npm run compile` first. Only local workflows require Docker.

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
   Configuration loads `.env` automatically. The configured RPC endpoint is
   `https://nile.trongrid.io`; the project does not configure an API key.
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

Use [scripts/test-nile-deployed.js](scripts/test-nile-deployed.js) for a short walkthrough against an existing `GameItems` deployment. Wallet **A** is the holder; wallet **B** is both spender and recipient.

If you need a deployment, run `npm run deploy:nile` and copy the printed **GameItems** address, not the separate Migrations address. Configure `.env` (retain your actual keys locally):

```dotenv
PRIVATE_KEY_NILE=YOUR_HOLDER_PRIVATE_KEY
PRIVATE_KEY_NILE_SPENDER=YOUR_SPENDER_PRIVATE_KEY
CONTRACT_ADDRESS_NILE=YOUR_NILE_GAMEITEMS_ADDRESS
```

Then install dependencies and generate the local ABI artifact if needed:

```sh
npm ci
npm run compile
npm run test:nile:deployed
```

This reads `CONTRACT_ADDRESS_NILE` from `.env`, without deploying or running
migrations. The address is required; a missing or invalid address stops the run.

The script reads the ABI from `build/contracts/GameItems.json` and uses the address from `.env`. Compiling creates the ABI locally; it does not deploy a contract.

| Step | Transaction | Expected result |
| --- | --- | --- |
| 1 | A transfers `25000000` gold units to B | A loses 25 gold; B gains 25 gold |
| 2 | A approves B for `2` sword units | B's sword allowance becomes `2` |
| 3 | B transfers `1` sword from A to B | A loses one sword; B gains one; allowance becomes `1` |
| 4 | B attempts to transfer `2` more swords | Reverts with `TRC6909InsufficientAllowance`; balances and allowance stay unchanged |

The script prints public addresses, transaction IDs, and `PASS` assertions. It polls mined receipts every three seconds for up to 180 seconds per transaction. Successful calls must report `SUCCESS`; the intentional failure must report `REVERT` with the expected decoded custom error. A broadcast transaction ID alone is not a passing result. The final success message is:

```text
Both deployed Nile feature tests passed. B retains an allowance of one sword.
```

Both wallets need test TRX, including for the deliberately reverted transaction.

The script records current balances and checks exact changes, so it can run
against an inventory you have already used. A needs at least 25 gold and three
swords, and B must not already be an operator for A. These checks run before
any writes. Each successful run moves 25 gold and one sword from A to B and
replaces B's sword allowance with two, then spends one. B retains permission to
spend one more sword. You can rerun while A has sufficient balances.
A partial failure leaves earlier successful transactions in place; inspect the
last printed transaction before retrying. Avoid other transfers involving these
wallets during the test so the balance comparisons remain valid.

## Nile troubleshooting

| Symptom | What to check |
| --- | --- |
| Invalid or missing key | Set both keys to distinct valid 64-character hexadecimal private keys without `0x` |
| Missing contract address | Set `CONTRACT_ADDRESS_NILE` to the GameItems address for the deployed walkthrough |
| Missing `build/contracts/GameItems.json` | Run `npm run compile` before the deployed walkthrough |
| Insufficient balance or energy | Fund both signing wallets with Nile test TRX; a nonzero balance alone may not cover the run |
| Walkthrough rejects starting balances | A needs at least 25 gold and three swords, and B must not already be A's operator |
| RPC error or receipt timeout | Inspect the last transaction in the Nile explorer before retrying; it may have executed |
| Local connection error | Start TRE with `npm run tre:start`; `npm test` uses localhost, not Nile |

The fee limit in `tronbox-config.js` is `1000000000` SUN (1,000 TRX) per transaction. It is a cap, not a predicted fee. Neither Nile script automatically obtains test funds.

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

As described in [OpenZeppelin's TRC-6909 guide](https://docs.openzeppelin.com/tron-contracts/trc6909), the base implementation omits batch operations and receiver callbacks. Transfers to contracts do not check whether the recipient can return the tokens. Metadata here provides names, symbols, and decimals; it does not provide content URIs or a `totalSupply` getter. Unconfigured IDs have default metadata and zero supply; they cannot acquire a positive balance because minting is limited to the constructor.

## Project layout

```text
contracts/
  GameItems.sol                 Fixed-supply gold and sword inventory
  Migrations.sol                TronBox deployment bookkeeping
migrations/
  1_initial_migration.js        Deploys Migrations
  2_deploy_game_items.js        Deploys GameItems to the configured holder
scripts/
  test-nile.js                  Key/funding preflight and full Nile test runner
  test-nile-deployed.js         Transfer/allowance walkthrough on an existing deployment
test/game-items.test.js         Local suite entry point
nile-test/game-items.test.js    Nile suite entry point
test-support/game-items-suite.js
                               Shared 17-test TVM behavior suite
tronbox-config.js               Local/Nile networks and TRON compiler settings
compose.yaml                   Pinned disposable local TRON runtime
.env.sample                    Nile wallet and contract-address template
.nvmrc                         Node.js version for nvm
package.json                   Dependencies and npm commands
package-lock.json              Locked dependency tree
build/                         Generated artifacts and deployment records (gitignored)
```

`Migrations.sol` records completed migrations for TronBox; it is separate from the inventory and does not control token permissions. The ignored `.env` contains local wallet configuration. `node_modules/` and compiler output are generated locally and excluded from version control.

Use the tests as interaction examples: each test deploys a fresh inventory, and assertions check mined receipts and balances. To extend the contract with ongoing minting, add an explicitly authorized function using OpenZeppelin's access-control contracts. Keep the dependency code unchanged. The npm overrides pin patched versions of transitive development dependencies reported by `npm audit`.

The committed private key is TRE's public development key and is only configured for localhost. This project is an educational example; the application contract has not been audited.

MIT licensed. See [LICENSE](LICENSE).
