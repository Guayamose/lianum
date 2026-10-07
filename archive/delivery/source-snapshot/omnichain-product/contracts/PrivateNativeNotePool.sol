// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

interface IPrivateNativeNoteVerifier {
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool);
}

/// @notice LOCAL RESEARCH ONLY. A bounded, ETH-funded note authority whose
/// immutable circuits must enforce authorization, typed origins, membership,
/// conservation, native certificates and disjoint epoch-aligned cutoffs.
/// No foreign consensus, anonymity set, native rollback or issuer honesty is
/// established by this contract. Never deploy with a mock verifier as evidence.
contract PrivateNativeNotePool {
    uint256 public constant TREE_DEPTH = 6;
    uint256 public constant CAPACITY = 64;
    uint256 public constant EPOCH_SECONDS = 600;

    bytes32 public immutable deploymentDomain;
    bytes32 public immutable scope;
    bytes32 public immutable policy;
    IPrivateNativeNoteVerifier public immutable reserveVerifier;
    IPrivateNativeNoteVerifier public immutable fulfillVerifier;
    IPrivateNativeNoteVerifier public immutable refundVerifier;
    IPrivateNativeNoteVerifier public immutable withdrawVerifier;

    // Heap indexing: root = 1, leaves = 64..127; index 0 is unused and zero.
    bytes32[128] private nodes;
    bytes32[64] private spentEntries;
    bytes32[64] private solEffectEntries;
    bytes32[64] private btcEffectEntries;
    uint32 public leafCount;
    uint32 public spentCount; // Also the append-only spent-list sequence.
    uint32 public solEffectCount;
    uint32 public btcEffectCount;
    uint32 public liveReservations;
    uint32 public liveOutputNotes;
    uint64 public stateSequence;
    bytes32 public currentRoot;
    bytes32 public spentDigest;
    bytes32 public solEffectDigest;
    bytes32 public btcEffectDigest;
    mapping(bytes32 => bool) public admissions;
    mapping(bytes32 => bool) public acceptedRoots;
    mapping(bytes32 => bool) public insertedCommitments;
    mapping(bytes32 => bool) public spentNullifiers;
    mapping(bytes32 => bool) public spentSolEffects;
    mapping(bytes32 => bool) public spentBtcEffects;
    uint256 private entered;

    // No owner/graph/reservation identifiers. Commitments and nullifiers already
    // occur in calldata; the event anchors complete successful state transitions.
    event StateAdvanced(uint64 indexed sequence, bytes32 root, bytes32 spent, uint32 leaves, uint32 consumed);
    event Withdrawal(address indexed recipient, uint64 amount, bytes32 nullifier);

    modifier nonReentrant() {
        require(entered == 0, "REENTRANCY");
        entered = 1;
        _;
        entered = 0;
    }

    constructor(
        bytes32 deploymentDomain_, bytes32 policy_, address reserve_, address fulfill_, address refund_, address withdraw_
    ) {
        require(deploymentDomain_ != bytes32(0) && policy_ != bytes32(0), "CONFIG_DOMAIN");
        require(reserve_.code.length != 0 && fulfill_.code.length != 0 && refund_.code.length != 0 && withdraw_.code.length != 0, "CONFIG_VERIFIER");
        deploymentDomain = deploymentDomain_;
        // Full-width chain ID and this actual deployment address bind the proof
        // domain; no caller-selected scope masquerades as a chain-bound scope.
        scope = sha256(abi.encodePacked(bytes1(0x05), block.chainid, address(this), deploymentDomain_));
        policy = policy_;
        reserveVerifier = IPrivateNativeNoteVerifier(reserve_);
        fulfillVerifier = IPrivateNativeNoteVerifier(fulfill_);
        refundVerifier = IPrivateNativeNoteVerifier(refund_);
        withdrawVerifier = IPrivateNativeNoteVerifier(withdraw_);
        // Zero leaves are implicit. Compute every internal empty-subtree node.
        for (uint256 i = CAPACITY - 1; i > 0; --i) nodes[i] = nodeHash(nodes[i * 2], nodes[i * 2 + 1]);
        currentRoot = nodes[1];
        acceptedRoots[currentRoot] = true;
        spentDigest = _spentDigest();
        solEffectDigest = _effectDigest(true);
        btcEffectDigest = _effectDigest(false);
    }

    /// @dev Ordered ABI (34 words): scope8, policy8, epoch1, amount1,
    /// output8, admissionTag8. The tag prevents repeated hidden origin seeds.
    function reserve(bytes calldata proof, bytes32[] calldata inputs) external payable nonReentrant {
        _common(inputs, 34);
        uint64 amount = _u64(inputs[17]);
        require(amount > 0 && msg.value == amount, "DEPOSIT_AMOUNT");
        bytes32 output = _digest(inputs, 18);
        bytes32 admissionTag = _digest(inputs, 26);
        require(admissionTag != bytes32(0) && !admissions[admissionTag], "ORIGIN_ALREADY_ADMITTED");
        _availableOutput(output);
        // Reserve BOTH terminal leaves and ALL three future note consumptions
        // before admission; further deposits cannot consume this headroom.
        _headroom(uint256(leafCount) + 1, spentCount, uint256(liveReservations) + 1, liveOutputNotes);
        require(reserveVerifier.verify(proof, inputs), "RESERVE_PROOF");
        admissions[admissionTag] = true;
        ++liveReservations;
        _append(output);
        _advance();
    }

    /// @dev Ordered ABI (65 words): scope8, policy8, epoch1, root8,
    /// nullifier8, effectSol8, effectBtc8, outputSol8, outputBtc8.
    function fulfill(bytes calldata proof, bytes32[] calldata inputs) external nonReentrant {
        _common(inputs, 65);
        _acceptedRoot(inputs);
        bytes32 nullifier = _digest(inputs, 25);
        bytes32 effectSol = _digest(inputs, 33);
        bytes32 effectBtc = _digest(inputs, 41);
        bytes32 outputSol = _digest(inputs, 49);
        bytes32 outputBtc = _digest(inputs, 57);
        _availableNullifier(nullifier);
        require(effectSol != bytes32(0) && !spentSolEffects[effectSol], "SOL_EFFECT_SPENT");
        require(effectBtc != bytes32(0) && !spentBtcEffects[effectBtc], "BTC_EFFECT_SPENT");
        _availableOutput(outputSol);
        _availableOutput(outputBtc);
        require(outputSol != outputBtc, "DUPLICATE_OUTPUT");
        require(liveReservations > 0, "NO_LIVE_RESERVATION");
        require(fulfillVerifier.verify(proof, inputs), "FULFILL_PROOF");
        --liveReservations;
        liveOutputNotes += 2;
        spentSolEffects[effectSol] = true;
        spentBtcEffects[effectBtc] = true;
        require(solEffectCount < CAPACITY && btcEffectCount < CAPACITY, "EFFECTS_FULL");
        solEffectEntries[solEffectCount++] = effectSol;
        btcEffectEntries[btcEffectCount++] = effectBtc;
        solEffectDigest = _effectDigest(true);
        btcEffectDigest = _effectDigest(false);
        _consume(nullifier);
        _append(outputSol);
        _append(outputBtc);
        _advance();
    }

    /// @dev Ordered ABI (41 words): scope8, policy8, epoch1, root8,
    /// nullifier8, outputRecovery8. The same reserve nullifier as fulfill.
    function refund(bytes calldata proof, bytes32[] calldata inputs) external nonReentrant {
        _common(inputs, 41);
        _acceptedRoot(inputs);
        bytes32 nullifier = _digest(inputs, 25);
        bytes32 output = _digest(inputs, 33);
        _availableNullifier(nullifier);
        _availableOutput(output);
        require(liveReservations > 0, "NO_LIVE_RESERVATION");
        require(refundVerifier.verify(proof, inputs), "REFUND_PROOF");
        --liveReservations;
        ++liveOutputNotes;
        _consume(nullifier);
        _append(output);
        _advance();
    }

    /// @dev Ordered ABI (39 words): scope8, policy8, epoch1, root8,
    /// nullifier8, amount1, recipient5 (big-endian range-checked u32 words).
    function withdraw(bytes calldata proof, bytes32[] calldata inputs) external nonReentrant {
        _common(inputs, 39);
        _acceptedRoot(inputs);
        bytes32 nullifier = _digest(inputs, 25);
        uint64 amount = _u64(inputs[33]);
        uint160 rawRecipient;
        for (uint256 i = 34; i < 39; ++i) rawRecipient = (rawRecipient << 32) | uint160(_u32(inputs[i]));
        address recipient = address(rawRecipient);
        require(amount > 0 && recipient != address(0), "WITHDRAWAL_TERMS");
        _availableNullifier(nullifier);
        require(liveOutputNotes > 0, "NO_LIVE_OUTPUT");
        require(withdrawVerifier.verify(proof, inputs), "WITHDRAW_PROOF");
        --liveOutputNotes;
        _consume(nullifier);
        _advance();
        // Failure reverts the consumption, count, digest, sequence and events.
        (bool sent,) = recipient.call{value: amount}("");
        require(sent, "WITHDRAWAL_FAILED");
        emit Withdrawal(recipient, amount, nullifier);
    }

    function nodeHash(bytes32 left, bytes32 right) public pure returns (bytes32) {
        return sha256(abi.encodePacked(bytes1(0x01), left, right));
    }

    function noteLeaves() external view returns (bytes32[64] memory result) {
        for (uint256 i = 0; i < CAPACITY; ++i) result[i] = nodes[CAPACITY + i];
    }

    function treeNodes() external view returns (bytes32[128] memory) { return nodes; }
    function spentList() external view returns (bytes32[64] memory) { return spentEntries; }
    function solEffectList() external view returns (bytes32[64] memory) { return solEffectEntries; }
    function btcEffectList() external view returns (bytes32[64] memory) { return btcEffectEntries; }

    /// @notice Effect absence statements must authenticate these current lists,
    /// not an owner-selected historical digest. Read at the same block as state.
    function canonicalEffects() external view returns (
        uint64 sequence, bytes32 solDigest, bytes32 btcDigest, uint32 solCount, uint32 btcCount,
        bytes32[64] memory solEntries, bytes32[64] memory btcEntries
    ) {
        return (stateSequence, solEffectDigest, btcEffectDigest, solEffectCount, btcEffectCount, solEffectEntries, btcEffectEntries);
    }

    /// @notice One eth_call snapshot suitable for independent current-state
    /// readiness reconstruction. Historical roots are not readiness authority.
    function canonicalState() external view returns (
        bytes32 root, bytes32 digest, uint64 sequence, uint32 leaves, uint32 consumed,
        uint32 reservations, uint32 outputs, bytes32[64] memory commitments, bytes32[64] memory nullifiers
    ) {
        for (uint256 i = 0; i < CAPACITY; ++i) commitments[i] = nodes[CAPACITY + i];
        return (currentRoot, spentDigest, stateSequence, leafCount, spentCount, liveReservations, liveOutputNotes, commitments, spentEntries);
    }

    function _common(bytes32[] calldata inputs, uint256 size) private view {
        require(inputs.length == size, "PUBLIC_INPUT_LENGTH");
        require(_digest(inputs, 0) == scope && _digest(inputs, 8) == policy, "PUBLIC_DOMAIN");
        require(uint256(_u64(inputs[16])) == block.timestamp / EPOCH_SECONDS, "STALE_EPOCH");
    }

    function _acceptedRoot(bytes32[] calldata inputs) private view {
        require(acceptedRoots[_digest(inputs, 17)], "UNKNOWN_ROOT");
    }

    function _u32(bytes32 value) private pure returns (uint32) {
        require(uint256(value) <= type(uint32).max, "PUBLIC_U32");
        return uint32(uint256(value));
    }

    function _u64(bytes32 value) private pure returns (uint64) {
        require(uint256(value) <= type(uint64).max, "PUBLIC_U64");
        return uint64(uint256(value));
    }

    function _digest(bytes32[] calldata inputs, uint256 offset) private pure returns (bytes32) {
        uint256 result;
        for (uint256 i = 0; i < 8; ++i) result = (result << 32) | _u32(inputs[offset + i]);
        return bytes32(result);
    }

    function _availableOutput(bytes32 output) private view {
        require(output != bytes32(0) && !insertedCommitments[output], "OUTPUT_ALREADY_INSERTED");
    }

    function _availableNullifier(bytes32 nullifier) private view {
        require(nullifier != bytes32(0) && !spentNullifiers[nullifier], "NOTE_ALREADY_SPENT");
    }

    function _append(bytes32 commitment) private {
        require(leafCount < CAPACITY, "TREE_FULL");
        _availableOutput(commitment);
        insertedCommitments[commitment] = true;
        uint256 index = CAPACITY + leafCount;
        ++leafCount;
        nodes[index] = commitment;
        while (index > 1) {
            index /= 2;
            nodes[index] = nodeHash(nodes[index * 2], nodes[index * 2 + 1]);
        }
    }

    function _consume(bytes32 nullifier) private {
        require(spentCount < CAPACITY, "SPENT_FULL");
        _availableNullifier(nullifier);
        spentNullifiers[nullifier] = true;
        spentEntries[spentCount] = nullifier;
        ++spentCount;
        spentDigest = _spentDigest();
    }

    /// @dev SHA256(0x02 || scope32 || count:u32be || 64 padded bytes32 entries).
    /// Fixed length is 2085 bytes; padded entries are storage-default zero.
    function _spentDigest() private view returns (bytes32) {
        return sha256(abi.encodePacked(bytes1(0x02), scope, spentCount, spentEntries));
    }

    /// @dev Same fixed 2085-byte framing as spent state, typed 0x03/0x04.
    function _effectDigest(bool sol) private view returns (bytes32) {
        if (sol) return sha256(abi.encodePacked(bytes1(0x03), scope, solEffectCount, solEffectEntries));
        return sha256(abi.encodePacked(bytes1(0x04), scope, btcEffectCount, btcEffectEntries));
    }

    function _headroom(uint256 leaves, uint256 consumed, uint256 reservations, uint256 outputs) private pure {
        require(leaves + 2 * reservations <= CAPACITY, "TREE_HEADROOM");
        require(consumed + 3 * reservations + outputs <= CAPACITY, "SPENT_HEADROOM");
    }

    function _advance() private {
        _headroom(leafCount, spentCount, liveReservations, liveOutputNotes);
        currentRoot = nodes[1];
        acceptedRoots[currentRoot] = true;
        ++stateSequence;
        emit StateAdvanced(stateSequence, currentRoot, spentDigest, leafCount, spentCount);
    }
}
