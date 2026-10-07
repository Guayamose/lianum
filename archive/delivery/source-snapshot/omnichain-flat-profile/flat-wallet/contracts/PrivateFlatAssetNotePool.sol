// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {FlatVerifierSet} from "./FlatVerifierSet.sol";
import {Poseidon2Domains} from "./crypto/Poseidon2Domains.sol";

interface IPrivateFlatReceiptHub {
    struct QuorumSignature { uint8 signerIndex; uint8 v; bytes32 r; bytes32 s; }
    function hubDomain() external view returns (bytes32);
    function registryCommitment() external view returns (bytes32);
    function verifierSetCommitment() external view returns (bytes32);
    function poseidon2Domains() external view returns (address);
    function poseidon2DomainsCodeHash() external view returns (bytes32);
    function hubCodec() external view returns (address);
    function hubCodecCodeHash() external view returns (bytes32);
    function ledgerNamespace() external view returns (bytes32);
    function pool0() external view returns (address);
    function pool1() external view returns (address);
    function poolDomain(address pool) external view returns (bytes32);
    function isRegisteredPool(address pool) external view returns (bool);
    function isUsable(bytes32 domain, bytes32 evidenceState) external view returns (bool);
    function bookTagCapacity() external;
    function releaseTagCapacity() external;
    function consume(bytes32[4] calldata tags, bytes32 acceptedEvidenceState,
        uint64 healthFrom, uint64 healthUntil, QuorumSignature[3] calldata healthSignatures) external;
}

