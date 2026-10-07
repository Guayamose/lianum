// SPDX-License-Identifier: MIT
pragma solidity ^0.8.37;

interface ExitToken {
    function balanceOf(address owner) external view returns (uint256);
    function transferFrom(address owner, address receiver, uint256 amount) external returns (bool);
}

interface ExitVault is ExitToken {
    function asset() external view returns (address);
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);
}

/// Public redemption after a private pool withdrawal. This contract does not
/// authenticate the private withdrawal or create private balances.
contract BoundedMetaMorphoExit {
    ExitVault public immutable vault;
    ExitToken public immutable asset;
    mapping(address => mapping(bytes32 => bool)) public used;
    bool private entered;

    event Redeemed(address indexed owner, bytes32 indexed operationRef, uint256 shares, uint256 assets);

    constructor(address vaultAddress) {
        require(vaultAddress.code.length != 0, "EXIT_VAULT");
        vault = ExitVault(vaultAddress);
        address assetAddress = ExitVault(vaultAddress).asset();
        require(assetAddress != vaultAddress && assetAddress.code.length != 0, "EXIT_ASSET");
        asset = ExitToken(assetAddress);
    }

    function redeem(uint128 shares, uint128 minimumAssets, uint64 deadline, bytes32 operationRef)
        external returns (uint256 assets)
    {
        require(!entered, "EXIT_REENTRANCY");
        require(shares != 0 && minimumAssets != 0 && operationRef != bytes32(0), "EXIT_INTENT");
        require(block.timestamp <= deadline, "EXIT_DEADLINE");
        require(!used[msg.sender][operationRef], "EXIT_REPLAY");
        entered = true;
        used[msg.sender][operationRef] = true;
        uint256 sharesBefore = vault.balanceOf(address(this));
        uint256 assetsBefore = asset.balanceOf(msg.sender);
        require(vault.transferFrom(msg.sender, address(this), shares), "EXIT_SHARE_TRANSFER");
        require(vault.balanceOf(address(this)) == sharesBefore + shares, "EXIT_EXACT_SHARES");
        assets = vault.redeem(shares, msg.sender, address(this));
        require(assets >= minimumAssets, "EXIT_MINIMUM");
        require(asset.balanceOf(msg.sender) == assetsBefore + assets, "EXIT_EXACT_ASSETS");
        require(vault.balanceOf(address(this)) == sharesBefore, "EXIT_NO_RETAINED_SHARES");
        entered = false;
        emit Redeemed(msg.sender, operationRef, shares, assets);
    }
}
