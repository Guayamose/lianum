// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

interface IPrivateGenericAssetNoteVerifier {
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool);
}

/// @notice LOCAL RESEARCH ONLY. A new, bounded, single-asset note ledger for
/// D26 deposits, legacy W39 exits, generic S66 reservations and F51 recovery.
/// Generic fulfillment is deliberately unavailable. There is no finality
/// authority, host-approved shortcut, owner, upgrade or migration entry point.
///
/// Verifier addresses and their current runtime code hashes are immutable.
/// The constructor cannot establish that their circuits are sound or genuine:
/// deployment tooling must pin the audited/generated artifacts and their keys.
/// Only native value or a fixed local test ERC20 is a supported asset profile;
/// code hashes and observed balance deltas do not validate arbitrary tokens.
contract PrivateGenericAssetNotePool {
    uint256 public constant TREE_DEPTH = 6;
    uint256 public constant CAPACITY = 64;
    uint256 public constant EPOCH_SECONDS = 600;
    uint256 public constant MAX_NOTE_AMOUNT = type(uint64).max;
    uint256 public constant MAX_BACKED_AMOUNT = CAPACITY * MAX_NOTE_AMOUNT;
    uint256 public constant FUTURE_PAYOUT_SLOTS = 4;
    bytes32 public constant FUNDED_GRAPH_PROFILE = sha256("LIANUM_PAEG_FUNDED_4_V1");
    bool public constant GENERIC_FULFILLMENT_ENABLED = false;

    address public immutable asset;
    bytes32 public immutable assetCodeHash;
    bytes32 public immutable assetIdentity;
    bytes32 public immutable deploymentDomain;
    bytes32 public immutable scope;
    bytes32 public immutable policy;

    IPrivateGenericAssetNoteVerifier public immutable depositBalanceVerifier;
    IPrivateGenericAssetNoteVerifier public immutable withdrawBalanceVerifier;
    IPrivateGenericAssetNoteVerifier public immutable withdrawVerifier;
    IPrivateGenericAssetNoteVerifier public immutable reserveGenericVerifier;
    IPrivateGenericAssetNoteVerifier public immutable recoverGenericVerifier;
    bytes32 public immutable depositBalanceVerifierCodeHash;
    bytes32 public immutable withdrawBalanceVerifierCodeHash;
    bytes32 public immutable withdrawVerifierCodeHash;
    bytes32 public immutable reserveGenericVerifierCodeHash;
    bytes32 public immutable recoverGenericVerifierCodeHash;

    // Exact admitted value less successful exits. Donations create no claims.
    uint256 public backedAmount;
    uint32 public leafCount;
    uint32 public spentCount;
    uint32 public liveReservations;
    // Conservative future-spend capacity, NOT an exact spendable-note count.
    // In a future four-slot fulfillment profile, padding may retain capacity.
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

    /// @dev Each verifier must contain code at construction. These captured
    /// hashes are checked again at use; they are not certificates of soundness.
    constructor(
        address asset_,
        bytes32 deploymentDomain_,
        bytes32 policy_,
        address depositBalance_,
        address withdrawBalance_,
        address withdraw_,
        address reserveGeneric_,
        address recoverGeneric_
    ) {
        require(deploymentDomain_ != bytes32(0) && policy_ != bytes32(0), "CONFIG_DOMAIN");
        require(asset_ == address(0) || asset_.code.length != 0, "CONFIG_ASSET");
        asset = asset_;
        assetCodeHash = asset_ == address(0) ? bytes32(0) : asset_.codehash;
        assetIdentity = sha256(abi.encodePacked(bytes1(0x24), block.chainid, asset_, assetCodeHash));
        deploymentDomain = deploymentDomain_;
        // A new deployment has a new proof domain. There is no old-root import.
        scope = sha256(abi.encodePacked(
            bytes1(0x25), block.chainid, address(this), deploymentDomain_, assetIdentity
        ));
        policy = policy_;

        depositBalanceVerifierCodeHash = _pinVerifier(depositBalance_);
        withdrawBalanceVerifierCodeHash = _pinVerifier(withdrawBalance_);
        withdrawVerifierCodeHash = _pinVerifier(withdraw_);
        reserveGenericVerifierCodeHash = _pinVerifier(reserveGeneric_);
        recoverGenericVerifierCodeHash = _pinVerifier(recoverGeneric_);
        depositBalanceVerifier = IPrivateGenericAssetNoteVerifier(depositBalance_);
        withdrawBalanceVerifier = IPrivateGenericAssetNoteVerifier(withdrawBalance_);
        withdrawVerifier = IPrivateGenericAssetNoteVerifier(withdraw_);
        reserveGenericVerifier = IPrivateGenericAssetNoteVerifier(reserveGeneric_);
        recoverGenericVerifier = IPrivateGenericAssetNoteVerifier(recoverGeneric_);

        // Zero leaves are implicit. Initialize every empty internal subtree.
        for (uint256 i = CAPACITY - 1; i > 0; --i) {
            nodes[i] = nodeHash(nodes[i * 2], nodes[i * 2 + 1]);
        }
        currentRoot = nodes[1];
        _acceptCurrentRoot();
        spentDigest = _spentDigest();
    }

    /// @dev D26: S8, P8, epoch1, amount1, type-4 outputCM8.
    /// This genuine legacy relation retains its current 600-second epoch.
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
        require(_verify(
            depositBalanceVerifier, depositBalanceVerifierCodeHash, proof, inputs
        ), "DEPOSIT_BALANCE_PROOF");

        _receiveAsset(amount);
        ++outputCapacity;
        _append(output);
        _advance();
    }

    /// @dev S66: S8, P8, A8, baseRoot8, inputNF8, R8, changeCM8,
    /// Admission8, validFrom1, validUntil1. Sequence/post-root are transaction
    /// guards, not new signed economics. The pinned circuit privately proves
    /// source membership at baseRoot and the immutable rootless A0 intent.
    function reserveGenericGuarded(
        bytes calldata proof,
        bytes32[] calldata inputs,
        uint64 expectedSequence,
        bytes32 expectedPostRoot
    ) external nonReentrant {
        _genericDomain(inputs, 66);
        require(currentRoot == _digest(inputs, 24), "RESERVE_ROOT_CHANGED");
        require(stateSequence == expectedSequence, "RESERVE_SEQUENCE_CHANGED");
        _window(_u64(inputs[64]), _u64(inputs[65]));
        bytes32 nullifier = _digest(inputs, 32);
        bytes32 reservation = _digest(inputs, 40);
        bytes32 change = _digest(inputs, 48);
        bytes32 admission = _digest(inputs, 56);
        _availableNullifier(nullifier);
        require(admission != bytes32(0) && !admissions[admission], "ORIGIN_ALREADY_ADMITTED");
        _availableOutput(reservation);
        _availableOutput(change);
        require(reservation != change, "DUPLICATE_OUTPUT");
        require(outputCapacity > 0, "NO_OUTPUT_CAPACITY");
        _headroom(
            uint256(leafCount) + 2,
            uint256(spentCount) + 1,
            uint256(liveReservations) + 1,
            outputCapacity
        );
        require(_verify(
            reserveGenericVerifier, reserveGenericVerifierCodeHash, proof, inputs
        ), "RESERVE_GENERIC_PROOF");

        _consume(nullifier);
        admissions[admission] = true;
        ++liveReservations;
        // One source is spent; one opaque change/padding leaf replaces its
        // conservative capacity. A0 proves positive type-4 change or canonical
        // zero-value unspendable padding for send-max. Backing is unchanged.
        _append(reservation);
        _append(change);
        require(nodes[1] == expectedPostRoot, "RESERVE_POST_ROOT_MISMATCH");
        // The reservation-only intermediate root is never accepted.
        _advance();
    }

    /// @dev F51: S8, P8, A8, membershipRoot8, reserveNF8, recoveryCM8,
    /// settleBefore1, validFrom1, validUntil1. The pinned circuit proves the
    /// same A0's reserve membership, exact recovery and settlement deadline.
    /// This returns locally reserved value; it makes no foreign rollback claim.
    function recoverGeneric(bytes calldata proof, bytes32[] calldata inputs) external nonReentrant {
        _genericDomain(inputs, 51);
        _acceptedRoot(_digest(inputs, 24));
        uint64 settleBefore = _u64(inputs[48]);
        uint64 validFrom = _u64(inputs[49]);
        require(settleBefore <= validFrom, "RECOVERY_BEFORE_SETTLEMENT_DEADLINE");
        _window(validFrom, _u64(inputs[50]));
        bytes32 nullifier = _digest(inputs, 32);
        bytes32 recovery = _digest(inputs, 40);
        _availableNullifier(nullifier);
        _availableOutput(recovery);
        require(liveReservations > 0, "NO_LIVE_RESERVATION");
        _headroom(
            uint256(leafCount) + 1,
            uint256(spentCount) + 1,
            uint256(liveReservations) - 1,
            uint256(outputCapacity) + 1
        );
        require(_verify(
            recoverGenericVerifier, recoverGenericVerifierCodeHash, proof, inputs
        ), "RECOVER_GENERIC_PROOF");

        _consume(nullifier);
        --liveReservations;
        ++outputCapacity;
        _append(recovery);
        _advance();
    }

    /// @dev W39: S8, P8, epoch1, membershipRoot8, canonicalNF8, amount1,
    /// recipient5. This immutable legacy circuit permits type-4 balance notes.
    function withdrawBalance(bytes calldata proof, bytes32[] calldata inputs) external nonReentrant {
        _withdraw(proof, inputs, withdrawBalanceVerifier, withdrawBalanceVerifierCodeHash);
    }

    /// @dev Same W39 layout; this immutable legacy circuit permits type-2/3
    /// payout/recovery notes. Both W methods share S/F's canonical spent map.
    function withdraw(bytes calldata proof, bytes32[] calldata inputs) external nonReentrant {
        _withdraw(proof, inputs, withdrawVerifier, withdrawVerifierCodeHash);
    }

    function _withdraw(
        bytes calldata proof,
        bytes32[] calldata inputs,
        IPrivateGenericAssetNoteVerifier verifier,
        bytes32 verifierCodeHash
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
        require(_verify(verifier, verifierCodeHash, proof, inputs), "WITHDRAW_PROOF");

        _consume(nullifier);
        --outputCapacity;
        backedAmount -= amount;
        _advance();
        // Failure rolls back counters, spent state, roots, sequence and events.
        _sendAsset(recipient, amount);
        emit Withdrawal(recipient, amount, nullifier);
    }

    // No generic fulfillment method exists until genuine graph/evidence
    // enforcement is integrated in a separately reviewed deployment profile.

    function nodeHash(bytes32 left, bytes32 right) public pure returns (bytes32) {
        return sha256(abi.encodePacked(bytes1(0x01), left, right));
    }

    function treeNodes() external view returns (bytes32[128] memory) { return nodes; }
    function spentList() external view returns (bytes32[64] memory) { return spentEntries; }
    function rootHistory() external view returns (bytes32[65] memory) { return rootHistoryEntries; }

    function noteLeaves() external view returns (bytes32[64] memory result) {
        for (uint256 i = 0; i < CAPACITY; ++i) result[i] = nodes[CAPACITY + i];
    }

    /// @notice One current ledger snapshot. Historical membership acceptance
    /// does not authenticate readiness at the latest sequence. The seventh
    /// return field is conservative capacity, not a live-note count.
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

    /// @notice Read at the same canonical block as canonicalState/backing.
    /// Only the authenticated prefix is populated, initially the empty root.
    function canonicalRootHistory() external view returns (
        uint64 sequence, bytes32 digest, uint32 count, bytes32[65] memory roots
    ) {
        return (stateSequence, rootHistoryDigest, rootHistoryCount, rootHistoryEntries);
    }

    /// @notice Surplus is unallocated and cannot issue claims or be swept.
    /// Forced native currency in a token pool is unrelated to its note asset.
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

    /// @notice Conservative archival diagnostic, not a state-changing retire
    /// method. Capacity can remain allocated after claims clear. This profile
    /// additionally requires no stranded donations or unrelated native value.
    function canRetire() external view returns (bool) {
        return backedAmount == 0 && liveReservations == 0
            && _assetBalance(address(this)) == 0 && address(this).balance == 0;
    }

    function _pinVerifier(address verifier) private view returns (bytes32) {
        require(verifier != address(0) && verifier.code.length != 0, "CONFIG_VERIFIER");
        bytes32 codeHash = verifier.codehash;
        require(codeHash != bytes32(0), "CONFIG_VERIFIER_HASH");
        return codeHash;
    }

    function _verify(
        IPrivateGenericAssetNoteVerifier verifier,
        bytes32 codeHash,
        bytes calldata proof,
        bytes32[] calldata inputs
    ) private view returns (bool) {
        address target = address(verifier);
        require(target.code.length != 0 && target.codehash == codeHash, "VERIFIER_CODE_CHANGED");
        return verifier.verify(proof, inputs);
    }

    function _legacyDomain(bytes32[] calldata inputs, uint256 size) private view {
        require(inputs.length == size, "PUBLIC_INPUT_LENGTH");
        require(_digest(inputs, 0) == scope && _digest(inputs, 8) == policy, "PUBLIC_DOMAIN");
        require(uint256(_u64(inputs[16])) == block.timestamp / EPOCH_SECONDS, "STALE_EPOCH");
    }

    function _genericDomain(bytes32[] calldata inputs, uint256 size) private view {
        require(inputs.length == size, "PUBLIC_INPUT_LENGTH");
        require(_digest(inputs, 0) == scope && _digest(inputs, 8) == policy, "PUBLIC_DOMAIN");
        require(_digest(inputs, 16) == assetIdentity, "PUBLIC_ASSET");
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

    /// @dev PC15: SHA256(0x02 || scope32 || count:u32be || 64 bytes32 entries).
    /// Entries after count remain zero; the exact preimage is 2085 bytes.
    function _spentDigest() private view returns (bytes32) {
        return sha256(abi.encodePacked(bytes1(0x02), scope, spentCount, spentEntries));
    }

    /// @dev SHA256(0x18 || scope32 || count:u32be || 65 bytes32 roots).
    /// Roots after count remain zero; the exact preimage is 2117 bytes.
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
