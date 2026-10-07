// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @notice Local transparent test baseline. Bitcoin truth/finality is trusted to
/// observer. Profile 2 only freezes a preparation manifest and CANNOT settle.
contract LocalBitcoinDeliveryEscrow {
    enum State { ABSENT, OPEN, PAID, REFUNDED }
    struct Reservation {
        address owner; address solver; uint256 amount; bytes32 orderHash;
        bytes32 scriptHash; uint64 sats; uint64 executeBy; uint64 claimBy;
        uint64 openedAt; uint8 profile; State state;
    }
    address public immutable observer;
    bytes32 public immutable bitcoinGenesis;
    uint32 public constant MIN_CONFIRMATIONS = 6;
    mapping(bytes32 => Reservation) public reservations;
    mapping(bytes32 => bool) public consumedEffect;
    uint256 private entered;
    event Locked(bytes32 indexed id, address indexed owner, bytes32 orderHash, uint8 profile, uint256 amount);
    event Paid(bytes32 indexed id, bytes32 indexed effect, bytes32 txid, uint32 vout);
    event Refunded(bytes32 indexed id);
    modifier guarded() { require(entered == 0, "REENTRANCY"); entered = 1; _; entered = 0; }
    constructor(address observer_, bytes32 genesis_) {
        require(observer_ != address(0) && genesis_ != 0, "CONFIG"); observer = observer_; bitcoinGenesis = genesis_;
    }
    function deriveId(address owner, bytes32 salt) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), owner, salt));
    }
    function reserve(bytes32 salt, bytes32 orderHash, address solver, bytes32 scriptHash,
        uint64 sats, uint64 executeBy, uint64 claimBy, uint8 profile) external payable guarded {
        bytes32 id = deriveId(msg.sender, salt);
        require(salt != 0 && reservations[id].state == State.ABSENT, "ID");
        require(orderHash != 0 && msg.value > 0 && solver != address(0), "TERMS");
        require(block.timestamp < executeBy && executeBy < claimBy, "DEADLINES");
        require(profile == 1 || profile == 2, "PROFILE");
        if (profile == 1) require(scriptHash != 0 && sats > 0, "DELIVERY_TERMS");
        else require(scriptHash == 0 && sats == 0, "PREPARATION_ONLY");
        reservations[id] = Reservation(msg.sender, solver, msg.value, orderHash, scriptHash,
            sats, executeBy, claimBy, uint64(block.timestamp), profile, State.OPEN);
        emit Locked(id, msg.sender, orderHash, profile, msg.value);
    }
    function effectId(bytes32 txid, uint32 vout) public view returns (bytes32) {
        return keccak256(abi.encode(bitcoinGenesis, txid, vout));
    }
    function claim(bytes32 id, bytes32 txid, uint32 vout, bytes32 scriptHash, uint64 sats,
        uint32 confirmations, uint64 observedAt) external guarded {
        require(msg.sender == observer, "OBSERVER");
        Reservation storage r = reservations[id];
        require(r.state == State.OPEN && r.profile == 1, "STATE_PROFILE");
        require(block.timestamp < r.claimBy, "CLAIM_EXPIRED");
        require(observedAt >= r.openedAt && observedAt <= r.executeBy && observedAt <= block.timestamp, "OBSERVED_TIME");
        require(txid != 0 && scriptHash == r.scriptHash && sats == r.sats && confirmations >= MIN_CONFIRMATIONS, "DELIVERY");
        bytes32 effect = effectId(txid, vout); require(!consumedEffect[effect], "EFFECT_CONSUMED");
        consumedEffect[effect] = true; r.state = State.PAID;
        emit Paid(id, effect, txid, vout);
        (bool sent,) = r.solver.call{value: r.amount}(""); require(sent, "PAYMENT_FAILED");
    }
    function refund(bytes32 id) external guarded {
        Reservation storage r = reservations[id];
        require(r.state == State.OPEN && msg.sender == r.owner, "STATE_OWNER");
        require(block.timestamp >= r.claimBy, "REFUND_EARLY");
        r.state = State.REFUNDED; emit Refunded(id);
        (bool sent,) = r.owner.call{value: r.amount}(""); require(sent, "REFUND_FAILED");
    }
}
