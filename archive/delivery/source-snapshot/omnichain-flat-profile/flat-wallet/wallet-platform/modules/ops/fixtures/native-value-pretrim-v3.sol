// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {FlatNativeValueRegistryV2} from "./FlatNativeValueRegistryV2.sol";
import {FlatVerifierSet} from "../FlatVerifierSet.sol";
import {FlatHubCodec} from "../FlatHubCodec.sol";
import {Poseidon2Domains} from "../crypto/Poseidon2Domains.sol";

interface IPrivateFlatCheckpointPool {
    function transitionInProgress() external view returns (bool);
    function scope() external view returns (bytes32);
    function policy() external view returns (bytes32);
    function assetIdentity() external view returns (bytes32);
    function currentRoot() external view returns (bytes32);
    function spentDigest() external view returns (bytes32);
    function spentCount() external view returns (uint32);
    function stateSequence() external view returns (uint64);
    function domainCommitment() external view returns (bytes32);
    function hubDomain() external view returns (bytes32);
    function registryCommitment() external view returns (bytes32);
    function verifierSetCommitment() external view returns (bytes32);
    function poseidon2Domains() external view returns (address);
    function poseidon2DomainsCodeHash() external view returns (bytes32);
    function hubCodec() external view returns (address);
    function hubCodecCodeHash() external view returns (bytes32);
    function ledgerNamespace() external view returns (bytes32);
    function receiptHub() external view returns (address);
    function receiptHubCodeHash() external view returns (bytes32);
    function acceptedAuthorizationRoots(bytes32 root) external view returns (bool);
}

/// @dev The optional claim authority is a fixed, code-pinned state machine.
/// It reserves operations, verifies the registered gateway identity and permits,
/// and never replaces this hub's canonical consumed-native-nullifier ledger.
interface IFlatNativeClaimAuthority {
    function hub() external view returns (address);
    function reservationOwner(bytes32 nullifier) external view returns (address);
    function reservedReceiptCapacity(address pool) external view returns (uint32);
}

