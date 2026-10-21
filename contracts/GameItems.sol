// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {TRC6909Metadata} from "@openzeppelin/tron-contracts/token/TRC6909/extensions/TRC6909Metadata.sol";

/// @title GameItems
/// @notice A fixed-supply game inventory demonstrating two tokens in one TRC-6909 contract.
/// @dev Inherits OpenZeppelin's transfers and approvals without modifying their behavior.
contract GameItems is TRC6909Metadata {
    uint256 public constant GOLD = 0;
    uint256 public constant SWORD = 1;

    uint8 public constant GOLD_DECIMALS = 6;
    uint256 public constant INITIAL_GOLD_SUPPLY = 1000 * 10 ** GOLD_DECIMALS;
    uint256 public constant INITIAL_SWORD_SUPPLY = 10;

    /// @notice Creates 1,000 gold and 10 swords for the initial holder.
    /// @param initialHolder Account receiving both token supplies; must be nonzero.
    constructor(address initialHolder) {
        _setName(GOLD, "Gold");
        _setSymbol(GOLD, "GOLD");
        _setDecimals(GOLD, GOLD_DECIMALS);

        _setName(SWORD, "Sword");
        _setSymbol(SWORD, "SWORD");
        // Swords use the metadata extension's default of zero decimals.

        _mint(initialHolder, GOLD, INITIAL_GOLD_SUPPLY);
        _mint(initialHolder, SWORD, INITIAL_SWORD_SUPPLY);
    }
}
