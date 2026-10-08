// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
import "./NativeClaimToken.sol";

/// @notice A distinct USDC SPL claim, denominated in the mint's six decimals.
/// Gateway-only mint/burn and ordinary ERC20 behavior are inherited unchanged.
contract NativeSplClaimTokenV1 is NativeClaimToken {
    constructor(address fixedGateway) NativeClaimToken(fixedGateway, 2) {
        name = "Custodial USDC SPL Claim";
        symbol = "cUSDC";
        decimals = 6;
    }
}
