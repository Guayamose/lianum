// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @notice Fixed-supply-accounting ERC20 for custodial native claims, not native
/// self-custody. No owner, upgrade, callback, fee, rebase or public mint exists.
contract NativeClaimToken {
    error TokenConfiguration();
    error TokenAllowance();
    error OnlyGatewayMint();
    error OnlyGatewayBurn();
    error TokenZeroRecipient();

    string public name;
    string public symbol;
    uint8 public decimals;
    address public gateway;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    // Constructor-only storage keeps runtime identical at prospective addresses.
    constructor(address fixedGateway, uint8 family) {
        if (!(fixedGateway != address(0) && (family == 1 || family == 2))) revert TokenConfiguration();
        gateway = fixedGateway;
        name = family == 1 ? "Custodial Bitcoin Claim" : "Custodial Solana Claim";
        symbol = family == 1 ? "cBTC" : "cSOL";
        decimals = family == 1 ? 8 : 9;
    }
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount); return true;
    }
    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount); return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 available = allowance[from][msg.sender];
        if (!(available >= amount)) revert TokenAllowance();
        allowance[from][msg.sender] = available - amount;
        emit Approval(from, msg.sender, available - amount);
        _transfer(from, to, amount); return true;
    }
    function mintToGateway(uint64 amount) external {
        if (!(msg.sender == gateway && amount != 0)) revert OnlyGatewayMint();
        totalSupply += amount; balanceOf[gateway] += amount;
        emit Transfer(address(0), gateway, amount);
    }
    // The fixed gateway calls this only from the balance holder's redemption entry.
    function burnForTicket(address holder, uint64 amount) external {
        if (!(msg.sender == gateway && holder != address(0) && amount != 0)) revert OnlyGatewayBurn();
        balanceOf[holder] -= amount; totalSupply -= amount;
        emit Transfer(holder, address(0), amount);
    }
    function _transfer(address from, address to, uint256 amount) private {
        if (!(to != address(0))) revert TokenZeroRecipient();
        balanceOf[from] -= amount; balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
