// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

interface IPrivateNativeNoteVerifier {
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool);
}

/// @notice LOCAL RESEARCH ONLY. A bounded, ETH-funded note authority whose
/// immutable circuits must enforce authorization, typed origins, membership,
/// conservation, native certificates and disjoint epoch-aligned cutoffs.
/// Current-finality permits depend on two trusted authorities and timely inclusion.
/// No foreign consensus, anonymity set, native rollback or authority honesty is
/// established by this contract. Never deploy with a mock verifier as evidence.
// PC23 derives from the frozen PC18 assembly authority, SHA256:
// 8a41d0e76bd1f1d53b6690e1e052a180d23498125bb8d9964be060ecc5a186da.
// One tree, admission namespace, output-insertion set and canonical spent set.
// Type-4 free balances count in liveOutputNotes alongside existing type-2/3 notes.
contract PrivateWalletNativeNotePool {
    uint256 public constant TREE_DEPTH = 6;
    uint256 public constant CAPACITY = 64;
    uint256 public constant EPOCH_SECONDS = 600;
    uint64 public constant MAX_PERMIT_SECONDS = 30;
    bytes32 public constant FINALITY_PROFILE = sha256("PC16_CURRENT_OBSERVATION_AUTHORITY_V1");
    address public immutable solFinalityAuthority;
    address public immutable btcFinalityAuthority;
    mapping(uint8 => uint64) public authorityVersion;
    mapping(uint8 => mapping(bytes32 => bool)) public revokedEffects;
    // PC18_REVOCATION_BEGIN
    bytes32[64] private solRevokedEntries;
    uint32 public solRevokedCount;
    bytes32 public solRevokedDigest;
    bool public revocationCoverageHalted; // Permanent; an overflowed prefix is never complete.
    // PC18_REVOCATION_END

    struct Permit { uint64 observedAt; uint64 validUntil; }
    mapping(bytes32 => Permit) public finalityPermits;
    event FinalityPermitRecorded(uint8 indexed chain, bytes32 indexed effect, bytes32 indexed statement,
        uint64 version, uint64 observedAt, uint64 validUntil, bytes32 permitCommitment);
    event AdverseFactRecorded(uint8 indexed chain, bytes32 indexed effect, bytes32 evidence,
        uint64 newAuthorityVersion);


    bytes32 public immutable deploymentDomain;
    bytes32 public immutable scope;
    bytes32 public immutable policy;
    IPrivateNativeNoteVerifier public immutable reserveVerifier;
    IPrivateNativeNoteVerifier public immutable fulfillVerifier;
    IPrivateNativeNoteVerifier public immutable refundVerifier;
    IPrivateNativeNoteVerifier public immutable withdrawVerifier;
    IPrivateNativeNoteVerifier public immutable depositBalanceVerifier;
    IPrivateNativeNoteVerifier public immutable reserveFromNoteVerifier;
    IPrivateNativeNoteVerifier public immutable withdrawBalanceVerifier;

    // Heap indexing: root = 1, leaves = 64..127; index 0 is unused and zero.
    bytes32[128] private nodes;
    // PC18_HISTORY_BEGIN
    // Canonical accepted transition roots only; never intermediate _append roots.
    bytes32[65] private rootHistoryEntries;
    uint32 public rootHistoryCount;
    bytes32 public rootHistoryDigest;
    // PC18_HISTORY_END
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
        bytes32 deploymentDomain_, bytes32 policy_, address reserve_, address fulfill_, address refund_, address withdraw_,
        address solAuthority_, address btcAuthority_,
        address depositBalance_, address reserveFromNote_, address withdrawBalance_
    ) {
        require(deploymentDomain_ != bytes32(0) && policy_ != bytes32(0), "CONFIG_DOMAIN");
        require(reserve_.code.length != 0 && fulfill_.code.length != 0 && refund_.code.length != 0 && withdraw_.code.length != 0, "CONFIG_VERIFIER");
        require(depositBalance_.code.length != 0 && reserveFromNote_.code.length != 0 && withdrawBalance_.code.length != 0, "CONFIG_WALLET_VERIFIER");
        require(solAuthority_ != address(0) && btcAuthority_ != address(0) && solAuthority_ != btcAuthority_, "CONFIG_FINALITY_AUTHORITIES");
        solFinalityAuthority = solAuthority_;
        btcFinalityAuthority = btcAuthority_;
        authorityVersion[1] = 1;
        authorityVersion[2] = 1;
        deploymentDomain = deploymentDomain_;
        // Full-width chain ID and this actual deployment address bind the proof
        // domain; no caller-selected scope masquerades as a chain-bound scope.
        scope = sha256(abi.encodePacked(bytes1(0x05), block.chainid, address(this), deploymentDomain_));
        policy = policy_;
        reserveVerifier = IPrivateNativeNoteVerifier(reserve_);
        fulfillVerifier = IPrivateNativeNoteVerifier(fulfill_);
        refundVerifier = IPrivateNativeNoteVerifier(refund_);
        withdrawVerifier = IPrivateNativeNoteVerifier(withdraw_);
        depositBalanceVerifier = IPrivateNativeNoteVerifier(depositBalance_);
        reserveFromNoteVerifier = IPrivateNativeNoteVerifier(reserveFromNote_);
        withdrawBalanceVerifier = IPrivateNativeNoteVerifier(withdrawBalance_);
        // Zero leaves are implicit. Compute every internal empty-subtree node.
        for (uint256 i = CAPACITY - 1; i > 0; --i) nodes[i] = nodeHash(nodes[i * 2], nodes[i * 2 + 1]);
        currentRoot = nodes[1];
        _acceptCurrentRoot();
        spentDigest = _spentDigest();
        solEffectDigest = _effectDigest(true);
        btcEffectDigest = _effectDigest(false);
    // PC18_REVOCATION_BEGIN
        solRevokedDigest = _solRevokedDigest();
    // PC18_REVOCATION_END
    }

    /// @dev D26: scope8, policy8, epoch1, amount1, typed balance output8.
    /// Only the immutable D circuit can authorize type-4 commitments. There is
    /// deliberately no arbitrary commitment deposit, even for an existing owner.
    function depositBalance(bytes calldata proof, bytes32[] calldata inputs) external payable nonReentrant {
        _common(inputs, 26);
        require(!revocationCoverageHalted, "REVOCATION_COVERAGE_HALTED");
        uint64 amount = _u64(inputs[17]);
        require(amount > 0 && msg.value == amount, "DEPOSIT_AMOUNT");
        bytes32 output = _digest(inputs, 18);
        _availableOutput(output);
        _headroom(uint256(leafCount) + 1, spentCount, liveReservations, uint256(liveOutputNotes) + 1);
        require(depositBalanceVerifier.verify(proof, inputs), "DEPOSIT_BALANCE_PROOF");
        ++liveOutputNotes;
        _append(output);
        _advance();
    }

    /// @dev S74: scope8, policy8, epoch1, membershipRoot8, canonicalNF8,
    /// reserved8, type4Change8, admission8, baseRoot8, sequence1, finalPostRoot8.
    /// All three guards are public proof fields and input-owner signed. Never
    /// expose an unguarded S entry point or accept the reservation-only root.
    function reserveFromNoteGuarded(bytes calldata proof, bytes32[] calldata inputs) external nonReentrant {
        _common(inputs, 74);
        require(!revocationCoverageHalted, "REVOCATION_COVERAGE_HALTED");
        require(currentRoot == _digest(inputs, 57), "RESERVE_ROOT_CHANGED");
        require(stateSequence == _u64(inputs[65]), "RESERVE_SEQUENCE_CHANGED");
        _acceptedRoot(inputs);
        bytes32 nullifier = _digest(inputs, 25);
        bytes32 output = _digest(inputs, 33);
        bytes32 change = _digest(inputs, 41);
        bytes32 admissionTag = _digest(inputs, 49);
        _availableNullifier(nullifier);
        require(admissionTag != bytes32(0) && !admissions[admissionTag], "ORIGIN_ALREADY_ADMITTED");
        _availableOutput(output);
        _availableOutput(change);
        require(output != change, "DUPLICATE_OUTPUT");
        require(liveOutputNotes > 0, "NO_LIVE_OUTPUT");
        _headroom(uint256(leafCount) + 2, uint256(spentCount) + 1, uint256(liveReservations) + 1, liveOutputNotes);
        require(reserveFromNoteVerifier.verify(proof, inputs), "RESERVE_FROM_NOTE_PROOF");
        _consume(nullifier);
        admissions[admissionTag] = true;
        ++liveReservations;
        // Exactly one spendable input is consumed and one positive change note
        // created. The immutable circuit enforces value conservation and type.
        _append(output);
        _append(change);
        require(nodes[1] == _digest(inputs, 66), "RESERVE_POST_ROOT_MISMATCH");
        _advance();
    }

    /// @dev W39 layout matches legacy withdrawal; its independent immutable
    /// circuit permits only type 4 with the PC23 balance-withdraw signature.
    /// Both withdrawal methods and S consume the SAME canonical nullifier map.
    function withdrawBalance(bytes calldata proof, bytes32[] calldata inputs) external nonReentrant {
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
        require(withdrawBalanceVerifier.verify(proof, inputs), "WITHDRAW_BALANCE_PROOF");
        --liveOutputNotes;
        _consume(nullifier);
        _advance();
        (bool sent,) = recipient.call{value: amount}("");
        require(sent, "WITHDRAWAL_FAILED");
        emit Withdrawal(recipient, amount, nullifier);
    }

    /// @dev Ordered ABI (34 words): scope8, policy8, epoch1, amount1,
    /// output8, admissionTag8. The tag prevents repeated hidden origin seeds.
    /// Unguarded research entry point. Production funding uses reserveGuarded.
    function reserve(bytes calldata proof, bytes32[] calldata inputs) external payable nonReentrant {
        _reserve(proof, inputs);
        _advance();
    }

    /// @notice Atomically fund only the exact previously projected transition.
    /// The unchanged 34-word reserve proof still authenticates deposit terms.
    /// These transaction guards bind the caller's prepositioned authorization
    /// to its base state and resulting root; they do not admit a future root.
    /// Any failure reverts ETH, admissions, tree writes, counters and events.
    function reserveGuarded(
        bytes calldata proof, bytes32[] calldata inputs,
        bytes32 expectedRoot, uint64 expectedSequence, bytes32 expectedPostRoot
    ) external payable nonReentrant {
        require(currentRoot == expectedRoot, "RESERVE_ROOT_CHANGED");
        require(stateSequence == expectedSequence, "RESERVE_SEQUENCE_CHANGED");
        _reserve(proof, inputs);
        require(nodes[1] == expectedPostRoot, "RESERVE_POST_ROOT_MISMATCH");
        // Only the successful final root reaches acceptedRoots/rootHistory.
        _advance();
    }

    function _reserve(bytes calldata proof, bytes32[] calldata inputs) private {
        _common(inputs, 34);
    // PC18_REVOCATION_BEGIN
        require(!revocationCoverageHalted, "REVOCATION_COVERAGE_HALTED");
    // PC18_REVOCATION_END

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
        _requireCurrentPermit(1, effectSol, terminalStatement(inputs));
        _requireCurrentPermit(2, effectBtc, terminalStatement(inputs));
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

    /// @notice Complete ordered public statement, 1 + 65*32 bytes. The mode
    /// is fixed to fulfill by this domain and by exact public-input count.
    function terminalStatement(bytes32[] calldata inputs) public pure returns (bytes32) {
        require(inputs.length == 65, "PUBLIC_INPUT_LENGTH");
        return sha256(abi.encodePacked(bytes1(0x17), inputs));
    }

    /// @notice Canonical permit key framing: 0x16 | profile32 | chainId:u256be |
    /// this:20 | scope32 | policy32 | chain:u8 | effect32 | statement32 | version:u64be.
    /// The authority's EVM transaction authenticates all permit bytes and destination.
    function permitKey(uint8 chain, bytes32 effect, bytes32 statement, uint64 version) public view returns (bytes32) {
        require(chain == 1 || chain == 2, "FINALITY_CHAIN");
        return sha256(abi.encodePacked(bytes1(0x16), FINALITY_PROFILE, block.chainid,
            address(this), scope, policy, chain, effect, statement, version));
    }

    /// @notice A trusted current observation, NOT an on-chain foreign consensus proof.
    /// Authorities must verify the exact global proof before freshly observing the
    /// retained canonical native effect. Host observation alone cannot block a claim.
    function recordPermit(uint8 chain, bytes32 effect, bytes32 statement,
        uint64 version, uint64 observedAt, uint64 validUntil) external nonReentrant {
        _authority(chain);
    // PC18_REVOCATION_BEGIN
        require(!revocationCoverageHalted, "REVOCATION_COVERAGE_HALTED");
    // PC18_REVOCATION_END
        require(effect != bytes32(0) && statement != bytes32(0), "FINALITY_ZERO_BINDING");
        require(!revokedEffects[chain][effect], "FINALITY_REVOKED");
        require(version == authorityVersion[chain], "FINALITY_VERSION");
        require(observedAt <= block.timestamp && block.timestamp < validUntil &&
            validUntil > observedAt && validUntil - observedAt <= MAX_PERMIT_SECONDS, "FINALITY_LEASE");
        bytes32 key = permitKey(chain, effect, statement, version);
        require(finalityPermits[key].observedAt < observedAt, "FINALITY_PERMIT_REPLAY");
        finalityPermits[key] = Permit(observedAt, validUntil);
        emit FinalityPermitRecorded(chain, effect, statement, version, observedAt, validUntil,
            sha256(abi.encodePacked(key, observedAt, validUntil)));
    }

    /// @notice Permanent typed-effect invalidation. No administrative unrevocation.
    /// Advancing a chain-wide version also invalidates every earlier role permit;
    /// unrelated effects can be freshly reobserved and permitted at the new version.
    function recordAdverse(uint8 chain, bytes32 effect, bytes32 evidence) external nonReentrant {
        _authority(chain);
        require(effect != bytes32(0) && evidence != bytes32(0), "FINALITY_ZERO_BINDING");
        if (revokedEffects[chain][effect]) return; // Idempotent adverse retry; no further version bump.
        revokedEffects[chain][effect] = true;
        uint64 version = ++authorityVersion[chain];
        emit AdverseFactRecorded(chain, effect, evidence, version);
    // PC18_REVOCATION_BEGIN
        if (chain == 1) {
            if (solRevokedCount < CAPACITY) {
                solRevokedEntries[solRevokedCount++] = effect;
                solRevokedDigest = _solRevokedDigest();
            } else {
                // Preserve this adverse map bit/version even when the finite
                // list cannot include it. Never mistake the prefix for absence.
                revocationCoverageHalted = true;
            }
        }
        _advance(); // Atomic current-state sequence change for every NEW adverse fact.
    // PC18_REVOCATION_END

    }

    function _authority(uint8 chain) private view {
        require(chain == 1 || chain == 2, "FINALITY_CHAIN");
        require(msg.sender == (chain == 1 ? solFinalityAuthority : btcFinalityAuthority), "FINALITY_AUTHORITY");
    }

    function _requireCurrentPermit(uint8 chain, bytes32 effect, bytes32 statement) private view {
    // PC18_REVOCATION_BEGIN
        require(!revocationCoverageHalted, "REVOCATION_COVERAGE_HALTED");
    // PC18_REVOCATION_END

        require(!revokedEffects[chain][effect], "FINALITY_REVOKED");
        Permit memory permit = finalityPermits[permitKey(chain, effect, statement, authorityVersion[chain])];
        require(permit.observedAt <= block.timestamp && block.timestamp < permit.validUntil, "FINALITY_NOT_CURRENT");
    }

    function nodeHash(bytes32 left, bytes32 right) public pure returns (bytes32) {
        return sha256(abi.encodePacked(bytes1(0x01), left, right));
    }

    function noteLeaves() external view returns (bytes32[64] memory result) {
        for (uint256 i = 0; i < CAPACITY; ++i) result[i] = nodes[CAPACITY + i];
    }

    // PC18_HISTORY_BEGIN
    function rootHistory() external view returns (bytes32[65] memory) { return rootHistoryEntries; }

    /// @notice Read at the same canonical block as canonicalState/canonicalEffects.
    /// The authenticated prefix includes the empty root and only final roots that
    /// acceptedRoots accepts. Count is at most leafCount + 1, not necessarily equal.
    function canonicalRootHistory() external view returns (
        uint64 sequence, bytes32 digest, uint32 count, bytes32[65] memory roots
    ) {
        return (stateSequence, rootHistoryDigest, rootHistoryCount, rootHistoryEntries);
    }
    // PC18_HISTORY_END

    // PC18_REVOCATION_BEGIN
    /// @notice Exact68-word, block-pinned revocation coverage snapshot.
    function canonicalRevocations() external view returns (
        uint64 sequence, bool halted, bytes32 digest, uint32 count, bytes32[64] memory entries
    ) { return (stateSequence, revocationCoverageHalted, solRevokedDigest, solRevokedCount, solRevokedEntries); }

    /// @dev 0x19 | scope32 | count:u32be | 64 zero-padded revoked SOL effects.
    function _solRevokedDigest() private view returns (bytes32) {
        return sha256(abi.encodePacked(bytes1(0x19), scope, solRevokedCount, solRevokedEntries));
    }
    // PC18_REVOCATION_END

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

    // PC18_HISTORY_BEGIN
    /// @dev SHA256(0x18 || scope32 || count:u32be || 65 padded bytes32 roots).
    /// Fixed length is 2117 bytes; unused storage entries remain exactly zero.
    function _rootHistoryDigest() private view returns (bytes32) {
        return sha256(abi.encodePacked(bytes1(0x18), scope, rootHistoryCount, rootHistoryEntries));
    }

    function _acceptCurrentRoot() private {
        // A spent-only update has the same root and must not append a duplicate.
        if (!acceptedRoots[currentRoot]) {
            // Except the initial empty root, each new entry requires a new leaf.
            // Existing reserved leaf headroom conservatively covers this bound.
            require(rootHistoryCount < CAPACITY + 1 && rootHistoryCount <= leafCount, "ROOT_HISTORY_FULL");
            acceptedRoots[currentRoot] = true;
            rootHistoryEntries[rootHistoryCount++] = currentRoot;
            rootHistoryDigest = _rootHistoryDigest();
        }
    }
    // PC18_HISTORY_END

    function _headroom(uint256 leaves, uint256 consumed, uint256 reservations, uint256 outputs) private pure {
        require(leaves + 2 * reservations <= CAPACITY, "TREE_HEADROOM");
        require(consumed + 3 * reservations + outputs <= CAPACITY, "SPENT_HEADROOM");
    }

    function _advance() private {
        _headroom(leafCount, spentCount, liveReservations, liveOutputNotes);
        currentRoot = nodes[1];
        _acceptCurrentRoot();
        ++stateSequence;
        emit StateAdvanced(stateSequence, currentRoot, spentDigest, leafCount, spentCount);
    }
}
