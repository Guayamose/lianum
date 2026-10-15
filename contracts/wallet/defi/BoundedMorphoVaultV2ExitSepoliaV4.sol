// SPDX-License-Identifier: MIT
pragma solidity ^0.8.37;

interface SepoliaMorphoV2ExitToken {
    function balanceOf(address owner) external view returns (uint256);
    function transferFrom(address owner, address receiver, uint256 amount) external returns (bool);
}

interface SepoliaMorphoV2ExitVault is SepoliaMorphoV2ExitToken {
    function asset() external view returns (address);
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);
}

/// Official Sepolia vault-share redemption after a separately authorized W39.
/// Only msg.sender's approved shares are spent. The receiver must be fixed in
/// the Original device consent and protected Native signing scope before use.
/// The router itself does not validate a device PoP; the temporary share holder
/// and common operator remain a trust assumption. There is no private credit or
/// atomic W39/D27 conversion; a later private USDC deposit needs its own D27.
contract BoundedMorphoVaultV2ExitSepoliaV4 {
    SepoliaMorphoV2ExitVault public immutable vault;
    SepoliaMorphoV2ExitToken public immutable asset;
    mapping(address => mapping(bytes32 => bool)) public used;
    bool private entered;

    event Redeemed(address indexed owner, address indexed receiver, bytes32 indexed operationRef, uint256 shares, uint256 assets);

    constructor() {
        require(block.chainid == 11155111, "MORPHO_V2_SEPOLIA_EXIT_ONLY");
        address vaultAddress = address(bytes20(hex"96923a7fa4fd47f937a4948092d79bb3d46c03fe"));
        require(vaultAddress.code.length != 0, "EXIT_VAULT");
        vault = SepoliaMorphoV2ExitVault(vaultAddress);
        address assetAddress = SepoliaMorphoV2ExitVault(vaultAddress).asset();
        require(assetAddress != vaultAddress && assetAddress.code.length != 0, "EXIT_ASSET");
        require(assetAddress == address(bytes20(hex"1c7d4b196cb0c7b01d743fbc6116a902379c7238")), "MORPHO_V2_SEPOLIA_EXIT_ASSET");
        asset = SepoliaMorphoV2ExitToken(assetAddress);
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
