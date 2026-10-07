// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @notice SYNTHETIC CONTRACT CONTROLS ONLY. Deliberately unsafe behavior fixture.
/// Never an accepted asset, verifier, deployment profile or proof of soundness.
contract PrivateAssetBehaviorToken {
    mapping(address => uint256) private balances;
    mapping(address => mapping(address => uint256)) public allowance;
    uint8 public transferMode;
    uint8 public transferFromMode;
    uint8 public balanceMode;
    address public attackTarget;
    bytes public attackData;
    bool public reentryBlocked;
    constructor() { require(block.chainid == 31337); balances[msg.sender] = 1_000_000; }
    function balanceOf(address who) external view returns (uint256) {
        if (balanceMode == 1) revert("FIXTURE_BALANCE");
        if (balanceMode == 2) assembly { return(0, 0) }
        if (balanceMode == 3) assembly { return(0, 1) }
        return balances[who];
    }
    function setModes(uint8 outMode, uint8 inMode, uint8 readMode) external {
        transferMode = outMode; transferFromMode = inMode; balanceMode = readMode;
    }
    function setBalance(address who, uint256 value) external { balances[who] = value; }
    function arm(address target, bytes calldata data) external { attackTarget = target; attackData = data; }
    function approve(address spender, uint256 amount) external returns (bool) { allowance[msg.sender][spender] = amount; return true; }
    function transfer(address recipient, uint256 amount) external returns (bool) { return _transfer(msg.sender, recipient, amount, transferMode); }
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool) {
        require(allowance[sender][msg.sender] >= amount, "FIXTURE_ALLOWANCE");
        allowance[sender][msg.sender] -= amount;
        return _transfer(sender, recipient, amount, transferFromMode);
    }
    function _transfer(address sender, address recipient, uint256 amount, uint8 mode) private returns (bool) {
        if (mode == 1) return false;
        if (mode == 2) revert("FIXTURE_TRANSFER");
        uint256 debit = mode == 7 ? amount + 1 : amount;
        uint256 credit = mode == 6 ? amount - 1 : mode == 8 ? amount + 1 : amount;
        require(balances[sender] >= debit, "FIXTURE_BALANCE_LOW");
        balances[sender] -= debit; balances[recipient] += credit;
        if (mode == 9 || mode == 10) {
            (bool ok, bytes memory result) = attackTarget.call(attackData);
            if (mode == 10) require(ok, "FIXTURE_REENTRY_REQUIRED");
            else {
                require(!ok && keccak256(result) == keccak256(abi.encodeWithSignature("Error(string)", "REENTRANCY")), "FIXTURE_REENTRY_UNEXPECTED");
                reentryBlocked = true;
            }
        }
        if (mode == 3) assembly { return(0, 0) }
        if (mode == 4) assembly { mstore(0, 2) return(0, 32) }
        if (mode == 5) assembly { mstore(0, 1) return(31, 1) }
        return true;
    }
}

contract PrivateAssetRejectNative {
    receive() external payable { revert("FIXTURE_REJECT_NATIVE"); }
}
contract PrivateAssetForwardNative {
    address payable public immutable sink;
    constructor(address payable sink_) { sink = sink_; }
    receive() external payable { (bool ok,) = sink.call{value: msg.value}(""); require(ok); }
}
contract PrivateAssetForceNative {
    constructor(address payable destination) payable { selfdestruct(destination); }
}
