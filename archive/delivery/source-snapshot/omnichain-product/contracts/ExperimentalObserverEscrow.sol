// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @notice EXPERIMENT ONLY. Transparent single-chain escrow; the observer is trusted
/// for truth, canonical effect identities, dependencies and foreign-chain finality.
/// This is not a foreign-chain verifier, ZK proof, or universal atomic settlement.
abstract contract ObserverEscrowBase {
    enum State { ABSENT, OPEN, PAID, REFUNDED }
    struct Input {
        address owner;
        address solver;
        uint128 amount;
        uint64 openedAt;
        uint64 executeBy;
        uint64 claimBy;
        bytes32 terms;
        State state;
    }
    address public immutable observer;
    uint32 public immutable policyVersion;
    mapping(bytes32 => Input) public inputs;
    uint256 private entered;
    bytes32 private constant DOMAIN_TYPE = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant CERT_TYPE = keccak256("Fulfillment(bytes32 escrowId,address solver,uint128 amount,bytes32 terms,uint32 policyVersion,uint64 executeBy,uint64 claimBy,uint64 observedAt,bytes32 effect0,bytes32 effect1)");
    uint256 private constant HALF_N = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    event Opened(bytes32 indexed escrowId, address indexed owner, address indexed solver, uint128 amount, bytes32 terms, uint64 executeBy, uint64 claimBy);
    event Paid(bytes32 indexed escrowId, bytes32 effect0, bytes32 effect1, bytes32 certificateDigest);
    event Refunded(bytes32 indexed escrowId);

    modifier nonReentrant() {
        require(entered == 0, "REENTRANCY");
        entered = 1;
        _;
        entered = 0;
    }

    constructor(address observer_, uint32 policyVersion_) {
        require(observer_ != address(0) && policyVersion_ != 0, "CONFIG");
        observer = observer_;
        policyVersion = policyVersion_;
    }

    function deriveInputId(address owner, bytes32 clientSalt) public pure returns (bytes32) {
        return keccak256(abi.encode(owner, clientSalt));
    }

    function open(bytes32 clientSalt, address solver, bytes32 terms, uint64 executeBy, uint64 claimBy) external payable nonReentrant {
        // Another owner cannot occupy this owner's ID by copying its public salt.
        bytes32 id = deriveInputId(msg.sender, clientSalt);
        require(clientSalt != bytes32(0) && inputs[id].state == State.ABSENT, "ID");
        require(solver != address(0) && terms != bytes32(0), "TERMS");
        require(msg.value > 0 && msg.value <= type(uint128).max, "AMOUNT");
        require(block.timestamp < executeBy && executeBy < claimBy, "DEADLINES");
        inputs[id] = Input(msg.sender, solver, uint128(msg.value), uint64(block.timestamp), executeBy, claimBy, terms, State.OPEN);
        emit Opened(id, msg.sender, solver, uint128(msg.value), terms, executeBy, claimBy);
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPE, keccak256("ExperimentalObserverEscrow"), keccak256("2"), block.chainid, address(this)));
    }

    function certificateDigest(bytes32 id, uint64 observedAt, bytes32 effect0, bytes32 effect1) public view returns (bytes32) {
        Input storage item = inputs[id];
        bytes32 structHash = keccak256(abi.encode(CERT_TYPE, id, item.solver, item.amount, item.terms, policyVersion, item.executeBy, item.claimBy, observedAt, effect0, effect1));
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    function claim(bytes32 id, uint64 observedAt, bytes32 effect0, bytes32 effect1, bytes calldata signature) external nonReentrant {
        Input storage item = inputs[id];
        require(item.state == State.OPEN, "STATE");
        require(block.timestamp < item.claimBy, "CLAIM_EXPIRED");
        require(observedAt >= item.openedAt && observedAt <= item.executeBy && observedAt <= block.timestamp, "OBSERVATION_TIME");
        require(effect0 != bytes32(0) && effect1 != bytes32(0) && effect0 != effect1, "EFFECTS");
        require(signature.length == 65, "SIGNATURE_LENGTH");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly ("memory-safe") {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        require((v == 27 || v == 28) && uint256(s) > 0 && uint256(s) <= HALF_N, "SIGNATURE_CANONICAL");
        bytes32 digest = certificateDigest(id, observedAt, effect0, effect1);
        require(ecrecover(digest, v, r, s) == observer, "SIGNER");
        _consume(effect0, effect1);
        item.state = State.PAID;
        emit Paid(id, effect0, effect1, digest);
        (bool sent,) = item.solver.call{value: item.amount}("");
        // Revert restores state AND effect consumption. No false paid state.
        require(sent, "PAYMENT_FAILED");
    }

    function refund(bytes32 id) external nonReentrant {
        Input storage item = inputs[id];
        require(item.state == State.OPEN && msg.sender == item.owner, "REFUND_STATE_OWNER");
        require(block.timestamp >= item.claimBy, "REFUND_EARLY");
        item.state = State.REFUNDED;
        emit Refunded(id);
        (bool sent,) = item.owner.call{value: item.amount}("");
        require(sent, "REFUND_FAILED");
    }

    function _consume(bytes32 effect0, bytes32 effect1) internal virtual;
}

contract ExperimentalObserverEscrow is ObserverEscrowBase {
    // Canonical effect tags MUST exclude escrow/graph identifiers. Scope is this
    // contract only. The observer is trusted not to alias one native effect.
    mapping(bytes32 => bool) public consumedEffect;

    constructor(address observer_, uint32 policyVersion_) ObserverEscrowBase(observer_, policyVersion_) {}

    function _consume(bytes32 effect0, bytes32 effect1) internal override {
        require(!consumedEffect[effect0] && !consumedEffect[effect1], "EFFECT_ALREADY_CONSUMED");
        consumedEffect[effect0] = true;
        consumedEffect[effect1] = true;
    }
}
