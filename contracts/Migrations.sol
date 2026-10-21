// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

/// @dev TronBox deployment bookkeeping, separate from the game inventory.
contract Migrations {
    address public immutable owner = msg.sender;
    // TronBox expects this exact getter name.
    uint256 public last_completed_migration;

    error UnauthorizedCaller(address caller);

    function setCompleted(uint256 completedMigration) external {
        if (msg.sender != owner) revert UnauthorizedCaller(msg.sender);
        last_completed_migration = completedMigration;
    }
}
