// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
/// Matched negative control only: trusts native result existence but omits the
/// dependency relation. Never use this contract as the application authority.
contract NaiveTripleObserverEscrow {
    address public immutable observer;
    address public immutable solver;
    bool public paid;
    constructor(address observer_, address solver_) payable { observer=observer_; solver=solver_; }
    function claim(bytes32 solSignatureA, bytes32 solSignatureB, bytes32 btcTxid, bool solSuccess, bool btcConfirmed) external {
        require(msg.sender==observer && !paid, "STATE_OBSERVER");
        require((solSignatureA!=0 || solSignatureB!=0) && btcTxid!=0 && solSuccess && btcConfirmed, "RESULTS");
        paid=true;
        (bool ok,)=solver.call{value:address(this).balance}(""); require(ok,"PAYMENT");
    }
}