/// @notice Source-only flat bundle integration. Genuine verifier lineage,
/// compilation, P2 conformance, deployment and full-wallet acceptance are not
/// established by this source. No owner, upgrade, migration or mint bypass.
/// D26/W39 notes, backing, epochs and SHA pool tree retain the golden semantics.
contract PrivateFlatAssetNotePool {
    uint256 public constant TREE_DEPTH = 6;
    uint256 public constant CAPACITY = 64;
    uint256 public constant EPOCH_SECONDS = 600;
    uint256 public constant MAX_NOTE_AMOUNT = type(uint64).max;
    uint256 public constant MAX_BACKED_AMOUNT = CAPACITY * MAX_NOTE_AMOUNT;
    uint256 public constant FUTURE_PAYOUT_SLOTS = 4;

    struct Deployment {
        address asset;
        bytes32 deploymentDomain;
        bytes32 policy;
        FlatVerifierSet.Configuration verifierSet;
        address receiptHub;
        bytes32 receiptHubCodeHash;
        bytes32 hubDomain;
        bytes32 registryCommitment;
    }

    struct Fulfillment {
        bytes32 authorizationRoot;
        bytes32 evidenceState;
        bytes32 reserveNullifier;
        bytes32[4] outputs;
        bytes32[4] tags;
    }

    address public immutable asset;
    bytes32 public immutable assetCodeHash;
    bytes32 public immutable assetIdentity;
    bytes32 public immutable deploymentDomain;
    bytes32 public immutable scope;
    bytes32 public immutable policy;
    bytes32 public immutable domainCommitment;
    bytes32 public immutable verifierSetCommitment;
    address public immutable poseidon2Domains;
    bytes32 public immutable poseidon2DomainsCodeHash;
    address public immutable hubCodec;
    bytes32 public immutable hubCodecCodeHash;
    bytes32 public immutable ledgerNamespace;
    IPrivateFlatReceiptHub public immutable receiptHub;
    bytes32 public immutable receiptHubCodeHash;
    bytes32 public immutable hubDomain;
    bytes32 public immutable registryCommitment;
    FlatVerifierSet.Configuration private verifiers;

    // Exact admitted value less successful exits. Donations create no claims.
    uint256 public backedAmount;
    uint32 public leafCount;
    uint32 public spentCount;
    uint32 public liveReservations;
    // Conservative future-spend capacity, NOT an exact spendable-note count.
    // Four-slot fulfillment padding may retain capacity after real exits.
    uint32 public outputCapacity;
    uint64 public stateSequence;
    bytes32 public currentRoot;
    bytes32 public spentDigest;
    uint32 public rootHistoryCount;
    bytes32 public rootHistoryDigest;

    // Heap indexing: root 1, leaves 64..127; index 0 remains unused and zero.
    bytes32[128] private nodes;
    bytes32[64] private spentEntries;
    bytes32[65] private rootHistoryEntries;
    mapping(bytes32 => bool) public admissions;
    mapping(bytes32 => bool) public insertedCommitments;
    mapping(bytes32 => bool) public spentNullifiers;
    mapping(bytes32 => bool) public acceptedRoots;
    uint256 private entered;

    // Separate P2 kind-0 tree. E is already public in U/S; reserveNF is not.
    bytes32 public authorizationRoot;
    uint32 public authorizationLeafCount;
    uint32 public authorizationRootHistoryCount;
    bytes32[128] private authorizationNodes;
    bytes32[65] private authorizationRootHistoryEntries;
    mapping(bytes32 => bool) public registeredEnvelopes;
    mapping(bytes32 => bool) public acceptedAuthorizationRoots;
    event EnvelopeRegistered(bytes32 indexed envelope, uint32 index, bytes32 root);

    event StateAdvanced(
        uint64 indexed sequence, bytes32 root, bytes32 spent, uint32 leaves, uint32 consumed
    );
    event Withdrawal(address indexed recipient, uint64 amount, bytes32 nullifier);

    modifier nonReentrant() {
        require(entered == 0, "REENTRANCY");
        entered = 1;
        _assertBackingBefore();
        _;
        _assertBacking(0);
        entered = 0;
    }

    // Hub is deployed first with prospective pool addresses/full runtime pins.
    // registerPoolDomain is called on the hub only after this runtime exists.
    constructor(Deployment memory configuration) {
        require(configuration.deploymentDomain != bytes32(0)
            && configuration.policy != bytes32(0), "CONFIG_DOMAIN");
        require(configuration.asset == address(0)
            || configuration.asset.code.length != 0, "CONFIG_ASSET");
        asset = configuration.asset;
        assetCodeHash = configuration.asset == address(0)
            ? bytes32(0) : configuration.asset.codehash;
        assetIdentity = sha256(abi.encodePacked(
            bytes1(0x24), block.chainid, configuration.asset, assetCodeHash
        ));
        deploymentDomain = configuration.deploymentDomain;
        scope = sha256(abi.encodePacked(
            bytes1(0x25), block.chainid, address(this),
            configuration.deploymentDomain, assetIdentity
        ));
        policy = configuration.policy;
        FlatVerifierSet.validate(configuration.verifierSet);
        poseidon2Domains = configuration.verifierSet.poseidon2Domains;
        poseidon2DomainsCodeHash = configuration.verifierSet.poseidon2DomainsCodeHash;
        hubCodec = configuration.verifierSet.hubCodec;
        hubCodecCodeHash = configuration.verifierSet.hubCodecCodeHash;
        verifiers = configuration.verifierSet;
        verifierSetCommitment = FlatVerifierSet.commitment(configuration.verifierSet);
        FlatVerifierSet.requireCode(configuration.receiptHub, configuration.receiptHubCodeHash);
        require(configuration.hubDomain != bytes32(0)
            && configuration.registryCommitment != bytes32(0), "CONFIG_NATIVE_DOMAIN");
        IPrivateFlatReceiptHub hub = IPrivateFlatReceiptHub(configuration.receiptHub);
        require(hub.hubDomain() == configuration.hubDomain, "CONFIG_HUB_DOMAIN");
        require(hub.registryCommitment() == configuration.registryCommitment, "CONFIG_REGISTRY");
        require(hub.verifierSetCommitment() == verifierSetCommitment, "CONFIG_VERIFIER_SET");
        require(hub.poseidon2Domains() == poseidon2Domains
            && hub.poseidon2DomainsCodeHash() == poseidon2DomainsCodeHash, "CONFIG_MATH_LIBRARY");
        require(hub.hubCodec() == hubCodec && hub.hubCodecCodeHash() == hubCodecCodeHash, "CONFIG_HUB_CODEC");
        require(hub.ledgerNamespace() == configuration.hubDomain, "CONFIG_NAMESPACE");
        require(hub.pool0() == address(this) || hub.pool1() == address(this), "CONFIG_POOL_REGISTRATION");
        receiptHub = hub;
        receiptHubCodeHash = configuration.receiptHubCodeHash;
        hubDomain = configuration.hubDomain;
        registryCommitment = configuration.registryCommitment;
        ledgerNamespace = configuration.hubDomain;
        domainCommitment = FlatVerifierSet.domainCommitment([
            scope, policy, assetIdentity, hubDomain, registryCommitment,
            verifierSetCommitment, ledgerNamespace
        ]);
        for (uint256 i = CAPACITY - 1; i > 0; --i) {
            nodes[i] = nodeHash(nodes[i * 2], nodes[i * 2 + 1]);
        }
        currentRoot = nodes[1];
        _acceptCurrentRoot();
        spentDigest = _spentDigest();
        _initializeAuthorizationTree();
    }

    function verifierConfiguration() external view returns (FlatVerifierSet.Configuration memory) {
        return verifiers;
    }

    /// @notice Original D26 current-epoch backed balance-note deposit.
    function depositBalance(bytes calldata proof, bytes32[] calldata inputs)
        external payable nonReentrant
    {
        _legacyDomain(inputs, 26);
        uint64 amount = _u64(inputs[17]);
        require(amount > 0, "DEPOSIT_AMOUNT");
        bytes32 output = _digest(inputs, 18);
        _availableOutput(output);
        _headroom(
            uint256(leafCount) + 1, spentCount, liveReservations, uint256(outputCapacity) + 1
        );
        require(FlatVerifierSet.verify(verifiers, FlatVerifierSet.DEPOSIT_BALANCE, proof, inputs), "DEPOSIT_BALANCE_PROOF");

        _receiveAsset(amount);
        ++outputCapacity;
        _append(output);
        _advance();
    }

    /// @notice Owner-authorized backed deposit during an absolute interval.
    /// Same type-4 note and insertion ledger as D26; no epoch guess or issuer
    /// assertion can replace the genuine D27 proof or the received asset.
    function depositBalanceIntent(bytes calldata proof, bytes32[] calldata inputs)
        external payable nonReentrant
    {
        require(inputs.length == 27, "PUBLIC_INPUT_LENGTH");
        require(_digest(inputs, 0) == scope && _digest(inputs, 8) == policy, "PUBLIC_DOMAIN");
        _window(_u64(inputs[16]), _u64(inputs[17]));
        uint64 amount = _u64(inputs[18]);
        require(amount > 0, "DEPOSIT_AMOUNT");
        bytes32 output = _digest(inputs, 19);
        _availableOutput(output);
        _headroom(uint256(leafCount) + 1, spentCount, liveReservations, uint256(outputCapacity) + 1);
        require(FlatVerifierSet.verify(verifiers, FlatVerifierSet.DEPOSIT_INTENT, proof, inputs),
            "DEPOSIT_INTENT_PROOF");
        _receiveAsset(amount);
        ++outputCapacity;
        _append(output);
        _advance();
    }

    /// @notice Atomic U16/S58, guarded original input-root/sequence/post-root.
    /// There is deliberately no public reserve-nullifier ticket or E/NF map.
    function reserveGenericGuarded(
        FlatVerifierSet.Proof calldata authorization,
        FlatVerifierSet.Proof calldata reservation,
        uint64 expectedSequence,
        bytes32 expectedPostRoot
    ) external nonReentrant {
        _flatDomain(authorization.inputs, 16);
        _flatDomain(reservation.inputs, 58);
        bytes32 envelope = _fieldDigest(reservation.inputs, 8);
        require(envelope != bytes32(0) && !registeredEnvelopes[envelope], "ENVELOPE_ALREADY_REGISTERED");
        require(_fieldDigest(authorization.inputs, 8) == envelope, "AUTHORIZATION_ENVELOPE_MISMATCH");
        require(currentRoot == _digest(reservation.inputs, 16), "RESERVE_ROOT_CHANGED");
        require(stateSequence == expectedSequence, "RESERVE_SEQUENCE_CHANGED");
        _window(_u64(reservation.inputs[56]), _u64(reservation.inputs[57]));
        bytes32 nullifier = _digest(reservation.inputs, 24);
        bytes32 reserve = _digest(reservation.inputs, 32);
        bytes32 change = _digest(reservation.inputs, 40);
        bytes32 admission = _digest(reservation.inputs, 48);
        _availableNullifier(nullifier);
        require(admission != bytes32(0) && !admissions[admission], "ORIGIN_ALREADY_ADMITTED");
        _availableOutput(reserve);
        _availableOutput(change);
        require(reserve != change, "DUPLICATE_OUTPUT");
        require(outputCapacity > 0, "NO_OUTPUT_CAPACITY");
        require(authorizationLeafCount < CAPACITY, "AUTHORIZATION_TREE_FULL");
        _headroom(uint256(leafCount) + 2, uint256(spentCount) + 1,
            uint256(liveReservations) + 1, outputCapacity);
        _requireReceiptHub();
        require(FlatVerifierSet.verify(verifiers, FlatVerifierSet.U,
            authorization.proof, authorization.inputs), "AUTHORIZATION_PROOF");
        require(FlatVerifierSet.verify(verifiers, FlatVerifierSet.S,
            reservation.proof, reservation.inputs), "RESERVATION_PROOF");

        // Hub booking checks current halt and global capacity. Failure in any
        // subsequent step reverts hub and pool state in this same transaction.
        receiptHub.bookTagCapacity();
        _consume(nullifier);
        admissions[admission] = true;
        ++liveReservations;
        _append(reserve);
        _append(change);
        require(nodes[1] == expectedPostRoot, "RESERVE_POST_ROOT_MISMATCH");
        _appendAuthorization(envelope);
        // Neither the reserve-only note root nor an unfunded E is accepted.
        _advance();
    }

    /// @notice F41 keeps the original cutoff with no new expiring refund window.
    /// No health, evidence freshness or foreign-runtime dependency on recovery.
    function recoverGeneric(bytes calldata proof, bytes32[] calldata inputs) external nonReentrant {
        _flatDomain(inputs, 41);
        require(acceptedAuthorizationRoots[_fieldDigest(inputs, 8)], "UNKNOWN_AUTHORIZATION_ROOT");
        _acceptedRoot(_digest(inputs, 16));
        require(block.timestamp >= _u64(inputs[40]), "RECOVERY_BEFORE_SETTLEMENT_DEADLINE");
        bytes32 nullifier = _digest(inputs, 24);
        bytes32 recovery = _digest(inputs, 32);
        _availableNullifier(nullifier);
        _availableOutput(recovery);
        require(liveReservations > 0, "NO_LIVE_RESERVATION");
        _headroom(uint256(leafCount) + 1, uint256(spentCount) + 1,
            uint256(liveReservations) - 1, uint256(outputCapacity) + 1);
        require(FlatVerifierSet.verify(verifiers, FlatVerifierSet.F, proof, inputs), "RECOVERY_PROOF");
        // This code/identity check and capacity release explicitly ignore halt.
        _requireReceiptHub();
        _consume(nullifier);
        --liveReservations;
        ++outputCapacity;
        receiptHub.releaseTagCapacity();
        _append(recovery);
        _advance();
    }

    function withdrawBalance(bytes calldata proof, bytes32[] calldata inputs) external nonReentrant {
        _withdraw(proof, inputs, FlatVerifierSet.WITHDRAW_BALANCE);
    }

    function withdraw(bytes calldata proof, bytes32[] calldata inputs) external nonReentrant {
        _withdraw(proof, inputs, FlatVerifierSet.WITHDRAW_OUTPUT);
    }

    function _withdraw(
        bytes calldata proof,
        bytes32[] calldata inputs,
        uint256 verifierRole
    ) private {
        _legacyDomain(inputs, 39);
        _acceptedRoot(_digest(inputs, 17));
        bytes32 nullifier = _digest(inputs, 25);
        uint64 amount = _u64(inputs[33]);
        uint160 rawRecipient;
        for (uint256 i = 34; i < 39; ++i) {
            rawRecipient = (rawRecipient << 32) | uint160(_u32(inputs[i]));
        }
        address recipient = address(rawRecipient);
        require(amount > 0 && recipient != address(0), "WITHDRAWAL_TERMS");
        require(recipient != address(this), "ASSET_SELF_RECIPIENT");
        require(backedAmount >= amount, "ASSET_INSUFFICIENT_BACKING");
        require(outputCapacity > 0, "NO_OUTPUT_CAPACITY");
        _availableNullifier(nullifier);
        require(FlatVerifierSet.verify(verifiers, verifierRole, proof, inputs), "WITHDRAW_PROOF");

        _consume(nullifier);
        --outputCapacity;
        backedAmount -= amount;
        _advance();
        // Failure rolls back counters, spent state, roots, sequence and events.
        _sendAsset(recipient, amount);
        emit Withdrawal(recipient, amount, nullifier);
    }

    /// @notice Verify all four pinned N32 proofs and T138, including padding.
    function fulfillGeneric(
        FlatVerifierSet.Proof calldata settlement,
        FlatVerifierSet.Proof[4] calldata completions,
        uint64 healthFrom,
        uint64 healthUntil,
        IPrivateFlatReceiptHub.QuorumSignature[3] calldata healthSignatures
    ) external nonReentrant {
        Fulfillment memory fulfillment = _fulfillmentInputs(settlement.inputs);
        _requireReceiptHub();
        require(receiptHub.isUsable(domainCommitment, fulfillment.evidenceState), "UNUSABLE_EVIDENCE_STATE");
        require(liveReservations > 0, "NO_LIVE_RESERVATION");
        _headroom(uint256(leafCount) + FUTURE_PAYOUT_SLOTS, uint256(spentCount) + 1,
            uint256(liveReservations) - 1, uint256(outputCapacity) + FUTURE_PAYOUT_SLOTS);
        for (uint256 i = 0; i < FUTURE_PAYOUT_SLOTS; ++i) {
            _flatDomain(completions[i].inputs, 32);
            require(_fieldDigest(completions[i].inputs, 8) == fulfillment.authorizationRoot,
                "NODE_AUTHORIZATION_MISMATCH");
            require(_fieldDigest(completions[i].inputs, 16) == fulfillment.evidenceState,
                "NODE_EVIDENCE_MISMATCH");
            require(_fieldDigest(completions[i].inputs, 24)
                == _fieldDigest(settlement.inputs, 104 + 8 * i), "NODE_COMPLETION_MISMATCH");
            require(FlatVerifierSet.verify(verifiers, FlatVerifierSet.N,
                completions[i].proof, completions[i].inputs), "NODE_PROOF");
        }
        require(FlatVerifierSet.verify(verifiers, FlatVerifierSet.T,
            settlement.proof, settlement.inputs), "SETTLEMENT_PROOF");

        _consume(fulfillment.reserveNullifier);
        receiptHub.consume(fulfillment.tags, fulfillment.evidenceState,
            healthFrom, healthUntil, healthSignatures);
        --liveReservations;
        outputCapacity += uint32(FUTURE_PAYOUT_SLOTS);
        for (uint256 i = 0; i < FUTURE_PAYOUT_SLOTS; ++i) _append(fulfillment.outputs[i]);
        _advance();
    }

    function _fulfillmentInputs(bytes32[] calldata inputs)
        private view returns (Fulfillment memory fulfillment)
    {
        _flatDomain(inputs, 138);
        fulfillment.authorizationRoot = _fieldDigest(inputs, 8);
        require(acceptedAuthorizationRoots[fulfillment.authorizationRoot], "UNKNOWN_AUTHORIZATION_ROOT");
        fulfillment.evidenceState = _fieldDigest(inputs, 16);
        _acceptedRoot(_digest(inputs, 24));
        fulfillment.reserveNullifier = _digest(inputs, 32);
        _availableNullifier(fulfillment.reserveNullifier);
        for (uint256 i = 0; i < FUTURE_PAYOUT_SLOTS; ++i) {
            fulfillment.outputs[i] = _digest(inputs, 40 + 8 * i);
            fulfillment.tags[i] = _digest(inputs, 72 + 8 * i);
            _availableOutput(fulfillment.outputs[i]);
            require(fulfillment.tags[i] != bytes32(0), "ZERO_RECEIPT_TAG");
            for (uint256 j = 0; j < i; ++j) {
                require(fulfillment.outputs[i] != fulfillment.outputs[j], "DUPLICATE_OUTPUT");
                require(fulfillment.tags[i] != fulfillment.tags[j], "DUPLICATE_TAG");
            }
        }
        // Original cutoff is authenticated privately by T, and cannot be widened.
        _window(_u64(inputs[136]), _u64(inputs[137]));
    }

    function _requireReceiptHub() private view {
        FlatVerifierSet.requireCode(address(receiptHub), receiptHubCodeHash);
        require(receiptHub.hubDomain() == hubDomain, "HUB_DOMAIN_CHANGED");
        require(receiptHub.registryCommitment() == registryCommitment, "REGISTRY_CHANGED");
        require(receiptHub.verifierSetCommitment() == verifierSetCommitment, "VERIFIER_SET_CHANGED");
        require(receiptHub.ledgerNamespace() == ledgerNamespace, "NAMESPACE_CHANGED");
        require(receiptHub.isRegisteredPool(address(this)), "POOL_NOT_PINNED");
        require(receiptHub.poolDomain(address(this)) == domainCommitment, "POOL_DOMAIN_NOT_REGISTERED");
    }

    function _flatDomain(bytes32[] calldata inputs, uint256 size) private view {
        require(inputs.length == size, "PUBLIC_INPUT_LENGTH");
        require(_fieldDigest(inputs, 0) == domainCommitment, "PUBLIC_DOMAIN");
    }

    function _fieldDigest(bytes32[] calldata inputs, uint256 offset) private pure returns (bytes32) {
        return FlatVerifierSet.canonical(_digest(inputs, offset));
    }

    function _initializeAuthorizationTree() private {
        _requireMathLibrary();
        bytes32 empty = bytes32(Poseidon2Domains.emptyLeaf(uint256(domainCommitment), 0));
        for (uint256 i = CAPACITY; i < 2 * CAPACITY; ++i) authorizationNodes[i] = empty;
        // Equal empty subtrees need one hash per level, then fill every node.
        for (uint256 level = 1; level <= TREE_DEPTH; ++level) {
            empty = bytes32(Poseidon2Domains.nodeHash(uint256(domainCommitment), 0, level,
                uint256(empty), uint256(empty)));
            uint256 start = CAPACITY >> level;
            for (uint256 i = start; i < 2 * start; ++i) authorizationNodes[i] = empty;
        }
        authorizationRoot = authorizationNodes[1];
        _acceptAuthorizationRoot();
    }

    function _appendAuthorization(bytes32 envelope) private {
        _requireMathLibrary();
        require(authorizationLeafCount < CAPACITY && !registeredEnvelopes[envelope], "AUTHORIZATION_FULL_OR_REUSED");
        bytes32 leaf = bytes32(Poseidon2Domains.authorizationLeaf(uint256(domainCommitment), uint256(envelope)));
        require(leaf != bytes32(0)
            && leaf != bytes32(Poseidon2Domains.emptyLeaf(uint256(domainCommitment), 0)), "EMPTY_AUTHORIZATION_LEAF");
        registeredEnvelopes[envelope] = true;
        uint32 position = authorizationLeafCount++;
        uint256 index = CAPACITY + position;
        authorizationNodes[index] = leaf;
        for (uint256 level = 1; level <= TREE_DEPTH; ++level) {
            index /= 2;
            authorizationNodes[index] = bytes32(Poseidon2Domains.nodeHash(
                uint256(domainCommitment), 0, level,
                uint256(authorizationNodes[2 * index]), uint256(authorizationNodes[2 * index + 1])));
        }
        authorizationRoot = authorizationNodes[1];
        _acceptAuthorizationRoot();
        emit EnvelopeRegistered(envelope, position, authorizationRoot);
    }

    function _acceptAuthorizationRoot() private {
        if (!acceptedAuthorizationRoots[authorizationRoot]) {
            require(authorizationRootHistoryCount < CAPACITY + 1, "AUTHORIZATION_HISTORY_FULL");
            acceptedAuthorizationRoots[authorizationRoot] = true;
            authorizationRootHistoryEntries[authorizationRootHistoryCount++] = authorizationRoot;
        }
    }

    // Linked calls reach a stateless public-pure Solidity library. Pin its
    // complete live runtime before every path that uses its implementation.
    // Legacy withdrawals and refund capacity release do not call this library.
    function _requireMathLibrary() private view {
        FlatVerifierSet.requireCode(poseidon2Domains, poseidon2DomainsCodeHash);
    }

    function authorizationTreeNodes() external view returns (bytes32[128] memory) { return authorizationNodes; }
    function authorizationRootHistory() external view returns (bytes32[65] memory) {
        return authorizationRootHistoryEntries;
    }

    function transitionInProgress() external view returns (bool) { return entered != 0; }

    function nodeHash(bytes32 left, bytes32 right) public pure returns (bytes32) {
        return sha256(abi.encodePacked(bytes1(0x01), left, right));
    }

    function treeNodes() external view returns (bytes32[128] memory) { return nodes; }

    function spentList() external view returns (bytes32[64] memory) { return spentEntries; }

    function rootHistory() external view returns (bytes32[65] memory) { return rootHistoryEntries; }

    function noteLeaves() external view returns (bytes32[64] memory result) {
        for (uint256 i = 0; i < CAPACITY; ++i) result[i] = nodes[CAPACITY + i];
    }

    function canonicalState() external view returns (
        bytes32 root,
        bytes32 digest,
        uint64 sequence,
        uint32 leaves,
        uint32 consumed,
        uint32 reservations,
        uint32 outputs,
        bytes32[64] memory commitments,
        bytes32[64] memory nullifiers
    ) {
        for (uint256 i = 0; i < CAPACITY; ++i) commitments[i] = nodes[CAPACITY + i];
        return (
            currentRoot, spentDigest, stateSequence, leafCount, spentCount,
            liveReservations, outputCapacity, commitments, spentEntries
        );
    }

    function canonicalRootHistory() external view returns (
        uint64 sequence, bytes32 digest, uint32 count, bytes32[65] memory roots
    ) {
        return (stateSequence, rootHistoryDigest, rootHistoryCount, rootHistoryEntries);
    }

    function canonicalBacking() external view returns (
        uint64 sequence,
        uint256 admitted,
        uint256 actual,
        uint256 surplus,
        uint256 deficit,
        uint256 unrelatedNative
    ) {
        actual = _assetBalance(address(this));
        admitted = backedAmount;
        surplus = actual > admitted ? actual - admitted : 0;
        deficit = admitted > actual ? admitted - actual : 0;
        unrelatedNative = asset == address(0) ? 0 : address(this).balance;
        return (stateSequence, admitted, actual, surplus, deficit, unrelatedNative);
    }

    function canRetire() external view returns (bool) {
        return backedAmount == 0 && liveReservations == 0
            && _assetBalance(address(this)) == 0 && address(this).balance == 0;
    }

    function _legacyDomain(bytes32[] calldata inputs, uint256 size) private view {
        require(inputs.length == size, "PUBLIC_INPUT_LENGTH");
        require(_digest(inputs, 0) == scope && _digest(inputs, 8) == policy, "PUBLIC_DOMAIN");
        require(uint256(_u64(inputs[16])) == block.timestamp / EPOCH_SECONDS, "STALE_EPOCH");
    }

    function _window(uint64 validFrom, uint64 validUntil) private view {
        require(validFrom < validUntil, "INVALID_WINDOW");
        require(validFrom <= block.timestamp && block.timestamp < validUntil, "OUTSIDE_WINDOW");
    }

    function _acceptedRoot(bytes32 root) private view {
        require(acceptedRoots[root], "UNKNOWN_ROOT");
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

    function _spentDigest() private view returns (bytes32) {
        return sha256(abi.encodePacked(bytes1(0x02), scope, spentCount, spentEntries));
    }

    function _rootHistoryDigest() private view returns (bytes32) {
        return sha256(abi.encodePacked(bytes1(0x18), scope, rootHistoryCount, rootHistoryEntries));
    }

    function _acceptCurrentRoot() private {
        if (!acceptedRoots[currentRoot]) {
            // Each root after the initial empty root requires at least one leaf.
            require(rootHistoryCount < CAPACITY + 1 && rootHistoryCount <= leafCount, "ROOT_HISTORY_FULL");
            acceptedRoots[currentRoot] = true;
            rootHistoryEntries[rootHistoryCount++] = currentRoot;
            rootHistoryDigest = _rootHistoryDigest();
        }
    }

    function _headroom(uint256 leaves, uint256 consumed, uint256 reservations, uint256 outputs)
        private pure
    {
        require(leaves + FUTURE_PAYOUT_SLOTS * reservations <= CAPACITY, "TREE_HEADROOM");
        require(consumed + (FUTURE_PAYOUT_SLOTS + 1) * reservations + outputs <= CAPACITY, "SPENT_HEADROOM");
    }

    function _advance() private {
        _headroom(leafCount, spentCount, liveReservations, outputCapacity);
        currentRoot = nodes[1];
        _acceptCurrentRoot();
        ++stateSequence;
        emit StateAdvanced(stateSequence, currentRoot, spentDigest, leafCount, spentCount);
    }

    function _assetBalance(address holder) private view returns (uint256) {
        if (asset == address(0)) return holder.balance;
        require(asset.codehash == assetCodeHash, "ASSET_CODE_CHANGED");
        (bool ok, bytes memory returned) = asset.staticcall(
            abi.encodeWithSelector(bytes4(0x70a08231), holder)
        );
        require(ok && returned.length == 32, "ASSET_BALANCE_RETURN");
        return abi.decode(returned, (uint256));
    }

    function _assertBackingBefore() private view {
        _assertBacking(msg.value);
    }

    function _assertBacking(uint256 incomingNative) private view {
        if (asset != address(0)) require(incomingNative == 0, "TOKEN_NATIVE_VALUE");
        uint256 actual = _assetBalance(address(this));
        require(actual >= incomingNative && actual - incomingNative >= backedAmount, "ASSET_BACKING_DEFICIT");
    }

    function _strictAssetCall(bytes memory data) private {
        (bool ok, bytes memory returned) = asset.call(data);
        require(ok, "ASSET_TRANSFER_FAILED");
        require(returned.length == 32, "ASSET_TRANSFER_RETURN");
        // Require canonical true, not an arbitrary nonzero ABI word.
        require(abi.decode(returned, (uint256)) == 1, "ASSET_TRANSFER_FALSE");
    }

    function _receiveAsset(uint64 amount) private {
        require(backedAmount <= MAX_BACKED_AMOUNT - amount, "ASSET_VALUE_BOUND");
        if (asset == address(0)) {
            require(msg.value == amount, "DEPOSIT_AMOUNT");
        } else {
            require(msg.value == 0 && msg.sender != address(this), "TOKEN_NATIVE_VALUE");
            uint256 poolBefore = _assetBalance(address(this));
            uint256 senderBefore = _assetBalance(msg.sender);
            _strictAssetCall(abi.encodeWithSelector(
                bytes4(0x23b872dd), msg.sender, address(this), uint256(amount)
            ));
            uint256 poolAfter = _assetBalance(address(this));
            uint256 senderAfter = _assetBalance(msg.sender);
            require(poolAfter >= poolBefore && poolAfter - poolBefore == amount, "ASSET_INEXACT_POOL_IN");
            require(senderBefore >= senderAfter && senderBefore - senderAfter == amount, "ASSET_INEXACT_SENDER");
        }
        backedAmount += amount;
    }

    function _sendAsset(address recipient, uint64 amount) private {
        uint256 poolBefore = _assetBalance(address(this));
        uint256 recipientBefore = _assetBalance(recipient);
        if (asset == address(0)) {
            (bool sent,) = recipient.call{value: amount}("");
            require(sent, "WITHDRAWAL_FAILED");
        } else {
            _strictAssetCall(abi.encodeWithSelector(bytes4(0xa9059cbb), recipient, uint256(amount)));
        }
        uint256 poolAfter = _assetBalance(address(this));
        uint256 recipientAfter = _assetBalance(recipient);
        require(poolBefore >= poolAfter && poolBefore - poolAfter == amount, "ASSET_INEXACT_POOL_OUT");
        require(recipientAfter >= recipientBefore && recipientAfter - recipientBefore == amount, "ASSET_INEXACT_RECIPIENT");
    }
}
