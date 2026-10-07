// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
import "../ExperimentalObserverEscrow.sol";

/// @notice Deliberately incomplete consumption baseline used ONLY by local tests.
/// It still has strong signed domains, fixed payees, deadlines and per-input replay
/// protection. Two separately authorized input IDs can reuse one delivery pair.
contract NaiveObserverEscrow is ObserverEscrowBase {
    constructor(address observer_, uint32 policyVersion_) ObserverEscrowBase(observer_, policyVersion_) {}
    function _consume(bytes32, bytes32) internal pure override {}
}

contract TestRevertingPayee {
    receive() external payable { revert("TEST_PAYEE_REJECTS"); }
    function openInput(address escrow, bytes32 id, address solver, bytes32 terms, uint64 executeBy, uint64 claimBy) external payable {
        ObserverEscrowBase(escrow).open{value: msg.value}(id, solver, terms, executeBy, claimBy);
    }
    function requestRefund(address escrow, bytes32 id) external { ObserverEscrowBase(escrow).refund(id); }
}

contract TestReenteringPayee {
    address public target;
    bytes public payload;
    uint256 public received;
    uint256 public attempts;
    bool public reentrySucceeded;
    function configure(address target_, bytes calldata payload_) external { target = target_; payload = payload_; }
    receive() external payable {
        received += msg.value;
        attempts += 1;
        (reentrySucceeded,) = target.call(payload);
    }
}
