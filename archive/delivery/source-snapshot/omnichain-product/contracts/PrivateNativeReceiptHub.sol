// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

interface IPrivateNativeAdmissionVerifier {
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool);
}

/// @dev The complete runtime hash, including immutable bindings, is pinned.
interface IPrivateNativeCheckpointPool {
    function transitionInProgress() external view returns (bool);
    function scope() external view returns (bytes32);
    function policy() external view returns (bytes32);
    function assetIdentity() external view returns (bytes32);
    function currentRoot() external view returns (bytes32);
    function spentDigest() external view returns (bytes32);
    function spentCount() external view returns (uint32);
    function stateSequence() external view returns (uint64);
}

/// @notice SOURCE-ONLY RESEARCH PROFILE. Shared, bounded native receipt
/// admission and consumption. Not integrated with the frozen funded pool.
/// Deployment requires genuine I42 and T131 artifacts and verified lineage;
/// code hashes cannot by themselves distinguish a genuine verifier from a stub.
/// Native truth is the fixed quorum's assertion, not native consensus proof.
/// No owner, setter, upgrade, rotation, mint or administrative bypass exists.
contract PrivateNativeReceiptHub {
    uint256 public constant TREE_DEPTH = 6;
    uint256 public constant CAPACITY = 64;
    uint256 public constant POOL_COUNT = 2;
    uint256 public constant SIGNER_COUNT = 4;
    uint256 public constant QUORUM = 3;
    uint256 public constant CONSUMPTION_WIDTH = 4;
    uint64 public constant MAX_FINALITY_HEALTH_SECONDS = 30;
    uint256 public constant EVIDENCE_STATE_CAPACITY = 1 + 2 * CAPACITY;
    string public constant PROFILE = "LIANUM_NATIVE_QUORUM_3_OF_4_SECP256K1_V2";

    uint256 private constant SECP_P =
        0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f;
    uint256 private constant SECP_N =
        0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141;
    uint256 private constant SECP_HALF_N =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    struct Deployment {
        bytes32 deploymentDomain;
        uint64 registryEpoch;
        bytes32 rulesRoot;
        address admissionVerifier;
        bytes32 admissionVerifierCodeHash;
        address[2] pools;
        bytes32[2] poolCodeHashes;
        uint256[4] attesterX;
        uint256[4] attesterY;
    }

    struct QuorumSignature {
        uint8 signerIndex;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    struct CheckpointRequest {
        bool accepted;
        bytes32 binding;
        bytes32 digest;
        bytes32 root;
        uint32 index;
    }

    // Field order is also the canonical checkpoint H4 component order after
    // tag, hubDomain and registryCommitment. Integers use their declared width.
    struct Snapshot {
        address pool;
        bytes32 scope;
        bytes32 policy;
        bytes32 assetIdentity;
        bytes32 poolRoot;
        bytes32 poolSpentDigest;
        uint32 poolSpentCount;
        uint64 poolStateSequence;
        bytes32 receiptRoot;
        uint32 receiptCount;
        bytes32 spentTagDigest;
        uint32 spentTagCount;
        uint64 spentTagSequence;
        bytes32 revokedDigest;
        uint32 revokedCount;
        uint64 revocationSequence;
        uint64 hubStateSequence;
        uint64 registryEpoch;
        bool halt;
        uint64 timestamp;
    }

    struct HubState {
        bytes32 receiptRoot;
        uint32 receiptCount;
        bytes32 spentTagDigest;
        uint32 spentTagCount;
        uint64 spentTagSequence;
        bytes32 revokedDigest;
        uint32 revokedCount;
        uint64 revocationSequence;
        uint64 stateSequence;
        bytes32 evidenceState;
        bool halted;
    }

    bytes32 public immutable deploymentDomain;
    bytes32 public immutable hubDomain;
    bytes32 public immutable registryCommitment;
    uint64 public immutable registryEpoch;
    bytes32 public immutable rulesRoot;
    IPrivateNativeAdmissionVerifier public immutable admissionVerifier;
    bytes32 public immutable admissionVerifierCodeHash;
    address public immutable pool0;
    address public immutable pool1;
    // Constructor-only storage avoids a runtime-hash fixed-point: each pool
    // embeds the complete hub runtime hash, while this hub pins each complete
    // pool runtime. No function can replace these values after construction.
    bytes32 public pool0CodeHash;
    bytes32 public pool1CodeHash;

    // These arrays are constructor-only. Registry position is signer identity;
    // keys are never sorted, replaced, owner-selected at use, or rotated.
    uint256[4] private attesterX;
    uint256[4] private attesterY;
    address[4] private attesterAddresses;

    bytes32 public receiptRoot;
    uint32 public receiptCount;
    bytes32 public spentTagDigest;
    uint32 public spentTagCount;
    uint64 public spentTagSequence;
    bytes32 public revokedDigest;
    uint32 public revokedCount;
    uint64 public revocationSequence;
    uint64 public stateSequence;
    bytes32 public evidenceState;
    bool public halted;
    // Overflow records preserve further adverse facts after permanent halt.
    // They are NOT represented by the bounded 64-entry absence witness.
    bytes32 public revocationOverflowDigest;
    uint64 public revocationOverflowCount;

    bytes32 public checkpointRoot;
    uint32 public checkpointCount;
    uint64 public evidenceStateCount;
    // Heap indexing: root 1, leaves 64..127, unused index 0 remains zero.
    bytes32[128] private receiptNodes;
    bytes32[128] private checkpointNodes;
    bytes32[64] private spentTags;
    bytes32[64] private revokedGIDs;
    Snapshot[64] private checkpoints;
    bytes32[129] private evidenceStates;
    mapping(bytes32 => uint32) private checkpointIndexPlusOne;
    mapping(bytes32 => CheckpointRequest) public checkpointRequests;
    mapping(bytes32 => bool) public admitted;
    mapping(bytes32 => bool) public insertedCommitments;
    mapping(bytes32 => bool) public consumedTags;
    mapping(bytes32 => bool) public revoked;
    mapping(bytes32 => bool) public acceptedReceiptRoots;
    mapping(bytes32 => bool) public acceptedCheckpointRoots;
    mapping(bytes32 => bool) public recordedEvidenceStates;
    mapping(bytes32 => uint64) public evidenceStateRevocationSequence;
    uint256 private entered;

    event ReceiptAdmitted(bytes32 indexed gid, bytes32 indexed commitment, uint32 index, bytes32 root);
    event TagsConsumed(address indexed pool, bytes32[4] tags, uint64 sequence, bytes32 digest);
    event ReceiptRevoked(
        bytes32 indexed gid, bytes32 reasonCommitment, uint64 sequence, bytes32 digest, bool halted
    );
    event RevocationOverflow(
        bytes32 indexed gid, bytes32 reasonCommitment, uint64 authorizationExpiry,
        uint64 sequence, uint64 overflowCount, bytes32 overflowDigest
    );
    event EvidenceStateRecorded(bytes32 indexed state, uint64 revocationSequence, uint64 stateSequence);
    event CheckpointRecorded(
        uint32 indexed index, address indexed pool, bytes32 indexed digest, bytes32 root
    );
    event CheckpointAuthorized(
        bytes32 indexed requestId, bytes32 indexed binding, address indexed pool, uint32 index
    );

    modifier nonReentrant() {
        require(entered == 0, "REENTRANCY");
        entered = 1;
        _;
        entered = 0;
    }

    /// @dev Configuration is selected by the deployment authority once.
    /// The verifier must already exist and match the independently established
    /// expected runtime hash. Prospective pool addresses may be undeployed;
    /// their independently established full runtime hashes are checked at use.
    constructor(Deployment memory configuration) {
        require(configuration.deploymentDomain != bytes32(0), "CONFIG_DOMAIN");
        require(configuration.rulesRoot != bytes32(0), "CONFIG_RULES");
        deploymentDomain = configuration.deploymentDomain;
        hubDomain = sha256(abi.encodePacked(
            bytes1(0x30), block.chainid, address(this), configuration.deploymentDomain
        ));
        registryEpoch = configuration.registryEpoch;
        rulesRoot = configuration.rulesRoot;

        _requireCode(configuration.admissionVerifier, configuration.admissionVerifierCodeHash);
        admissionVerifier = IPrivateNativeAdmissionVerifier(configuration.admissionVerifier);
        admissionVerifierCodeHash = configuration.admissionVerifierCodeHash;

        require(configuration.pools[0] != configuration.pools[1], "CONFIG_DUPLICATE_POOL");
        for (uint256 i = 0; i < POOL_COUNT; ++i) {
            require(configuration.pools[i] != address(0)
                && configuration.pools[i] != address(this), "CONFIG_POOL");
            _requireNonemptyCodeHash(configuration.poolCodeHashes[i]);
        }
        pool0 = configuration.pools[0];
        pool1 = configuration.pools[1];
        pool0CodeHash = configuration.poolCodeHashes[0];
        pool1CodeHash = configuration.poolCodeHashes[1];

        _registerAttesters(configuration.attesterX, configuration.attesterY);
        registryCommitment = _registryCommitment();
        for (uint256 i = CAPACITY - 1; i > 0; --i) {
            receiptNodes[i] = nodeHash(receiptNodes[2 * i], receiptNodes[2 * i + 1]);
            checkpointNodes[i] = receiptNodes[i];
        }
        receiptRoot = receiptNodes[1];
        checkpointRoot = checkpointNodes[1];
        acceptedReceiptRoots[receiptRoot] = true;
        acceptedCheckpointRoots[checkpointRoot] = true;
        spentTagDigest = _spentDigest();
        revokedDigest = _revokedDigest();
        _recordEvidenceState();
    }

    /// @notice I42: hub8, registry8, acceptedCheckpointRoot8, GID8, C8,
    /// admissionFrom1, admissionUntil1. Each digest is eight big-endian u32s.
    /// A copied valid proof can only install its existing owner-bound C. The
    /// separate global permit authenticates fresh PRE-admission health; honest
    /// signers must also cover pending issued certificates not yet in the tree.
    function admit(
        bytes calldata proof,
        bytes32[] calldata inputs,
        uint64 healthFrom,
        uint64 healthUntil,
        QuorumSignature[3] calldata healthSignatures
    ) external nonReentrant {
        require(!halted, "NATIVE_HALTED");
        require(inputs.length == 42, "PUBLIC_INPUT_LENGTH");
        require(_digest(inputs, 0) == hubDomain, "PUBLIC_HUB_DOMAIN");
        require(_digest(inputs, 8) == registryCommitment, "PUBLIC_REGISTRY");
        require(acceptedCheckpointRoots[_digest(inputs, 16)], "UNKNOWN_CHECKPOINT_ROOT");
        _window(_u64(inputs[40]), _u64(inputs[41]));
        bytes32 gid = _digest(inputs, 24);
        bytes32 commitment = _digest(inputs, 32);
        require(gid != bytes32(0) && !admitted[gid], "GID_ALREADY_ADMITTED");
        require(!revoked[gid], "GID_REVOKED");
        require(commitment != bytes32(0) && !insertedCommitments[commitment], "RECEIPT_ALREADY_INSERTED");
        require(receiptCount < CAPACITY, "RECEIPT_TREE_FULL");
        verifyFinalityHealth(healthFrom, healthUntil, healthSignatures);
        _requireCode(address(admissionVerifier), admissionVerifierCodeHash);
        require(admissionVerifier.verify(proof, inputs), "ADMISSION_PROOF");

        admitted[gid] = true;
        insertedCommitments[commitment] = true;
        uint32 index = receiptCount++;
        receiptRoot = _append(receiptNodes, index, commitment);
        acceptedReceiptRoots[receiptRoot] = true;
        ++stateSequence;
        _recordEvidenceState();
        emit ReceiptAdmitted(gid, commitment, index, receiptRoot);
    }

    /// @notice Called only by an exact pinned pool after its genuine T131
    /// checks. The pool must consume its reserve NF, call this method and append
    /// payouts in one EVM transaction: any later failure rolls everything back.
    /// A fresh global quorum permit covers the current receipt/revocation
    /// state, without exposing which receipts these four opaque tags spend.
    function consume(
        bytes32[4] calldata tags,
        bytes32 acceptedEvidenceState,
        uint64 healthFrom,
        uint64 healthUntil,
        QuorumSignature[3] calldata healthSignatures
    ) external nonReentrant {
        _requirePool(msg.sender);
        require(!halted, "NATIVE_HALTED");
        require(isUsable(acceptedEvidenceState), "UNUSABLE_EVIDENCE_STATE");
        verifyFinalityHealth(healthFrom, healthUntil, healthSignatures);
        require(uint256(spentTagCount) + CONSUMPTION_WIDTH <= CAPACITY, "SPENT_TAGS_FULL");
        for (uint256 i = 0; i < CONSUMPTION_WIDTH; ++i) {
            require(tags[i] != bytes32(0) && !consumedTags[tags[i]], "TAG_ALREADY_CONSUMED");
            for (uint256 j = 0; j < i; ++j) require(tags[i] != tags[j], "DUPLICATE_TAG");
        }
        for (uint256 i = 0; i < CONSUMPTION_WIDTH; ++i) {
            consumedTags[tags[i]] = true;
            spentTags[spentTagCount++] = tags[i];
        }
        spentTagDigest = _spentDigest();
        ++spentTagSequence;
        ++stateSequence;
        emit TagsConsumed(msg.sender, tags, spentTagSequence, spentTagDigest);
    }

    /// @notice Permanent quorum-authorized adverse evidence. A repeated GID is
    /// an idempotent no-op (false), preserving its original authorization and
    /// sequence. A new revocation requires exactly three sorted signers over
    /// the current sequence. Saturation stores the 64th GID and halts forever;
    /// later authenticated adverse facts remain in the map and overflow log.
    function revoke(
        bytes32 gid,
        uint64 expectedSequence,
        bytes32 reasonCommitment,
        uint64 authorizationExpiry,
        QuorumSignature[3] calldata signatures
    ) external nonReentrant returns (bool inserted) {
        require(gid != bytes32(0), "REVOKE_ZERO_GID");
        if (revoked[gid]) return false;
        require(expectedSequence == revocationSequence, "REVOCATION_SEQUENCE_CHANGED");
        require(reasonCommitment != bytes32(0), "REVOKE_ZERO_REASON");
        require(block.timestamp < authorizationExpiry, "REVOCATION_AUTHORIZATION_EXPIRED");
        bytes32 message = revocationMessage(gid, expectedSequence, reasonCommitment, authorizationExpiry);
        _verifyQuorum(message, signatures);

        revoked[gid] = true;
        ++revocationSequence;
        if (revokedCount < CAPACITY) {
            revokedGIDs[revokedCount++] = gid;
            // Freeze before any adverse identity can be omitted from the
            // bounded authenticated vector. There is no resume entry point.
            if (revokedCount == CAPACITY) halted = true;
            revokedDigest = _revokedDigest();
        } else {
            _recordRevocationOverflow(gid, reasonCommitment, authorizationExpiry);
        }
        ++stateSequence;
        _recordEvidenceState();
        emit ReceiptRevoked(gid, reasonCommitment, revocationSequence, revokedDigest, halted);
        return true;
    }

    /// @notice H4("LIANUM/PAEG/revoke-receipt/2", hub, registry, GID,
    /// expectedSequence:u64be, reasonCommitment, authorizationExpiry:u64be).
    /// Sign this SHA256 digest directly, without an Ethereum message prefix.
    function revocationMessage(
        bytes32 gid, uint64 expectedSequence, bytes32 reasonCommitment, uint64 authorizationExpiry
    ) public view returns (bytes32) {
        return sha256(bytes.concat(
            _part(bytes("LIANUM/PAEG/revoke-receipt/2")),
            _part(abi.encodePacked(hubDomain)),
            _part(abi.encodePacked(registryCommitment)),
            _part(abi.encodePacked(gid)),
            _part(abi.encodePacked(expectedSequence)),
            _part(abi.encodePacked(reasonCommitment)),
            _part(abi.encodePacked(authorizationExpiry))
        ));
    }

    /// @notice Historical receipts remain usable after benign appends. Every
    /// revocation invalidates every older evidence state. Consumption does not
    /// invalidate E; the canonical global tag ledger prevents double spends.
    function isUsable(bytes32 state) public view returns (bool) {
        return !halted && recordedEvidenceStates[state]
            && evidenceStateRevocationSequence[state] == revocationSequence;
    }

    /// @notice Global health assertion over CURRENT stored receipt/revocation
    /// state, never over caller-selected roots, graph fields or receipt tags.
    /// Sign this SHA256 digest directly, without an Ethereum message prefix.
    function finalityHealthDigest(uint64 validFrom, uint64 validUntil) public view returns (bytes32) {
        return sha256(bytes.concat(
            _part(bytes("LIANUM/PAEG/finality-health/2")),
            _part(abi.encodePacked(hubDomain)),
            _part(abi.encodePacked(registryCommitment)),
            _part(abi.encodePacked(receiptRoot)),
            _part(abi.encodePacked(receiptCount)),
            _part(abi.encodePacked(revokedDigest)),
            _part(abi.encodePacked(revokedCount)),
            _part(abi.encodePacked(revocationSequence)),
            _part(abi.encodePacked(validFrom)),
            _part(abi.encodePacked(validUntil))
        ));
    }

    /// @notice Returns true or reverts. The native signer checks this alongside
    /// genuine Ready/current-checkpoint checks immediately before dispatch.
    /// No heartbeat is stored and no sequence is advanced. Honest attesters
    /// must scan all admitted effects and outstanding certificates, register
    /// known adverse facts first, and refuse health during unavailable/unknown
    /// observation. This is quorum/liveness trust, not native consensus proof.
    function verifyFinalityHealth(
        uint64 validFrom,
        uint64 validUntil,
        QuorumSignature[3] calldata signatures
    ) public view returns (bool) {
        require(!halted, "NATIVE_HALTED");
        _window(validFrom, validUntil);
        require(validUntil - validFrom <= MAX_FINALITY_HEALTH_SECONDS, "FINALITY_HEALTH_WINDOW_TOO_LONG");
        _verifyQuorum(finalityHealthDigest(validFrom, validUntil), signatures);
        return true;
    }

    /// @notice Three registered signers authorize one capacity slot, not a
    /// caller-supplied snapshot. Actual state is still read from the pinned
    /// pool and hub. Replaying an accepted binding returns its original result
    /// even if time/state later changes; a new binding cannot reuse requestId.
    function recordCheckpoint(
        address pool,
        uint64 expectedPoolSequence,
        uint64 expectedHubStateSequence,
        bytes32 requestId,
        uint64 validUntil,
        QuorumSignature[3] calldata signatures
    ) external nonReentrant returns (
        bytes32 digest, bytes32 root, uint32 index
    ) {
        require(requestId != bytes32(0), "CHECKPOINT_ZERO_REQUEST");
        bytes32 binding = checkpointAuthorizationDigest(
            pool, expectedPoolSequence, expectedHubStateSequence, requestId, validUntil
        );
        CheckpointRequest storage prior = checkpointRequests[requestId];
        if (prior.accepted) {
            require(prior.binding == binding, "CHECKPOINT_REQUEST_REBOUND");
            return (prior.digest, prior.root, prior.index);
        }
        require(block.timestamp < validUntil, "CHECKPOINT_AUTHORIZATION_EXPIRED");
        require(checkpointCount < CAPACITY, "CHECKPOINT_TREE_FULL");
        Snapshot memory snapshot = _readSnapshot(pool);
        require(snapshot.poolStateSequence == expectedPoolSequence, "CHECKPOINT_POOL_SEQUENCE_CHANGED");
        require(snapshot.hubStateSequence == expectedHubStateSequence, "CHECKPOINT_HUB_SEQUENCE_CHANGED");
        _verifyQuorum(binding, signatures);
        digest = hashSnapshot(snapshot);
        index = checkpointCount++;
        checkpoints[index] = snapshot;
        // Each first-use request consumes one leaf, bounding accepted request
        // records by 64. Equal snapshots from separately approved requests are
        // permitted; their identical digest still authenticates the same state.
        if (checkpointIndexPlusOne[digest] == 0) checkpointIndexPlusOne[digest] = index + 1;
        checkpointRoot = _append(checkpointNodes, index, digest);
        acceptedCheckpointRoots[checkpointRoot] = true;
        checkpointRequests[requestId] = CheckpointRequest({
            accepted: true, binding: binding, digest: digest, root: checkpointRoot, index: index
        });
        emit CheckpointAuthorized(requestId, binding, pool, index);
        emit CheckpointRecorded(index, pool, digest, checkpointRoot);
        return (digest, checkpointRoot, index);
    }

    /// @notice H4 authorization of checkpoint capacity under the same fixed
    /// registry. Sign this SHA256 digest directly, without an Ethereum prefix.
    /// This codec does not authenticate state or register a checkpoint itself.
    function checkpointAuthorizationDigest(
        address pool,
        uint64 expectedPoolSequence,
        uint64 expectedHubStateSequence,
        bytes32 requestId,
        uint64 validUntil
    ) public view returns (bytes32) {
        return sha256(bytes.concat(
            _part(bytes("LIANUM/PAEG/checkpoint-authorize/2")),
            _part(abi.encodePacked(hubDomain)),
            _part(abi.encodePacked(registryCommitment)),
            _part(abi.encodePacked(pool)),
            _part(abi.encodePacked(expectedPoolSequence)),
            _part(abi.encodePacked(expectedHubStateSequence)),
            _part(abi.encodePacked(requestId)),
            _part(abi.encodePacked(validUntil))
        ));
    }

    /// @notice Exact state equality, including pool and hub sequences, without
    /// comparing current wall-clock time to the recorded timestamp. Dispatch
    /// separately checks its half-open Ready interval immediately before send.
    function isCheckpointCurrent(bytes32 digest) external view returns (bool) {
        uint32 position = checkpointIndexPlusOne[digest];
        if (position == 0) return false;
        Snapshot storage recorded = checkpoints[position - 1];
        if (!_poolCodeValid(recorded.pool)) return false;
        Snapshot memory current = _readSnapshot(recorded.pool);
        current.timestamp = recorded.timestamp;
        return hashSnapshot(current) == digest;
    }

    function currentSnapshot(address pool) external view returns (Snapshot memory) {
        return _readSnapshot(pool);
    }

    function checkpointAt(uint32 index) external view returns (Snapshot memory) {
        require(index < checkpointCount, "CHECKPOINT_INDEX");
        return checkpoints[index];
    }

    /// @dev This helper hashes data only; it does not register or endorse it.
    /// H4 frames every field independently, including the ASCII domain tag.
    function hashSnapshot(Snapshot memory snapshot) public view returns (bytes32) {
        bytes memory message = bytes.concat(
            _part(bytes("LIANUM/PAEG/checkpoint/2")),
            _part(abi.encodePacked(hubDomain)),
            _part(abi.encodePacked(registryCommitment))
        );
        message = bytes.concat(message,
            _part(abi.encodePacked(snapshot.pool)),
            _part(abi.encodePacked(snapshot.scope)),
            _part(abi.encodePacked(snapshot.policy)),
            _part(abi.encodePacked(snapshot.assetIdentity)),
            _part(abi.encodePacked(snapshot.poolRoot)),
            _part(abi.encodePacked(snapshot.poolSpentDigest)),
            _part(abi.encodePacked(snapshot.poolSpentCount)),
            _part(abi.encodePacked(snapshot.poolStateSequence))
        );
        message = bytes.concat(message,
            _part(abi.encodePacked(snapshot.receiptRoot)),
            _part(abi.encodePacked(snapshot.receiptCount)),
            _part(abi.encodePacked(snapshot.spentTagDigest)),
            _part(abi.encodePacked(snapshot.spentTagCount)),
            _part(abi.encodePacked(snapshot.spentTagSequence))
        );
        message = bytes.concat(message,
            _part(abi.encodePacked(snapshot.revokedDigest)),
            _part(abi.encodePacked(snapshot.revokedCount)),
            _part(abi.encodePacked(snapshot.revocationSequence)),
            _part(abi.encodePacked(snapshot.hubStateSequence)),
            _part(abi.encodePacked(snapshot.registryEpoch)),
            _part(abi.encodePacked(uint8(snapshot.halt ? 1 : 0))),
            _part(abi.encodePacked(snapshot.timestamp))
        );
        return sha256(message);
    }

    function canonicalState() external view returns (
        HubState memory state,
        bytes32[64] memory commitments,
        bytes32[64] memory tags,
        bytes32[64] memory revokedIdentities
    ) {
        state = HubState(
            receiptRoot, receiptCount, spentTagDigest, spentTagCount, spentTagSequence,
            revokedDigest, revokedCount, revocationSequence, stateSequence, evidenceState, halted
        );
        for (uint256 i = 0; i < CAPACITY; ++i) commitments[i] = receiptNodes[CAPACITY + i];
        return (state, commitments, spentTags, revokedGIDs);
    }

    function receiptTreeNodes() external view returns (bytes32[128] memory) { return receiptNodes; }
    function checkpointTreeNodes() external view returns (bytes32[128] memory) { return checkpointNodes; }
    function spentTagList() external view returns (bytes32[64] memory) { return spentTags; }
    function revokedList() external view returns (bytes32[64] memory) { return revokedGIDs; }
    /// @notice Bounded prefix: min(evidenceStateCount, 129) populated entries.
    /// Later states can arise only through permanently halted overflow and are
    /// exposed through evidenceState and EvidenceStateRecorded events/maps.
    function evidenceStateHistory() external view returns (bytes32[129] memory) { return evidenceStates; }

    function attester(uint8 index) external view returns (uint256 x, uint256 y, address signer) {
        require(index < SIGNER_COUNT, "ATTESTER_INDEX");
        return (attesterX[index], attesterY[index], attesterAddresses[index]);
    }

    function isRegisteredPool(address pool) external view returns (bool) {
        return _poolCodeValid(pool);
    }

    function nodeHash(bytes32 left, bytes32 right) public pure returns (bytes32) {
        return sha256(abi.encodePacked(bytes1(0x01), left, right));
    }

    function _readSnapshot(address pool) private view returns (Snapshot memory snapshot) {
        _requirePool(pool);
        require(block.timestamp <= type(uint64).max, "TIMESTAMP_RANGE");
        IPrivateNativeCheckpointPool target = IPrivateNativeCheckpointPool(pool);
        require(!target.transitionInProgress(), "POOL_TRANSITION_IN_PROGRESS");
        snapshot.pool = pool;
        snapshot.scope = target.scope();
        snapshot.policy = target.policy();
        snapshot.assetIdentity = target.assetIdentity();
        snapshot.poolRoot = target.currentRoot();
        snapshot.poolSpentDigest = target.spentDigest();
        snapshot.poolSpentCount = target.spentCount();
        snapshot.poolStateSequence = target.stateSequence();
        snapshot.receiptRoot = receiptRoot;
        snapshot.receiptCount = receiptCount;
        snapshot.spentTagDigest = spentTagDigest;
        snapshot.spentTagCount = spentTagCount;
        snapshot.spentTagSequence = spentTagSequence;
        snapshot.revokedDigest = revokedDigest;
        snapshot.revokedCount = revokedCount;
        snapshot.revocationSequence = revocationSequence;
        snapshot.hubStateSequence = stateSequence;
        snapshot.registryEpoch = registryEpoch;
        snapshot.halt = halted;
        snapshot.timestamp = uint64(block.timestamp);
    }

    function _registerAttesters(uint256[4] memory xs, uint256[4] memory ys) private {
        for (uint256 i = 0; i < SIGNER_COUNT; ++i) {
            uint256 x = xs[i];
            uint256 y = ys[i];
            require(x < SECP_P && y < SECP_P, "ATTESTER_COORDINATE_RANGE");
            require(mulmod(y, y, SECP_P)
                == addmod(mulmod(mulmod(x, x, SECP_P), x, SECP_P), 7, SECP_P), "ATTESTER_NOT_ON_CURVE");
            address signer = address(uint160(uint256(keccak256(abi.encodePacked(x, y)))));
            require(signer != address(0), "ATTESTER_ZERO_ADDRESS");
            for (uint256 j = 0; j < i; ++j) {
                require(x != xs[j], "ATTESTER_DUPLICATE_X");
                require(signer != attesterAddresses[j], "ATTESTER_DUPLICATE_ADDRESS");
            }
            attesterX[i] = x;
            attesterY[i] = y;
            attesterAddresses[i] = signer;
        }
    }

    function _registryCommitment() private view returns (bytes32) {
        bytes memory message = bytes.concat(
            _part(bytes("LIANUM/native-registry/secp256k1/2")),
            _part(bytes(PROFILE)),
            _part(abi.encodePacked(hubDomain)),
            _part(abi.encodePacked(registryEpoch)),
            _part(abi.encodePacked(rulesRoot))
        );
        for (uint256 i = 0; i < SIGNER_COUNT; ++i) {
            message = bytes.concat(message,
                _part(abi.encodePacked(attesterX[i])), _part(abi.encodePacked(attesterY[i])));
        }
        return sha256(message);
    }

    function _verifyQuorum(bytes32 message, QuorumSignature[3] calldata signatures) private view {
        for (uint256 i = 0; i < QUORUM; ++i) {
            QuorumSignature calldata signature = signatures[i];
            require(signature.signerIndex < SIGNER_COUNT, "SIGNER_INDEX");
            if (i != 0) require(signatures[i - 1].signerIndex < signature.signerIndex, "SIGNER_ORDER");
            require(signature.v == 27 || signature.v == 28, "SIGNATURE_V");
            require(uint256(signature.r) > 0 && uint256(signature.r) < SECP_N, "SIGNATURE_R");
            require(uint256(signature.s) > 0 && uint256(signature.s) <= SECP_HALF_N, "SIGNATURE_LOW_S");
            address recovered = ecrecover(message, signature.v, signature.r, signature.s);
            require(recovered != address(0)
                && recovered == attesterAddresses[signature.signerIndex], "QUORUM_SIGNATURE");
        }
    }

    function _recordEvidenceState() private {
        evidenceState = sha256(bytes.concat(
            _part(bytes("LIANUM/PAEG/evidence-state/2")),
            _part(abi.encodePacked(hubDomain)),
            _part(abi.encodePacked(registryCommitment)),
            _part(abi.encodePacked(receiptRoot)),
            _part(abi.encodePacked(receiptCount)),
            _part(abi.encodePacked(revokedDigest)),
            _part(abi.encodePacked(revokedCount)),
            _part(abi.encodePacked(revocationSequence))
        ));
        if (evidenceStateCount < EVIDENCE_STATE_CAPACITY) evidenceStates[evidenceStateCount] = evidenceState;
        ++evidenceStateCount;
        recordedEvidenceStates[evidenceState] = true;
        evidenceStateRevocationSequence[evidenceState] = revocationSequence;
        emit EvidenceStateRecorded(evidenceState, revocationSequence, stateSequence);
    }

    function _recordRevocationOverflow(bytes32 gid, bytes32 reasonCommitment, uint64 expiry) private {
        require(halted, "OVERFLOW_REQUIRES_PERMANENT_HALT");
        ++revocationOverflowCount;
        revocationOverflowDigest = sha256(bytes.concat(
            _part(bytes("LIANUM/PAEG/revocation-overflow/2")),
            _part(abi.encodePacked(hubDomain)),
            _part(abi.encodePacked(registryCommitment)),
            _part(abi.encodePacked(revocationOverflowDigest)),
            _part(abi.encodePacked(gid)),
            _part(abi.encodePacked(reasonCommitment)),
            _part(abi.encodePacked(revocationSequence)),
            _part(abi.encodePacked(expiry))
        ));
        emit RevocationOverflow(
            gid, reasonCommitment, expiry, revocationSequence, revocationOverflowCount, revocationOverflowDigest
        );
    }

    function _append(bytes32[128] storage nodes, uint32 position, bytes32 leaf)
        private returns (bytes32)
    {
        require(position < CAPACITY, "TREE_FULL");
        uint256 index = CAPACITY + position;
        nodes[index] = leaf;
        while (index > 1) {
            index /= 2;
            nodes[index] = nodeHash(nodes[index * 2], nodes[index * 2 + 1]);
        }
        return nodes[1];
    }

    // Fixed-width, packed preimages. Array elements are already 32 bytes;
    // abi.encodePacked adds no array length. The unused suffix stays zero.
    function _spentDigest() private view returns (bytes32) {
        return sha256(abi.encodePacked(bytes1(0x31), hubDomain, spentTagCount, spentTags));
    }

    function _revokedDigest() private view returns (bytes32) {
        return sha256(abi.encodePacked(bytes1(0x32), hubDomain, revokedCount, revokedGIDs));
    }

    function _poolCodeValid(address pool) private view returns (bool) {
        bytes32 expected;
        if (pool == pool0) expected = pool0CodeHash;
        else if (pool == pool1) expected = pool1CodeHash;
        else return false;
        return pool.code.length != 0 && pool.codehash == expected;
    }

    function _requirePool(address pool) private view {
        require(_poolCodeValid(pool), "POOL_NOT_PINNED");
    }

    function _requireNonemptyCodeHash(bytes32 expected) private pure {
        require(expected != bytes32(0) && expected != keccak256(""), "CONFIG_CODE_HASH");
    }

    function _requireCode(address target, bytes32 expected) private view {
        _requireNonemptyCodeHash(expected);
        require(target != address(0) && target.code.length != 0 && target.codehash == expected,
            "PINNED_CODE_MISMATCH");
    }

    function _part(bytes memory value) private pure returns (bytes memory) {
        require(value.length <= type(uint32).max, "H4_PART_TOO_LONG");
        return abi.encodePacked(uint32(value.length), value);
    }

    function _window(uint64 validFrom, uint64 validUntil) private view {
        require(validFrom < validUntil, "INVALID_WINDOW");
        require(validFrom <= block.timestamp && block.timestamp < validUntil, "OUTSIDE_WINDOW");
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
}
