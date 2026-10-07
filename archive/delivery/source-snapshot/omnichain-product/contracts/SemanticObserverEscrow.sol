// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @notice EXPERIMENT ONLY: transparent EVM authority for a bounded signed relation.
/// Native evidence truth, canonical identities and finality remain observer trust.
/// This contract does not verify Solana/Bitcoin consensus or provide private proofs.
contract SemanticObserverEscrow {
    enum State { ABSENT, OPEN, PAID, REFUNDED, FROZEN }
    struct Terms {
        bytes32 intentHash;
        bytes32 solDomain;
        bytes32 btcDomain;
        bytes32 solRecipient;
        bytes32 btcRecipient;
        uint32 quoteVersion;
        uint128 protocolFee;
        uint128 solMin;
        uint128 solMax;
        uint128 solPriceNumerator;
        uint128 solPriceDenominator;
        uint128 btcPriceNumerator;
        uint128 btcPriceDenominator;
        uint128 btcMin;
        uint128 solFeeCap;
        uint128 btcFeeCap;
    }
    struct Result {
        uint8 stage;
        bytes32 effectTag;
        bytes32 chainDomain;
        bytes32 recipient;
        uint128 amount;
        uint128 fee;
        uint64 observedAt;
        bytes32 predecessor;
    }
    struct Input {
        address owner;
        address solver;
        uint128 amount;
        uint64 openedAt;
        uint64 executeBy;
        uint64 claimBy;
        bytes32 termsHash;
        State state;
        Terms terms;
    }

    address public immutable observer;
    uint32 public immutable policyVersion;
    mapping(bytes32 => Input) private inputs;
    mapping(bytes32 => bool) public consumedEffect;
    mapping(bytes32 => bool) public consumedInvalidation;
    mapping(bytes32 => bool) public disputed;
    uint256 private entered;
    bytes32 private constant DOMAIN_TYPE = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant RESULT_TYPE = keccak256("Result(bytes32 escrowId,bytes32 termsHash,uint32 policyVersion,uint32 resultVersion,uint8 stage,bytes32 effectTag,bytes32 chainDomain,bytes32 recipient,uint128 amount,uint128 fee,uint64 observedAt,bytes32 predecessor)");
    bytes32 private constant INVALIDATION_TYPE = keccak256("Invalidation(bytes32 escrowId,bytes32 lockDigest,bytes32 targetDigest,bytes32 reason,uint64 issuedAt,uint32 policyVersion)");
    uint256 private constant HALF_N = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    event Opened(bytes32 indexed escrowId, address indexed owner, address indexed solver, uint128 amount, bytes32 termsHash, bytes32 lockDigest);
    event Paid(bytes32 indexed escrowId, bytes32 solResultDigest, bytes32 btcResultDigest, bytes32 solEffectTag, bytes32 btcEffectTag);
    event Refunded(bytes32 indexed escrowId);
    event Invalidated(bytes32 indexed escrowId, bytes32 targetDigest, bytes32 reason, bytes32 invalidationDigest, State stateBefore, State stateAfter);

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

    function open(bytes32 clientSalt, address solver, Terms calldata terms, uint64 executeBy, uint64 claimBy) external payable nonReentrant {
        bytes32 id = deriveInputId(msg.sender, clientSalt);
        require(clientSalt != bytes32(0) && inputs[id].state == State.ABSENT, "ID");
        require(solver != address(0), "SOLVER");
        require(msg.value > terms.protocolFee && msg.value <= type(uint128).max, "INPUT_AMOUNT");
        require(block.timestamp < executeBy && executeBy < claimBy, "DEADLINES");
        require(terms.intentHash != bytes32(0) && terms.solDomain != bytes32(0) && terms.btcDomain != bytes32(0) && terms.solRecipient != bytes32(0) && terms.btcRecipient != bytes32(0), "COMMITMENTS");
        require(terms.quoteVersion == 1, "QUOTE_VERSION");
        require(terms.solMin > 0 && terms.solMax >= terms.solMin && terms.btcMin > 0, "QUOTE_RANGE");
        require(terms.solPriceNumerator > 0 && terms.solPriceDenominator > 0 && terms.btcPriceNumerator > 0 && terms.btcPriceDenominator > 0, "QUOTE_PRICE");
        _output(uint128(msg.value), terms, terms.solMin);
        inputs[id] = Input(msg.sender, solver, uint128(msg.value), uint64(block.timestamp), executeBy, claimBy, keccak256(abi.encode(terms)), State.OPEN, terms);
        emit Opened(id, msg.sender, solver, uint128(msg.value), inputs[id].termsHash, lockDigest(id));
    }

    function inputState(bytes32 id) external view returns (State) { return inputs[id].state; }
    function inputTermsHash(bytes32 id) external view returns (bytes32) { return inputs[id].termsHash; }
    function inputAmount(bytes32 id) external view returns (uint128) { return inputs[id].amount; }

    function lockDigest(bytes32 id) public view returns (bytes32) {
        Input storage item = inputs[id];
        require(item.state != State.ABSENT, "ABSENT_INPUT");
        return keccak256(abi.encode(keccak256("PAEG_SEMANTIC_LOCK_V3"), block.chainid, address(this), id, item.owner, item.solver, item.amount, item.termsHash, item.openedAt, item.executeBy, item.claimBy));
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPE, keccak256("SemanticObserverEscrow"), keccak256("3"), block.chainid, address(this)));
    }

    function _typed(bytes32 structHash) private view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    function resultDigest(bytes32 id, Result calldata result) public view returns (bytes32) {
        return _typed(keccak256(abi.encode(RESULT_TYPE, id, inputs[id].termsHash, policyVersion, uint32(3), result.stage, result.effectTag, result.chainDomain, result.recipient, result.amount, result.fee, result.observedAt, result.predecessor)));
    }

    function invalidationDigest(bytes32 id, bytes32 targetDigest, bytes32 reason, uint64 issuedAt) public view returns (bytes32) {
        return _typed(keccak256(abi.encode(INVALIDATION_TYPE, id, lockDigest(id), targetDigest, reason, issuedAt, policyVersion)));
    }

    function _authenticate(bytes32 digest, bytes calldata signature) private view {
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
        require(ecrecover(digest, v, r, s) == observer, "SIGNER");
    }

    function _output(uint128 inputAmount_, Terms memory terms, uint128 solAmount) private pure returns (uint128) {
        require(solAmount >= terms.solMin && solAmount <= terms.solMax, "SOL_RANGE");
        uint256 product = uint256(solAmount) * terms.solPriceNumerator;
        uint256 cost = product / terms.solPriceDenominator;
        if (product % terms.solPriceDenominator != 0) cost += 1;
        require(uint256(inputAmount_) >= uint256(terms.protocolFee) + cost, "RESIDUAL_BUDGET");
        uint256 output = (uint256(inputAmount_) - terms.protocolFee - cost) * terms.btcPriceDenominator / terms.btcPriceNumerator;
        require(output >= terms.btcMin && output <= type(uint128).max, "BTC_BOUND");
        return uint128(output);
    }

    function expectedOutput(bytes32 id, uint128 solAmount) external view returns (uint128) {
        require(inputs[id].state != State.ABSENT, "ABSENT_INPUT");
        return _output(inputs[id].amount, inputs[id].terms, solAmount);
    }

    function claim(bytes32 id, Result calldata sol, Result calldata btc, bytes calldata solSignature, bytes calldata btcSignature) external nonReentrant {
        Input storage item = inputs[id];
        require(item.state == State.OPEN, "STATE");
        require(block.timestamp < item.claimBy, "CLAIM_EXPIRED");
        require(sol.stage == 1 && btc.stage == 2, "STAGE");
        require(sol.chainDomain == item.terms.solDomain && btc.chainDomain == item.terms.btcDomain, "CHAIN_DOMAIN");
        require(sol.recipient == item.terms.solRecipient && btc.recipient == item.terms.btcRecipient, "RECIPIENT");
        require(sol.fee <= item.terms.solFeeCap && btc.fee <= item.terms.btcFeeCap, "FEE_CAP");
        require(sol.observedAt >= item.openedAt && btc.observedAt >= sol.observedAt && sol.observedAt <= item.executeBy && btc.observedAt <= item.executeBy && btc.observedAt <= block.timestamp, "OBSERVATION_TIME");
        bytes32 solDigest = resultDigest(id, sol);
        bytes32 btcDigest = resultDigest(id, btc);
        _authenticate(solDigest, solSignature);
        _authenticate(btcDigest, btcSignature);
        require(sol.predecessor == lockDigest(id), "LOCK_PREDECESSOR");
        require(btc.predecessor == solDigest, "SOL_PREDECESSOR");
        require(btc.amount == _output(item.amount, item.terms, sol.amount), "BTC_ARITHMETIC");
        require(sol.effectTag != bytes32(0) && btc.effectTag != bytes32(0) && sol.effectTag != btc.effectTag, "EFFECTS");
        require(!consumedEffect[sol.effectTag] && !consumedEffect[btc.effectTag], "EFFECT_ALREADY_CONSUMED");
        consumedEffect[sol.effectTag] = true;
        consumedEffect[btc.effectTag] = true;
        item.state = State.PAID;
        emit Paid(id, solDigest, btcDigest, sol.effectTag, btc.effectTag);
        (bool sent,) = item.solver.call{value: item.amount}("");
        require(sent, "PAYMENT_FAILED");
    }

    function invalidate(bytes32 id, bytes32 targetDigest, bytes32 reason, uint64 issuedAt, bytes calldata signature) external nonReentrant {
        Input storage item = inputs[id];
        require(item.state != State.ABSENT, "ABSENT_INPUT");
        require(targetDigest != bytes32(0) && reason != bytes32(0), "INVALIDATION_CONTEXT");
        require(issuedAt >= item.openedAt && issuedAt <= block.timestamp, "INVALIDATION_TIME");
        bytes32 digest = invalidationDigest(id, targetDigest, reason, issuedAt);
        _authenticate(digest, signature);
        require(!consumedInvalidation[digest], "INVALIDATION_REPLAY");
        consumedInvalidation[digest] = true;
        disputed[id] = true;
        State previous = item.state;
        if (previous == State.OPEN) item.state = State.FROZEN;
        // An already paid input stays paid. No clawback or invented compensation.
        emit Invalidated(id, targetDigest, reason, digest, previous, item.state);
    }

    function refund(bytes32 id) external nonReentrant {
        Input storage item = inputs[id];
        require((item.state == State.OPEN || item.state == State.FROZEN) && msg.sender == item.owner, "REFUND_STATE_OWNER");
        require(block.timestamp >= item.claimBy, "REFUND_EARLY");
        item.state = State.REFUNDED;
        emit Refunded(id);
        (bool sent,) = item.owner.call{value: item.amount}("");
        require(sent, "REFUND_FAILED");
    }
}
