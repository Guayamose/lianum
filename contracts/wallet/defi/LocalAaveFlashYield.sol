// SPDX-License-Identifier: MIT
pragma solidity ^0.8.37;

interface LocalAavePool {
    function flashLoanSimple(address receiver, address asset, uint256 amount, bytes calldata params, uint16 referral) external;
}
interface LocalAaveToken {
    function balanceOf(address owner) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

/// Generates genuine, publicly paid Pool liquidity-index yield in a fresh local
/// fixture. It neither mints underlying nor certifies a private note or APY.
contract LocalAaveFlashYield {
    LocalAavePool public immutable pool;
    LocalAaveToken public immutable asset;
    address public immutable sender;
    uint256 public constant AMOUNT = 100_000_000;
    uint256 public constant PREMIUM = 90_000; // Pool premium fixed at 9 bps.
    bool public used;
    bool private expecting;
    bool private called;
    event YieldPaid(uint256 assets, uint256 premium);
    constructor(address poolAddress, address assetAddress) {
        require(block.chainid == 31337 && poolAddress.code.length != 0 && assetAddress.code.length != 0, "LOCAL_AAVE_YIELD_ONLY");
        pool = LocalAavePool(poolAddress); asset = LocalAaveToken(assetAddress); sender = msg.sender;
    }
    function accrue() external {
        require(msg.sender == sender && !used && !expecting, "AAVE_YIELD_ONCE");
        require(asset.balanceOf(address(this)) == PREMIUM, "AAVE_EXACT_PUBLIC_PREMIUM");
        used = true; expecting = true;
        pool.flashLoanSimple(address(this), address(asset), AMOUNT, bytes(""), 0);
        require(called && asset.balanceOf(address(this)) == 0, "AAVE_YIELD_REPAID");
        require(asset.approve(address(pool), 0), "AAVE_YIELD_CLEAR_ALLOWANCE");
        expecting = false; emit YieldPaid(AMOUNT, PREMIUM);
    }
    function executeOperation(address borrowedAsset, uint256 amount, uint256 premium, address initiator, bytes calldata params) external returns (bool) {
        require(msg.sender == address(pool) && initiator == address(this) && borrowedAsset == address(asset), "AAVE_ORIGINAL_FLASH_CONTEXT");
        require(expecting && !called && amount == AMOUNT && premium == PREMIUM && params.length == 0, "AAVE_EXACT_FLASH_TERMS");
        require(asset.balanceOf(address(this)) == AMOUNT + PREMIUM, "AAVE_FLASH_REAL_FUNDS");
        called = true; require(asset.approve(address(pool), AMOUNT + PREMIUM), "AAVE_FLASH_EXACT_APPROVAL");
        return true;
    }
}
