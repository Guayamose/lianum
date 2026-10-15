// SPDX-License-Identifier: MIT
pragma solidity ^0.8.37;

interface SepoliaAaveExitToken {
    function balanceOf(address owner) external view returns (uint256);
    function transferFrom(address owner, address receiver, uint256 amount) external returns (bool);
}

interface SepoliaAaveExitVault is SepoliaAaveExitToken {
    function asset() external view returns (address);
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);
}

/// Official Sepolia static-share redemption after a separately authorized W39.
/// Only msg.sender's approved shares are spent. The receiver must be fixed in
/// the Original device consent and protected Native signing scope before use.
/// The router itself does not validate a device PoP; the temporary share holder
/// and common operator remain a trust assumption. There is no private credit or
/// atomic W39/D27 conversion; a later private USDC deposit needs its own D27.
contract BoundedAaveStaticExitSepoliaV4 {
    SepoliaAaveExitVault public immutable vault;
    SepoliaAaveExitToken public immutable asset;
    mapping(address => mapping(bytes32 => bool)) public used;
    bool private entered;

    event Redeemed(address indexed owner, address indexed receiver, bytes32 indexed operationRef, uint256 shares, uint256 assets);

    constructor() {
        require(block.chainid == 11155111, "AAVE_SEPOLIA_EXIT_ONLY");
        address vaultAddress = 0x8A88124522dbBF1E56352ba3DE1d9F78C143751e;
        require(vaultAddress.code.length != 0, "EXIT_VAULT");
        vault = SepoliaAaveExitVault(vaultAddress);
        address assetAddress = SepoliaAaveExitVault(vaultAddress).asset();
        require(assetAddress != vaultAddress && assetAddress.code.length != 0, "EXIT_ASSET");
        require(assetAddress == 0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8, "AAVE_SEPOLIA_EXIT_ASSET");
        asset = SepoliaAaveExitToken(assetAddress);
    }

    function redeem(uint128 shares, uint128 minimumAssets, uint64 deadline, bytes32 operationRef, address receiver)
        external returns (uint256 assets)
    {
        require(!entered, "EXIT_REENTRANCY");
        require(shares != 0 && minimumAssets != 0 && operationRef != bytes32(0), "EXIT_INTENT");
        require(receiver != address(0) && receiver != address(this) && receiver != address(vault), "EXIT_RECEIVER");
        require(block.timestamp <= deadline, "EXIT_DEADLINE");
        require(!used[msg.sender][operationRef], "EXIT_REPLAY");
        entered = true;
        used[msg.sender][operationRef] = true;
        uint256 sharesBefore = vault.balanceOf(address(this));
        uint256 assetsBefore = asset.balanceOf(receiver);
        require(vault.transferFrom(msg.sender, address(this), shares), "EXIT_SHARE_TRANSFER");
        require(vault.balanceOf(address(this)) == sharesBefore + shares, "EXIT_EXACT_SHARES");
        assets = vault.redeem(shares, receiver, address(this));
        require(assets >= minimumAssets, "EXIT_MINIMUM");
        require(asset.balanceOf(receiver) == assetsBefore + assets, "EXIT_EXACT_ASSETS");
        require(vault.balanceOf(address(this)) == sharesBefore, "EXIT_NO_RETAINED_SHARES");
        entered = false;
        emit Redeemed(msg.sender, receiver, operationRef, shares, assets);
    }
}