/// @notice Native-value semantic V2 hub. Deploy only with the reviewed new I key.
/// Registry source changed; existing 12-slot verifier configuration and ledgers are retained.
/// This is a distinct deployment, never an upgrade of the old immutable hub.
/// Source-only flat receipt hub. Receipt/evidence trees are per pool D;
/// admission nullifiers, spent tags, native GID revocations and adverse halt are
/// shared globally. No public GID-to-receipt map or administrative bypass exists.
/// Genuine proofs, P2 conformance, EVM limits and native truth remain unproven.
contract PrivateFlatReceiptHubNativeValueV2 {
    string public constant NATIVE_VALUE_PROFILE = "LIANUM_GENERIC_NATIVE_VALUE_ADMISSION_V2";
    // New-profile error ABI: selectors replace only this hub's old constant
    // reason strings. Predicates and evaluation order are unchanged.
    error AdmissionRevocationChanged();
    error AttesterDuplicateAddress();
    error AttesterDuplicateX();
    error AttesterIndex();
    error CheckpointAuthorizationExpired();
    error CheckpointEvidenceMismatch();
    error CheckpointHubSequenceChanged();
    error CheckpointIndex();
    error CheckpointPoolMismatch();
    error CheckpointPoolSequenceChanged();
    error CheckpointRequestRebound();
    error CheckpointTreeFull();
    error CheckpointZeroRequest();
    error ConfigCodeHash();
    error ConfigDomain();
    error ConfigDuplicatePool();
    error ConfigPool();
    error ConfigRules();
    error DuplicatePoolDomain();
    error DuplicateTag();
    error FinalityHealthWindowTooLong();
    error GlobalTagHeadroom();
    error InvalidWindow();
    error NativeEffectAlreadyAdmitted();
    error NativeHalted();
    error NoReservedTagCapacity();
    error OutsideWindow();
    error OverflowRequiresPermanentHalt();
    error PinnedCodeMismatch();
    error PoolDomainChanged();
    error PoolDomainMismatch();
    error PoolDomainNotRegistered();
    error PoolHubCodec();
    error PoolHubPin();
    error PoolMathLibrary();
    error PoolNamespace();
    error PoolNativeDomain();
    error PoolNotPinned();
    error PoolTransitionInProgress();
    error PoolVerifierSet();
    error PublicDomain();
    error ReceiptAlreadyInserted();
    error ReceiptTreeFull();
    error Reentrancy();
    error RevocationAuthorizationExpired();
    error RevocationSequenceChanged();
    error RevokeZeroGid();
    error RevokeZeroReason();
    error SpentTagsFull();
    error TagAlreadyConsumed();
    error TimestampRange();
    error TreeFull();
    error UnknownAuthorizationRoot();
    error UnknownCheckpointRoot();
    error UnknownDomain();
    error UnusableEvidenceState();
    error ClaimAuthorityRequired();
    error ClaimNullifierReserved();

    uint256 public constant TREE_DEPTH = 6;
    uint256 public constant CAPACITY = 64;
    uint256 public constant POOL_COUNT = 2;
    uint256 public constant SIGNER_COUNT = 4;
    uint256 public constant QUORUM = 3;
    uint256 public constant CONSUMPTION_WIDTH = 4;
    uint64 public constant MAX_FINALITY_HEALTH_SECONDS = 30;
    uint256 public constant EVIDENCE_STATE_CAPACITY = 1 + 2 * CAPACITY;
    string public constant PROFILE = "LIANUM_NATIVE_QUORUM_3_OF_4_SECP256K1_V2";
    string public constant FLAT_PROFILE = "LIANUM_PAEG_P2_V1";

    struct Deployment {
        bytes32 deploymentDomain;
        uint64 registryEpoch;
        bytes32 rulesRoot;
        FlatVerifierSet.Configuration verifierSet;
        address[2] pools;
        bytes32[2] poolCodeHashes;
        uint256[4] attesterX;
        uint256[4] attesterY;
        address claimAuthority;
        bytes32 claimAuthorityCodeHash;
    }

    struct CheckpointRequest {
        bool accepted; bytes32 binding; bytes32 digest; bytes32 root; uint32 index;
    }

    struct DomainState {
        bytes32 receiptRoot;
        uint32 receiptCount;
        bytes32 revokedDigest;
        bytes32 evidenceState;
        uint64 evidenceStateCount;
        bytes32[128] receiptNodes;
        bytes32[129] evidenceStates;
    }

    struct HubState {
        bytes32 domain;
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
        uint32 reservedTagCapacity;
        uint32 totalReservedTagCapacity;
    }

    struct Admission { bytes32 domain; bytes32 receiptLeaf; bytes32 nullifier; }

    bytes32 public immutable deploymentDomain;
    bytes32 public immutable hubDomain;
    bytes32 public immutable ledgerNamespace;
    bytes32 public immutable registryCommitment;
    bytes32 public immutable verifierSetCommitment;
    address public immutable poseidon2Domains;
    bytes32 public immutable poseidon2DomainsCodeHash;
    address public immutable hubCodec;
    bytes32 public immutable hubCodecCodeHash;
    uint64 public immutable registryEpoch;
    bytes32 public immutable rulesRoot;
    address public immutable pool0;
    address public immutable pool1;
    address public immutable claimAuthority;
    // The constructor pin is embedded in runtime; omitting a redundant getter
    // keeps this bounded hub below EIP-170 without changing its predicates.
    bytes32 private immutable claimAuthorityCodeHash;
    // Constructor-only storage breaks the reciprocal runtime-hash fixed point.
    bytes32 public pool0CodeHash;
    bytes32 public pool1CodeHash;
    FlatVerifierSet.Configuration private verifiers;
    uint256[4] private attesterX;
    uint256[4] private attesterY;
    address[4] private attesterAddresses;

    mapping(address => bytes32) public poolDomain;
    mapping(bytes32 => address) public domainPool;
    mapping(bytes32 => DomainState) private domains;
    mapping(bytes32 => mapping(bytes32 => bool)) public acceptedReceiptRoots;
    mapping(bytes32 => mapping(bytes32 => bool)) public insertedReceiptLeaves;
    mapping(bytes32 => mapping(bytes32 => bool)) public recordedEvidenceStates;
    mapping(bytes32 => mapping(bytes32 => uint64)) public evidenceStateRevocationSequence;
    mapping(bytes32 => bool) public admissionNullifiers;
    mapping(bytes32 => bool) public consumedTags;
    mapping(bytes32 => bool) public revoked;
    mapping(address => uint32) public reservedTagCapacityByPool;
    uint32 public totalReservedTagCapacity;
    bytes32 public spentTagDigest;
    uint32 public spentTagCount;
    uint64 public spentTagSequence;
    uint32 public revokedCount;
    uint64 public revocationSequence;
    uint64 public stateSequence;
    bool public halted;
    bytes32 public revocationOverflowDigest;
    uint64 public revocationOverflowCount;
    bytes32[64] private spentTags;
    bytes32[64] private revokedGIDs;

    bytes32 public checkpointRoot;
    uint32 public checkpointCount;
    bytes32[128] private checkpointNodes;
    FlatHubCodec.Snapshot[64] private checkpoints;
    mapping(bytes32 => uint32) private checkpointIndexPlusOne;
    mapping(bytes32 => CheckpointRequest) public checkpointRequests;
    mapping(bytes32 => bool) public acceptedCheckpointRoots;
    uint256 private entered;

    event PoolDomainRegistered(address indexed pool, bytes32 indexed domain);
    event ReceiptAdmitted(bytes32 indexed admissionNullifier, bytes32 indexed receiptLeaf);
    event TagsConsumed(address indexed pool, bytes32[4] tags, uint64 sequence, bytes32 digest);
    event TagCapacityChanged(address indexed pool, uint32 reserved, uint32 totalReserved);
    event ReceiptRevoked(bytes32 indexed gid, bytes32 reasonCommitment, uint64 sequence, bool halted);
    event RevocationOverflow(bytes32 indexed gid, bytes32 reasonCommitment, uint64 authorizationExpiry,
        uint64 sequence, uint64 overflowCount, bytes32 overflowDigest);
    event EvidenceStateRecorded(bytes32 indexed domain, bytes32 indexed state,
        uint64 revocationSequence, uint64 stateSequence);
    event CheckpointRecorded(uint32 indexed index, address indexed pool, bytes32 indexed digest, bytes32 root);
    event CheckpointAuthorized(bytes32 indexed requestId, bytes32 indexed binding, address indexed pool, uint32 index);

    modifier nonReentrant() {
        if (!(entered == 0)) revert Reentrancy();
        entered = 1;
        _;
        entered = 0;
    }

    constructor(Deployment memory configuration) {
        require(configuration.claimAuthority == address(0) && configuration.claimAuthorityCodeHash == bytes32(0), "NATIVE_VALUE_V2_GRAPH_ONLY");
        if (!(configuration.deploymentDomain != bytes32(0))) revert ConfigDomain();
        if (!(configuration.rulesRoot != bytes32(0))) revert ConfigRules();
        deploymentDomain = configuration.deploymentDomain;
        hubDomain = sha256(abi.encodePacked(
            bytes1(0x30), block.chainid, address(this), configuration.deploymentDomain
        ));
        ledgerNamespace = hubDomain;
        registryEpoch = configuration.registryEpoch;
        rulesRoot = configuration.rulesRoot;
        FlatVerifierSet.validate(configuration.verifierSet);
        poseidon2Domains = configuration.verifierSet.poseidon2Domains;
        poseidon2DomainsCodeHash = configuration.verifierSet.poseidon2DomainsCodeHash;
        hubCodec = configuration.verifierSet.hubCodec;
        hubCodecCodeHash = configuration.verifierSet.hubCodecCodeHash;
        verifiers = configuration.verifierSet;
        verifierSetCommitment = FlatVerifierSet.commitment(configuration.verifierSet);
        if (!(configuration.pools[0] != configuration.pools[1])) revert ConfigDuplicatePool();
        for (uint256 i = 0; i < POOL_COUNT; ++i) {
            if (!(configuration.pools[i] != address(0)
                && configuration.pools[i] != address(this))) revert ConfigPool();
            _requireNonemptyCodeHash(configuration.poolCodeHashes[i]);
        }
        pool0 = configuration.pools[0]; pool1 = configuration.pools[1];
        pool0CodeHash = configuration.poolCodeHashes[0]; pool1CodeHash = configuration.poolCodeHashes[1];
        claimAuthority = configuration.claimAuthority;
        claimAuthorityCodeHash = configuration.claimAuthorityCodeHash;
        if (claimAuthority == address(0)) {
            if (claimAuthorityCodeHash != bytes32(0)) revert ConfigCodeHash();
        } else {
            FlatVerifierSet.requireCode(claimAuthority, claimAuthorityCodeHash);
            if (IFlatNativeClaimAuthority(claimAuthority).hub() != address(this)) revert ConfigDomain();
        }
        _registerAttesters(configuration.attesterX, configuration.attesterY);
        registryCommitment = _registryCommitment();
        for (uint256 i = CAPACITY - 1; i > 0; --i) {
            checkpointNodes[i] = nodeHash(checkpointNodes[2 * i], checkpointNodes[2 * i + 1]);
        }
        checkpointRoot = checkpointNodes[1];
        acceptedCheckpointRoots[checkpointRoot] = true;
        spentTagDigest = _spentDigest();
    }

    function verifierConfiguration() external view returns (FlatVerifierSet.Configuration memory) { return verifiers; }

    /// @notice Permissionless deterministic bootstrap, never a caller-selected D.
    /// A prospective undeployed pool is not usable. No identity setter exists.
    function registerPoolDomain(address pool) external nonReentrant returns (bytes32 domain) {
        _requirePool(pool);
        _requireMathLibrary();
        IPrivateFlatCheckpointPool target = IPrivateFlatCheckpointPool(pool);
        if (!(!target.transitionInProgress())) revert PoolTransitionInProgress();
        if (!(target.receiptHub() == address(this)
            && target.receiptHubCodeHash() == address(this).codehash)) revert PoolHubPin();
        if (!(target.hubDomain() == hubDomain && target.registryCommitment() == registryCommitment)) revert PoolNativeDomain();
        if (!(target.verifierSetCommitment() == verifierSetCommitment)) revert PoolVerifierSet();
        if (!(target.poseidon2Domains() == poseidon2Domains
            && target.poseidon2DomainsCodeHash() == poseidon2DomainsCodeHash)) revert PoolMathLibrary();
        if (!(target.hubCodec() == hubCodec && target.hubCodecCodeHash() == hubCodecCodeHash)) revert PoolHubCodec();
        if (!(target.ledgerNamespace() == ledgerNamespace)) revert PoolNamespace();
        domain = FlatVerifierSet.domainCommitment([
            target.scope(), target.policy(), target.assetIdentity(), hubDomain,
            registryCommitment, verifierSetCommitment, ledgerNamespace
        ]);
        if (!(target.domainCommitment() == domain)) revert PoolDomainMismatch();
        if (poolDomain[pool] != bytes32(0)) {
            if (!(poolDomain[pool] == domain)) revert PoolDomainChanged();
            return domain;
        }
        if (!(domainPool[domain] == address(0))) revert DuplicatePoolDomain();
        poolDomain[pool] = domain;
        domainPool[domain] = pool;
        DomainState storage current = domains[domain];
        bytes32 empty = bytes32(Poseidon2Domains.emptyLeaf(uint256(domain), 2));
        for (uint256 i = CAPACITY; i < 2 * CAPACITY; ++i) current.receiptNodes[i] = empty;
        for (uint256 level = 1; level <= TREE_DEPTH; ++level) {
            empty = bytes32(Poseidon2Domains.nodeHash(uint256(domain), 2, level,
                uint256(empty), uint256(empty)));
            uint256 start = CAPACITY >> level;
            for (uint256 i = start; i < 2 * start; ++i) current.receiptNodes[i] = empty;
        }
        current.receiptRoot = current.receiptNodes[1];
        current.revokedDigest = _domainRevokedDigest(domain);
        acceptedReceiptRoots[domain][current.receiptRoot] = true;
        ++stateSequence;
        _recordEvidenceState(domain);
        emit PoolDomainRegistered(pool, domain);
    }

    /// @notice Flat P42/R50/I84 bundle. Historical readiness is authenticated,
    /// while I's separate purpose-18 revocation state and health must be current.
    function admit(address pool, FlatVerifierSet.Proof calldata dependency,
        FlatVerifierSet.Proof calldata readiness, FlatVerifierSet.Proof calldata admission,
        uint64 healthFrom, uint64 healthUntil, FlatHubCodec.QuorumSignature[3] calldata healthSignatures)
        external nonReentrant
    {
        if (!(!halted)) revert NativeHalted();
        _requireMathLibrary();
        Admission memory candidate = _verifiedAdmissionInputs(pool, dependency, readiness, admission);
        DomainState storage current = domains[candidate.domain];
        if (claimAuthority != address(0)) {
            _requireClaimAuthority();
            if (IFlatNativeClaimAuthority(claimAuthority).reservationOwner(candidate.nullifier) != address(0))
                revert ClaimNullifierReserved();
            if (uint256(current.receiptCount)
                + IFlatNativeClaimAuthority(claimAuthority).reservedReceiptCapacity(pool) >= CAPACITY)
                revert ReceiptTreeFull();
        }
        if (!(candidate.nullifier != bytes32(0) && !admissionNullifiers[candidate.nullifier])) revert NativeEffectAlreadyAdmitted();
        if (!(candidate.receiptLeaf != bytes32(0)
            && candidate.receiptLeaf != bytes32(Poseidon2Domains.emptyLeaf(uint256(candidate.domain), 2))
            && !insertedReceiptLeaves[candidate.domain][candidate.receiptLeaf])) revert ReceiptAlreadyInserted();
        if (!(current.receiptCount < CAPACITY)) revert ReceiptTreeFull();
        verifyFinalityHealth(pool, healthFrom, healthUntil, healthSignatures);

        // I checks PRIVATE GID absence in the current vector. N is not a GID.
        admissionNullifiers[candidate.nullifier] = true;
        insertedReceiptLeaves[candidate.domain][candidate.receiptLeaf] = true;
        _appendReceipt(candidate.domain, candidate.receiptLeaf);
        ++stateSequence;
        _recordEvidenceState(candidate.domain);
        emit ReceiptAdmitted(candidate.nullifier, candidate.receiptLeaf);
    }

    /// @notice Claim ingress/discharge reaches the same once-only N authority
    /// as generic I. The pinned authority authenticates the exact registered
    /// gateway, operation reservation and genuine CI51/CO42 statement. Zero
    /// leaf means discharge only; it cannot create receipt or private balance.
    function acceptClaim(address pool, bytes32 nullifier, bytes32 leaf,
        bytes32 currentRevocationState) external nonReentrant
    {
        _requireClaimAuthority();
        if (msg.sender != claimAuthority) revert ClaimAuthorityRequired();
        if (halted) revert NativeHalted();
        bytes32 domain = _registeredDomain(pool);
        if (IPrivateFlatCheckpointPool(pool).transitionInProgress()) revert PoolTransitionInProgress();
        if (currentRevocationState != admissionRevocationState(domain)) revert AdmissionRevocationChanged();
        if (nullifier == bytes32(0) || admissionNullifiers[nullifier]) revert NativeEffectAlreadyAdmitted();
        admissionNullifiers[nullifier] = true;
        if (leaf != bytes32(0)) {
            if (leaf == bytes32(Poseidon2Domains.emptyLeaf(uint256(domain), 2))
                || insertedReceiptLeaves[domain][leaf]) revert ReceiptAlreadyInserted();
            insertedReceiptLeaves[domain][leaf] = true;
            _appendReceipt(domain, leaf);
        }
        ++stateSequence;
        if (leaf != bytes32(0)) _recordEvidenceState(domain);
        emit ReceiptAdmitted(nullifier, leaf);
    }

    function _requireClaimAuthority() private view {
        if (claimAuthority == address(0)) revert ClaimAuthorityRequired();
        FlatVerifierSet.requireCode(claimAuthority, claimAuthorityCodeHash);
    }

    function _verifiedAdmissionInputs(address pool, FlatVerifierSet.Proof calldata dependency,
        FlatVerifierSet.Proof calldata readiness, FlatVerifierSet.Proof calldata admission)
        private view returns (Admission memory)
    {
        _requireCodecLibrary();
        FlatHubCodec.VerifierPin[3] memory pins;
        for (uint256 i = 0; i < 3; ++i) {
            FlatVerifierSet.Pin storage pin = verifiers.pins[FlatVerifierSet.P + i];
            pins[i] = FlatHubCodec.VerifierPin(pin.verifier, pin.codeHash);
        }
        FlatHubCodec.Proof[3] memory proofs;
        proofs[0] = FlatHubCodec.Proof(dependency.proof, dependency.inputs);
        proofs[1] = FlatHubCodec.Proof(readiness.proof, readiness.inputs);
        proofs[2] = FlatHubCodec.Proof(admission.proof, admission.inputs);
        return _admissionInputs(pool, FlatHubCodec.verifyAdmissionBundle(pins, proofs));
    }

    function _admissionInputs(address pool, FlatHubCodec.AdmissionStatement memory statement)
        private view returns (Admission memory candidate)
    {
        candidate.domain = _registeredDomain(pool);
        IPrivateFlatCheckpointPool target = IPrivateFlatCheckpointPool(pool);
        if (!(!target.transitionInProgress())) revert PoolTransitionInProgress();
        if (!(statement.domain == candidate.domain)) revert PublicDomain();
        if (!(target.acceptedAuthorizationRoots(statement.authorizationRoot))) revert UnknownAuthorizationRoot();
        uint32 position = checkpointIndexPlusOne[statement.checkpoint];
        if (!(position != 0 && checkpoints[position - 1].pool == pool)) revert CheckpointPoolMismatch();
        if (!(statement.readinessEvidenceState == _snapshotEvidence(candidate.domain, checkpoints[position - 1]))) revert CheckpointEvidenceMismatch();
        if (!(acceptedCheckpointRoots[statement.acceptedCheckpointRoot])) revert UnknownCheckpointRoot();
        if (!(statement.admissionRevocationState == admissionRevocationState(candidate.domain))) revert AdmissionRevocationChanged();
        candidate.receiptLeaf = statement.receiptLeaf;
        candidate.nullifier = statement.nullifier;
        // Signing-time Ready may be historical. Current admission time is local
        // hub authority, never a result supplied by the stateless decoder.
        _window(statement.admissionFrom, statement.admissionUntil);
    }

    /// @notice Only the verified S transition in a pinned pool books four tags.
    /// No envelope, reserve commitment or reserve nullifier is disclosed here.
    function bookTagCapacity() external nonReentrant {
        _registeredDomain(msg.sender);
        if (!(!halted)) revert NativeHalted();
        if (!(uint256(spentTagCount) + totalReservedTagCapacity + CONSUMPTION_WIDTH <= CAPACITY)) revert GlobalTagHeadroom();
        reservedTagCapacityByPool[msg.sender] += uint32(CONSUMPTION_WIDTH);
        totalReservedTagCapacity += uint32(CONSUMPTION_WIDTH);
        ++stateSequence;
        emit TagCapacityChanged(msg.sender, reservedTagCapacityByPool[msg.sender], totalReservedTagCapacity);
    }

    /// @notice Verified F releases its booking even during permanent halt.
    function releaseTagCapacity() external nonReentrant {
        _registeredDomain(msg.sender);
        _releaseTagCapacity(msg.sender);
        ++stateSequence;
    }

    function _releaseTagCapacity(address pool) private {
        if (!(reservedTagCapacityByPool[pool] >= CONSUMPTION_WIDTH
            && totalReservedTagCapacity >= CONSUMPTION_WIDTH)) revert NoReservedTagCapacity();
        reservedTagCapacityByPool[pool] -= uint32(CONSUMPTION_WIDTH);
        totalReservedTagCapacity -= uint32(CONSUMPTION_WIDTH);
        emit TagCapacityChanged(pool, reservedTagCapacityByPool[pool], totalReservedTagCapacity);
    }

    function consume(bytes32[4] calldata tags, bytes32 acceptedEvidenceState,
        uint64 healthFrom, uint64 healthUntil, FlatHubCodec.QuorumSignature[3] calldata healthSignatures)
        external nonReentrant
    {
        bytes32 domain = _registeredDomain(msg.sender);
        if (!(isUsable(domain, acceptedEvidenceState))) revert UnusableEvidenceState();
        verifyFinalityHealth(msg.sender, healthFrom, healthUntil, healthSignatures);
        if (!(uint256(spentTagCount) + CONSUMPTION_WIDTH <= CAPACITY)) revert SpentTagsFull();
        for (uint256 i = 0; i < CONSUMPTION_WIDTH; ++i) {
            if (!(tags[i] != bytes32(0) && !consumedTags[tags[i]])) revert TagAlreadyConsumed();
            for (uint256 j = 0; j < i; ++j) if (!(tags[i] != tags[j])) revert DuplicateTag();
        }
        _releaseTagCapacity(msg.sender);
        for (uint256 i = 0; i < CONSUMPTION_WIDTH; ++i) {
            consumedTags[tags[i]] = true;
            spentTags[spentTagCount++] = tags[i];
        }
        if (!(uint256(spentTagCount) + totalReservedTagCapacity <= CAPACITY)) revert GlobalTagHeadroom();
        spentTagDigest = _spentDigest();
        ++spentTagSequence;
        ++stateSequence;
        emit TagsConsumed(msg.sender, tags, spentTagSequence, spentTagDigest);
    }

    function revoke(bytes32 gid, uint64 expectedSequence, bytes32 reasonCommitment,
        uint64 authorizationExpiry, FlatHubCodec.QuorumSignature[3] calldata signatures)
        external nonReentrant returns (bool inserted)
    {
        if (!(gid != bytes32(0))) revert RevokeZeroGid();
        if (revoked[gid]) return false;
        if (!(expectedSequence == revocationSequence)) revert RevocationSequenceChanged();
        if (!(reasonCommitment != bytes32(0))) revert RevokeZeroReason();
        if (!(block.timestamp < authorizationExpiry)) revert RevocationAuthorizationExpired();
        _verifyQuorum(revocationMessage(gid, expectedSequence, reasonCommitment, authorizationExpiry), signatures);
        revoked[gid] = true;
        ++revocationSequence;
        if (revokedCount < CAPACITY) {
            revokedGIDs[revokedCount++] = gid;
            if (revokedCount == CAPACITY) halted = true;
        } else {
            _recordRevocationOverflow(gid, reasonCommitment, authorizationExpiry);
        }
        ++stateSequence;
        _refreshRevocationDomain(poolDomain[pool0]);
        _refreshRevocationDomain(poolDomain[pool1]);
        emit ReceiptRevoked(gid, reasonCommitment, revocationSequence, halted);
        return true;
    }

    function _refreshRevocationDomain(bytes32 domain) private {
        if (domain == bytes32(0)) return;
        domains[domain].revokedDigest = _domainRevokedDigest(domain);
        _recordEvidenceState(domain);
    }

    /// @notice Benign receipt appends preserve an old state at the SAME current
    /// global revocation sequence. Halt invalidates all new exposure/settlement.
    function isUsable(bytes32 domain, bytes32 state) public view returns (bool) {
        return !halted && domainPool[domain] != address(0)
            && _poolCodeValid(domainPool[domain]) && recordedEvidenceStates[domain][state]
            && evidenceStateRevocationSequence[domain][state] == revocationSequence;
    }

    /// @notice A NEW signing domain, never an old single-root health permit.
    /// H4 fields are specified exactly in docs/contract-state.md. Sign raw SHA256.
    function finalityHealthDigest(address pool, uint64 validFrom, uint64 validUntil)
        public view returns (bytes32)
    {
        bytes32 domain = _registeredDomain(pool);
        DomainState storage current = domains[domain];
        _requireCodecLibrary();
        FlatHubCodec.Health memory health;
        health.pool = pool; health.domain = domain;
        health.hubDomain = hubDomain; health.registryCommitment = registryCommitment;
        health.evidenceState = current.evidenceState;
        health.receiptRoot = current.receiptRoot; health.receiptCount = current.receiptCount;
        health.spentTagDigest = spentTagDigest; health.spentTagCount = spentTagCount;
        health.spentTagSequence = spentTagSequence; health.revokedDigest = current.revokedDigest;
        health.revokedCount = revokedCount; health.revocationSequence = revocationSequence;
        health.stateSequence = stateSequence; health.revocationOverflowDigest = revocationOverflowDigest;
        health.revocationOverflowCount = revocationOverflowCount; health.halted = halted;
        health.validFrom = validFrom; health.validUntil = validUntil;
        return FlatHubCodec.finalityHealthDigest(health);
    }

    /// @notice Honest signers must scan the GLOBAL admitted and outstanding
    /// certified-fact inventory across both pools, including not-yet-admitted
    /// certificates, publish adverse facts first and refuse unknown health.
    /// The contract cannot prove completeness or native consensus/finality.
    function verifyFinalityHealth(address pool, uint64 validFrom, uint64 validUntil,
        FlatHubCodec.QuorumSignature[3] calldata signatures) public view returns (bool)
    {
        if (!(!halted)) revert NativeHalted();
        _window(validFrom, validUntil);
        if (!(validUntil - validFrom <= MAX_FINALITY_HEALTH_SECONDS)) revert FinalityHealthWindowTooLong();
        _verifyQuorum(finalityHealthDigest(pool, validFrom, validUntil), signatures);
        return true;
    }

    function revocationMessage(
        bytes32 gid, uint64 expectedSequence, bytes32 reasonCommitment, uint64 authorizationExpiry
    ) public view returns (bytes32) {
        _requireCodecLibrary();
        return FlatHubCodec.revocationMessage(hubDomain, registryCommitment,
            gid, expectedSequence, reasonCommitment, authorizationExpiry);
    }

    function recordCheckpoint(
        address pool,
        uint64 expectedPoolSequence,
        uint64 expectedHubStateSequence,
        bytes32 requestId,
        uint64 validUntil,
        FlatHubCodec.QuorumSignature[3] calldata signatures
    ) external nonReentrant returns (
        bytes32 digest, bytes32 root, uint32 index
    ) {
        if (!(requestId != bytes32(0))) revert CheckpointZeroRequest();
        bytes32 binding = checkpointAuthorizationDigest(
            pool, expectedPoolSequence, expectedHubStateSequence, requestId, validUntil
        );
        CheckpointRequest storage prior = checkpointRequests[requestId];
        if (prior.accepted) {
            if (!(prior.binding == binding)) revert CheckpointRequestRebound();
            return (prior.digest, prior.root, prior.index);
        }
        if (!(block.timestamp < validUntil)) revert CheckpointAuthorizationExpired();
        if (!(checkpointCount < CAPACITY)) revert CheckpointTreeFull();
        FlatHubCodec.Snapshot memory snapshot = _readSnapshot(pool);
        if (!(snapshot.poolStateSequence == expectedPoolSequence)) revert CheckpointPoolSequenceChanged();
        if (!(snapshot.hubStateSequence == expectedHubStateSequence)) revert CheckpointHubSequenceChanged();
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

    function checkpointAuthorizationDigest(address pool, uint64 expectedPoolSequence,
        uint64 expectedHubStateSequence, bytes32 requestId, uint64 validUntil)
        public view returns (bytes32)
    {
        _requireCodecLibrary();
        return FlatHubCodec.checkpointAuthorizationDigest(hubDomain, registryCommitment,
            pool, expectedPoolSequence, expectedHubStateSequence, requestId, validUntil);
    }

    function isCheckpointCurrent(bytes32 digest) external view returns (bool) {
        uint32 position = checkpointIndexPlusOne[digest];
        if (position == 0) return false;
        FlatHubCodec.Snapshot storage recorded = checkpoints[position - 1];
        if (!_poolCodeValid(recorded.pool)) return false;
        FlatHubCodec.Snapshot memory current = _readSnapshot(recorded.pool);
        current.timestamp = recorded.timestamp;
        return hashSnapshot(current) == digest;
    }

    function currentSnapshot(address pool) external view returns (FlatHubCodec.Snapshot memory) {
        return _readSnapshot(pool);
    }

    function checkpointAt(uint32 index) external view returns (FlatHubCodec.Snapshot memory) {
        if (!(index < checkpointCount)) revert CheckpointIndex();
        return checkpoints[index];
    }

    function hashSnapshot(FlatHubCodec.Snapshot memory snapshot) public view returns (bytes32) {
        _requireCodecLibrary();
        return FlatHubCodec.hashSnapshot(hubDomain, registryCommitment, snapshot);
    }

    function checkpointTreeNodes() external view returns (bytes32[128] memory) { return checkpointNodes; }

    function spentTagList() external view returns (bytes32[64] memory) { return spentTags; }

    function revokedList() external view returns (bytes32[64] memory) { return revokedGIDs; }

    function attester(uint8 index) external view returns (uint256 x, uint256 y, address signer) {
        if (!(index < SIGNER_COUNT)) revert AttesterIndex();
        return (attesterX[index], attesterY[index], attesterAddresses[index]);
    }

    function isRegisteredPool(address pool) external view returns (bool) {
        return _poolCodeValid(pool);
    }

    function nodeHash(bytes32 left, bytes32 right) public pure returns (bytes32) {
        return sha256(abi.encodePacked(bytes1(0x01), left, right));
    }

    function canonicalState(address pool) external view returns (HubState memory state,
        bytes32[64] memory commitments, bytes32[64] memory tags, bytes32[64] memory revokedIdentities)
    {
        bytes32 domain = _registeredDomain(pool);
        DomainState storage current = domains[domain];
        state.domain = domain;
        state.receiptRoot = current.receiptRoot; state.receiptCount = current.receiptCount;
        state.spentTagDigest = spentTagDigest; state.spentTagCount = spentTagCount;
        state.spentTagSequence = spentTagSequence; state.revokedDigest = current.revokedDigest;
        state.revokedCount = revokedCount; state.revocationSequence = revocationSequence;
        state.stateSequence = stateSequence; state.evidenceState = current.evidenceState;
        state.halted = halted; state.reservedTagCapacity = reservedTagCapacityByPool[pool];
        state.totalReservedTagCapacity = totalReservedTagCapacity;
        for (uint256 i = 0; i < CAPACITY; ++i) commitments[i] = current.receiptNodes[CAPACITY + i];
        return (state, commitments, spentTags, revokedGIDs);
    }

    function receiptRoot(bytes32 domain) external view returns (bytes32) { return domains[domain].receiptRoot; }
    function receiptCount(bytes32 domain) external view returns (uint32) { return domains[domain].receiptCount; }
    function revokedDigest(bytes32 domain) external view returns (bytes32) { return domains[domain].revokedDigest; }
    function evidenceState(bytes32 domain) external view returns (bytes32) { return domains[domain].evidenceState; }
    function evidenceStateCount(bytes32 domain) external view returns (uint64) { return domains[domain].evidenceStateCount; }
    function receiptTreeNodes(bytes32 domain) external view returns (bytes32[128] memory) { return domains[domain].receiptNodes; }
    function evidenceStateHistory(bytes32 domain) external view returns (bytes32[129] memory) {
        return domains[domain].evidenceStates;
    }

    function admissionRevocationState(bytes32 domain) public view returns (bytes32) {
        if (!(domainPool[domain] != address(0))) revert UnknownDomain();
        _requireMathLibrary();
        return bytes32(Poseidon2Domains.admissionRevocationState(uint256(domain),
            uint256(domains[domain].revokedDigest), revokedCount, revocationSequence));
    }

    function _registeredDomain(address pool) private view returns (bytes32 domain) {
        _requirePool(pool);
        domain = poolDomain[pool];
        if (!(domain != bytes32(0) && domainPool[domain] == pool)) revert PoolDomainNotRegistered();
    }

    function _readSnapshot(address pool) private view returns (FlatHubCodec.Snapshot memory snapshot) {
        bytes32 domain = _registeredDomain(pool);
        if (!(block.timestamp <= type(uint64).max)) revert TimestampRange();
        IPrivateFlatCheckpointPool target = IPrivateFlatCheckpointPool(pool);
        if (!(!target.transitionInProgress())) revert PoolTransitionInProgress();
        DomainState storage current = domains[domain];
        snapshot.pool = pool;
        snapshot.scope = target.scope(); snapshot.policy = target.policy();
        snapshot.assetIdentity = target.assetIdentity(); snapshot.poolRoot = target.currentRoot();
        snapshot.poolSpentDigest = target.spentDigest(); snapshot.poolSpentCount = target.spentCount();
        snapshot.poolStateSequence = target.stateSequence();
        snapshot.receiptRoot = current.receiptRoot; snapshot.receiptCount = current.receiptCount;
        snapshot.spentTagDigest = spentTagDigest; snapshot.spentTagCount = spentTagCount;
        snapshot.spentTagSequence = spentTagSequence; snapshot.revokedDigest = current.revokedDigest;
        snapshot.revokedCount = revokedCount; snapshot.revocationSequence = revocationSequence;
        snapshot.hubStateSequence = stateSequence; snapshot.registryEpoch = registryEpoch;
        snapshot.halt = halted; snapshot.timestamp = uint64(block.timestamp);
    }

    function _snapshotEvidence(bytes32 domain, FlatHubCodec.Snapshot storage snapshot) private view returns (bytes32) {
        _requireMathLibrary();
        return bytes32(Poseidon2Domains.evidenceState(uint256(domain), Poseidon2Domains.EvidenceState({
            hubDomain: hubDomain, registryCommitment: registryCommitment,
            receiptRoot: uint256(snapshot.receiptRoot), receiptCount: snapshot.receiptCount,
            revokedDigest: uint256(snapshot.revokedDigest), revokedCount: snapshot.revokedCount,
            revocationSequence: snapshot.revocationSequence
        })));
    }

    function _recordEvidenceState(bytes32 domain) private {
        _requireMathLibrary();
        DomainState storage current = domains[domain];
        bytes32 state = bytes32(Poseidon2Domains.evidenceState(uint256(domain), Poseidon2Domains.EvidenceState({
            hubDomain: hubDomain, registryCommitment: registryCommitment,
            receiptRoot: uint256(current.receiptRoot), receiptCount: current.receiptCount,
            revokedDigest: uint256(current.revokedDigest), revokedCount: revokedCount,
            revocationSequence: revocationSequence
        })));
        current.evidenceState = state;
        if (current.evidenceStateCount < EVIDENCE_STATE_CAPACITY) current.evidenceStates[current.evidenceStateCount] = state;
        ++current.evidenceStateCount;
        recordedEvidenceStates[domain][state] = true;
        evidenceStateRevocationSequence[domain][state] = revocationSequence;
        emit EvidenceStateRecorded(domain, state, revocationSequence, stateSequence);
    }

    /// @dev Frozen purpose 6: payload133/full137, D, 0x32, hub B32, count,
    /// all 64 GIDs as injective B32 limbs. Vector writes enforce unique nonzero
    /// occupied entries and a zero suffix; overflow never becomes an absence set.
    function _domainRevokedDigest(bytes32 domain) private view returns (bytes32) {
        _requireMathLibrary();
        return bytes32(Poseidon2Domains.revokedDigest(uint256(domain), hubDomain, revokedGIDs, revokedCount));
    }

    function _appendReceipt(bytes32 domain, bytes32 leaf) private {
        _requireMathLibrary();
        DomainState storage current = domains[domain];
        if (!(current.receiptCount < CAPACITY)) revert ReceiptTreeFull();
        uint256 index = CAPACITY + current.receiptCount++;
        current.receiptNodes[index] = leaf;
        for (uint256 level = 1; level <= TREE_DEPTH; ++level) {
            index /= 2;
            current.receiptNodes[index] = bytes32(Poseidon2Domains.nodeHash(uint256(domain), 2, level,
                uint256(current.receiptNodes[2 * index]), uint256(current.receiptNodes[2 * index + 1])));
        }
        current.receiptRoot = current.receiptNodes[1];
        acceptedReceiptRoots[domain][current.receiptRoot] = true;
    }

    // No mutable ledger logic is delegated to the linked math library.
    // Booking/releasing anonymous capacity and legacy exits need no math call.
    function _requireMathLibrary() private view {
        FlatVerifierSet.requireCode(poseidon2Domains, poseidon2DomainsCodeHash);
    }

    function _requireCodecLibrary() private view {
        FlatVerifierSet.requireCode(hubCodec, hubCodecCodeHash);
    }

    function _registerAttesters(uint256[4] memory xs, uint256[4] memory ys) private {
        _requireCodecLibrary();
        for (uint256 i = 0; i < SIGNER_COUNT; ++i) {
            uint256 x = xs[i];
            uint256 y = ys[i];
            address signer = FlatHubCodec.attesterAddress(x, y);
            for (uint256 j = 0; j < i; ++j) {
                if (!(x != xs[j])) revert AttesterDuplicateX();
                if (!(signer != attesterAddresses[j])) revert AttesterDuplicateAddress();
            }
            attesterX[i] = x;
            attesterY[i] = y;
            attesterAddresses[i] = signer;
        }
    }

    function _registryCommitment() private view returns (bytes32) {
        _requireCodecLibrary();
        return FlatNativeValueRegistryV2.commitment(hubDomain, registryEpoch, rulesRoot, attesterX, attesterY);
    }

    function _verifyQuorum(bytes32 message, FlatHubCodec.QuorumSignature[3] calldata signatures) private view {
        _requireCodecLibrary();
        // The signer vector is the fixed constructor registry, never caller data.
        FlatHubCodec.assertQuorum(message, signatures, attesterAddresses);
    }

    function _recordRevocationOverflow(bytes32 gid, bytes32 reasonCommitment, uint64 expiry) private {
        if (!(halted)) revert OverflowRequiresPermanentHalt();
        _requireCodecLibrary();
        ++revocationOverflowCount;
        revocationOverflowDigest = FlatHubCodec.revocationOverflowDigest(
            hubDomain, registryCommitment, revocationOverflowDigest, gid,
            reasonCommitment, revocationSequence, expiry
        );
        emit RevocationOverflow(
            gid, reasonCommitment, expiry, revocationSequence, revocationOverflowCount, revocationOverflowDigest
        );
    }

    function _append(bytes32[128] storage nodes, uint32 position, bytes32 leaf)
        private returns (bytes32)
    {
        if (!(position < CAPACITY)) revert TreeFull();
        uint256 index = CAPACITY + position;
        nodes[index] = leaf;
        while (index > 1) {
            index /= 2;
            nodes[index] = nodeHash(nodes[index * 2], nodes[index * 2 + 1]);
        }
        return nodes[1];
    }

    function _spentDigest() private view returns (bytes32) {
        return sha256(abi.encodePacked(bytes1(0x31), hubDomain, spentTagCount, spentTags));
    }

    function _poolCodeValid(address pool) private view returns (bool) {
        bytes32 expected;
        if (pool == pool0) expected = pool0CodeHash;
        else if (pool == pool1) expected = pool1CodeHash;
        else return false;
        return pool.code.length != 0 && pool.codehash == expected;
    }

    function _requirePool(address pool) private view {
        if (!(_poolCodeValid(pool))) revert PoolNotPinned();
    }

    function _requireNonemptyCodeHash(bytes32 expected) private pure {
        if (!(expected != bytes32(0) && expected != keccak256(""))) revert ConfigCodeHash();
    }

    function _requireCode(address target, bytes32 expected) private view {
        _requireNonemptyCodeHash(expected);
        if (!(target != address(0) && target.code.length != 0 && target.codehash == expected)) revert PinnedCodeMismatch();
    }

    function _window(uint64 validFrom, uint64 validUntil) private view {
        if (!(validFrom < validUntil)) revert InvalidWindow();
        if (!(validFrom <= block.timestamp && block.timestamp < validUntil)) revert OutsideWindow();
    }

}
