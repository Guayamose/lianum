// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @notice Fictitious fixed-supply local test units only. No mint, burn, fee,
/// rebasing, callbacks, owner, proxy, upgrade or administrative access exists.
contract PrivateAssetTestToken {
    string public constant name = "Private Asset Local Test Token";
    string public constant symbol = "PALT";
    uint8 public constant decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(uint256 supply) {
        require(block.chainid == 31337 && supply > 0, "LOCAL_TEST_ASSET_ONLY");
        totalSupply = supply;
        balanceOf[msg.sender] = supply;
        emit Transfer(address(0), msg.sender, supply);
    }
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }
    function transfer(address recipient, uint256 amount) external returns (bool) {
        _transfer(msg.sender, recipient, amount);
        return true;
    }
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool) {
        uint256 permitted = allowance[sender][msg.sender];
        require(permitted >= amount, "TOKEN_ALLOWANCE");
        if (permitted != type(uint256).max) allowance[sender][msg.sender] = permitted - amount;
        _transfer(sender, recipient, amount);
        return true;
    }
    function _transfer(address sender, address recipient, uint256 amount) private {
        require(recipient != address(0) && balanceOf[sender] >= amount, "TOKEN_TRANSFER");
        balanceOf[sender] -= amount;
        balanceOf[recipient] += amount;
        emit Transfer(sender, recipient, amount);
    }
}
