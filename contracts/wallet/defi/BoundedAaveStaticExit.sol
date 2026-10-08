// SPDX-License-Identifier: MIT
pragma solidity ^0.8.37;
import "./BoundedMetaMorphoExit.sol";

/// Identical bounded ERC4626 exit checks, over the separately authenticated
/// official Aave static wrapper. The private EXIT remains verified by its owner.
contract BoundedAaveStaticExit is BoundedMetaMorphoExit {
    constructor(address staticToken) BoundedMetaMorphoExit(staticToken) {}
}
