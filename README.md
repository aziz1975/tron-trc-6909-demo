# TRC-6909 on TRON with OpenZeppelin

**TRC-6909 lets one smart contract manage multiple token types, each identified by a token ID.** Each account has a separate balance for each ID. A holder can approve a spender for a specific amount of one token, or authorize an operator to move any of their token types.

This project uses [OpenZeppelin Contracts for TRON](https://docs.openzeppelin.com/tron-contracts/trc6909), pinned to `@openzeppelin/tron-contracts`, to implement a game inventory containing gold and swords. Both assets share one contract address while keeping their balances, metadata, and per-token allowances separate.

OpenZeppelin's `TRC6909` implements transfers, balances, allowances, operators, and TRC-165 interface detection. Its `TRC6909Metadata` extension adds a name, symbol, and decimals value for each ID. The application contract inherits these implementations and only configures its two tokens and initial supplies.

## Smart contract: GameItems

[contracts/GameItems.sol](contracts/GameItems.sol) defines the inventory:

| Token ID | Name | Symbol | Decimals | Initial supply | Smallest units |
| --- | --- | --- | --- | --- | --- |
| `0` | Gold | GOLD | 6 | 1,000 gold | `1000000000` |
| `1` | Sword | SWORD | 0 | 10 swords | `10` |

`GameItems` inherits `TRC6909Metadata`. Its constructor assigns both fixed supplies to `initialHolder`. OpenZeppelin supplies the balance, transfer, allowance, operator, and interface implementations.

### Supply and decimals

The constructor accepts a nonzero `initialHolder` and mints both supplies to that address. The deployment script passes the configured deployer's address, so a normal Nile deployment assigns the inventory to `PRIVATE_KEY_NILE`'s wallet. The holder has tokens but no special administrator privileges.

Gold explicitly uses `_setDecimals(GOLD, 6)`: `1000000` units represent one gold. Sword does not call `_setDecimals`, so OpenZeppelin's metadata storage defaults to **0 decimals**: `1` unit represents one sword. All transfer and approval amounts are integers in the smallest unit; decimals describe display formatting and do not rescale amounts inside the contract.

There is no ongoing minting, burning, or metadata editing through the public API. Swords are interchangeable units of token ID `1`; individual swords do not have unique IDs. Unknown IDs return empty names and symbols, zero decimals, and zero balances. This contract cannot mint them after construction.

### Contract permissions

These methods are inherited from OpenZeppelin. The walkthrough exercises `transfer`, `approve`, and `transferFrom`. It does **not** call `setOperator`; it only reads `isOperator(A, B)` to confirm B has no operator access before testing allowances.

| Action | Scope | Effect |
| --- | --- | --- |
| `transfer(receiver, id, amount)` | Caller's balance for one ID | Sends tokens directly |
| `approve(spender, id, amount)` | One owner, spender, and ID | Replaces the allowance; use `0` to revoke |
| `transferFrom(sender, receiver, id, amount)` | Sender's balance for one ID | Spends the caller's allowance unless the caller is the sender or an authorized operator |
| `setOperator(spender, true)` | All IDs owned by the caller | Authorizes transfers without consuming per-token allowances |
| `setOperator(spender, false)` | All IDs owned by the caller | Revokes operator status; existing allowances remain |

The walkthrough verifies that a finite sword allowance decreases when spent and prevents spending beyond the remaining amount. The inherited contract also supports unlimited allowances and separate permissions per token ID; those behaviors are not tested by this script.

## Choose a workflow

| Goal | Command | Behavior |
| --- | --- | --- |
| Deploy an inventory on Nile | `npm run deploy:nile` | Runs reset migrations; creates a new inventory for manual use |
| Exercise an existing Nile inventory | `npm run test:nile:deployed` | Uses the configured address; sends transfers and approvals without deploying |

All workflows target **Nile testnet** and need `npm ci` and `npm run compile` first. Requirements: Node.js 22 or newer, npm, internet access, and funded Nile wallets.

## Set up Nile wallets

Compilation uses **TRON Solidity 0.8.31**. Tests execute on Nile. The first setup downloads npm dependencies and the TRON Solidity compiler.

1. Create two dedicated test wallets in TronLink and select Nile: a holder and a
   spender. Export their private keys locally; never share them or use mainnet keys.
2. Run `cp .env.sample .env` if you do not already have `.env`. Set
   `PRIVATE_KEY_NILE` to the holder key and `PRIVATE_KEY_NILE_SPENDER` to the
   different spender key. Both are 64 hexadecimal characters without `0x`.
   Configuration loads `.env` automatically. The configured RPC endpoint is
   `https://nile.trongrid.io`; the project does not configure an API key.
3. Request test TRX for both wallets. Confirm the balance on
   <https://nile.tronscan.org>. Each deployment and transaction consumes resources
   or test TRX. The configured fee limit is a per-transaction cap of 1,000 TRX,
   not an estimated fee.
4. Run `npm ci`, then `npm run compile`.
5. If you need a new inventory, run `npm run deploy:nile`. Copy the printed
   **GameItems** address into `CONTRACT_ADDRESS_NILE` in `.env`. Each reset
   deployment creates new contracts and spends test resources. If you already
   have a deployment, use its address instead.
6. Run `npm run test:nile:deployed` to exercise that inventory as described below.
   Use `npm run console:nile` for manual interaction.

Nile transactions can take time; allow the command to finish. For insufficient
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

The script prints public addresses, transaction IDs, and `PASS` assertions. Successful calls must report `SUCCESS`; the intentional failure must report `REVERT` with the expected decoded custom error. A broadcast transaction ID alone is not a passing result. The final success message is:

```text
Both deployed Nile feature tests passed. B retains an allowance of one sword.
```

- The script records current balances and checks exact changes, so it can run against an inventory you have already used.
- A needs at least 25 gold and three swords, and B must not already be an operator for A. These checks run before any writes.
- Each successful run moves 25 gold and one sword from A to B and replaces B's sword allowance with two, then spends one.
- B retains permission to spend one more sword. You can rerun while A has sufficient balances.
- A partial failure leaves earlier successful transactions in place; inspect the last printed transaction before retrying.
- Avoid other transfers involving these wallets during the test so the balance comparisons remain valid.

## Nile troubleshooting

| Symptom | What to check |
| --- | --- |
| Invalid or missing key | Set both keys to distinct valid 64-character hexadecimal private keys without `0x` |
| Missing contract address | Set `CONTRACT_ADDRESS_NILE` to the GameItems address for the deployed walkthrough |
| Missing `build/contracts/GameItems.json` | Run `npm run compile` before the deployed walkthrough |
| Insufficient balance or energy | Fund both signing wallets with Nile test TRX; a nonzero balance alone may not cover the run |
| Walkthrough rejects starting balances | A needs at least 25 gold and three swords, and B must not already be A's operator |
| RPC error or receipt timeout | Inspect the last transaction in the Nile explorer before retrying; it may have executed |


## Project layout

```text
contracts/
  GameItems.sol                 Fixed-supply gold and sword inventory
  Migrations.sol                TronBox deployment bookkeeping
migrations/
  1_initial_migration.js        Deploys Migrations
  2_deploy_game_items.js        Deploys GameItems to the configured holder
scripts/
  test-nile-deployed.js         Transfer/allowance walkthrough on an existing deployment
tronbox-config.js               Nile network and TRON compiler settings
.env.sample                    Nile wallet and contract-address template
.nvmrc                         Node.js version for nvm
package.json                   Dependencies and npm commands
package-lock.json              Locked dependency tree
build/                         Generated artifacts and deployment records (gitignored)
```

This project is an educational example; the application contract has not been audited.

MIT licensed. See [LICENSE](LICENSE).
