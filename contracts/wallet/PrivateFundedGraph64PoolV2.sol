// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {FlatVerifierSet, IFlatProofVerifier} from "./FlatVerifierSet.sol";
import {FlatHubCodec} from "./FlatHubCodec.sol";

interface IFundedGraph64HubV2 {
    function hubDomain() external view returns(bytes32);
    function registryCommitment() external view returns(bytes32);
    function verifierSetCommitment() external view returns(bytes32);
    function global64VerifierCommitment() external view returns(bytes32);
    function graph64ManifestSHA256() external view returns(bytes32);
    function globalVerifierPin(uint256 role) external view returns(address,bytes32);
    function hubCodec() external view returns(address);
    function hubCodecCodeHash() external view returns(bytes32);
    function ledgerNamespace() external view returns(bytes32);
    function pool() external view returns(address);
    function poolDomain() external view returns(bytes32);
    function isRegisteredPool(address pool) external view returns(bool);
    function isUsable(bytes32 domain,bytes32 evidence) external view returns(bool);
    function bookGlobalCapacity64() external;
    function releaseGlobalCapacity64() external;
    function verifyFinalityHealth(uint64 from,uint64 until,FlatHubCodec.QuorumSignature[3] calldata signatures) external view returns(bool);
    function consumeGlobal64(bytes32 authorization,bytes32[64] calldata tags,bytes32 state,uint64 from,uint64 until,FlatHubCodec.QuorumSignature[3] calldata signatures) external;
}

/// @notice Source-only flat bundle integration. Genuine verifier lineage,
/// compilation, P2 conformance, deployment and full-wallet acceptance are not
/// established by this source. No owner, upgrade, migration or mint bypass.
/// D26/W39 notes, backing, epochs and SHA pool tree retain the golden semantics.
contract PrivateFundedGraph64PoolV2 {
    uint256 public constant TREE_DEPTH = 8;
    uint256 public constant CAPACITY = 256;
    uint256 public constant EPOCH_SECONDS = 600;
    uint256 public constant MAX_NOTE_AMOUNT = type(uint64).max;
    uint256 public constant MAX_BACKED_AMOUNT = CAPACITY * MAX_NOTE_AMOUNT;
    uint256 public constant FUTURE_PAYOUT_SLOTS = 64;

    struct Deployment {
        address asset;
        bytes32 deploymentDomain;
        bytes32 policy;
        FlatVerifierSet.Configuration verifierSet;
        address receiptHub;
        bytes32 receiptHubCodeHash;
        bytes32 hubDomain;
        bytes32 registryCommitment;
        FlatVerifierSet.Pin[5] global64Verifiers;
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
    IFundedGraph64HubV2 public immutable receiptHub;
    bytes32 public immutable receiptHubCodeHash;
    bytes32 public immutable hubDomain;
    bytes32 public immutable registryCommitment;
    FlatVerifierSet.Configuration private verifiers;
    FlatVerifierSet.Pin[5] private global64Verifiers;
    bytes32 public immutable global64VerifierCommitment;
    struct GlobalReservation {bytes32 reserveNullifier;bytes32 graphRoot;bytes32 outputRoot;bytes32 recovery;uint64 settleBefore;uint8 outcome;}
    mapping(bytes32=>GlobalReservation) public globalReservations;
    struct ScopedReady {bytes32 authorization;bytes32 graph;bytes32 local;bytes32 ready;bytes32 evidence;}
    mapping(bytes32=>ScopedReady) private originalReady;
    mapping(bytes32=>bool) public admittedDispatches;
    event GlobalReserved(bytes32 indexed authorizationRoot,bytes32 graphRoot);
    event GlobalClosed(bytes32 indexed authorizationRoot,uint8 outcome);
    event ScopedReady(bytes32 indexed dispatchId,bytes32 readyCommitment);


    // Exact admitted value less successful exits. Donations create no claims.
    uint256 public backedAmount;
    uint32 public leafCount;
    uint32 public spentCount;
    uint32 public liveReservations;
    // Conservative future-spend capacity, NOT an exact spendable-note count.
    // Bounded64 fulfillment padding may retain capacity after real exits.
    uint32 public outputCapacity;
    uint64 public stateSequence;
    bytes32 public currentRoot;
    bytes32 public spentDigest;
    uint32 public rootHistoryCount;
    bytes32 public rootHistoryDigest;

    // Heap indexing: root 1, leaves 256..511; index 0 remains unused and zero.
    bytes32[512] private nodes;
    bytes32[256] private spentEntries;
    bytes32[257] private rootHistoryEntries;
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
        for(uint256 i=0;i<5;++i){FlatVerifierSet.requireCode(configuration.global64Verifiers[i].verifier,configuration.global64Verifiers[i].codeHash);global64Verifiers[i]=configuration.global64Verifiers[i];}

        verifierSetCommitment = FlatVerifierSet.commitment(configuration.verifierSet);
        FlatVerifierSet.requireCode(configuration.receiptHub, configuration.receiptHubCodeHash);
        require(configuration.hubDomain != bytes32(0)
            && configuration.registryCommitment != bytes32(0), "CONFIG_NATIVE_DOMAIN");
        IFundedGraph64HubV2 hub = IFundedGraph64HubV2(configuration.receiptHub);
        require(hub.hubDomain() == configuration.hubDomain, "CONFIG_HUB_DOMAIN");
        require(hub.registryCommitment() == configuration.registryCommitment, "CONFIG_REGISTRY");
        require(hub.verifierSetCommitment() == verifierSetCommitment, "CONFIG_VERIFIER_SET");
        
        require(hub.hubCodec() == hubCodec && hub.hubCodecCodeHash() == hubCodecCodeHash, "CONFIG_HUB_CODEC");
        require(hub.ledgerNamespace() == configuration.hubDomain, "CONFIG_NAMESPACE");
        require(hub.pool() == address(this), "CONFIG_POOL_REGISTRATION");
        bytes memory globalPins=abi.encodePacked(hub.graph64ManifestSHA256());
        for(uint256 i=0;i<5;++i){(address v,bytes32 h)=hub.globalVerifierPin(i);require(v==global64Verifiers[i].verifier&&h==global64Verifiers[i].codeHash,"GLOBAL64_VERIFIER_JOIN");globalPins=bytes.concat(globalPins,abi.encodePacked(uint8(i),v,h));}
        global64VerifierCommitment=sha256(globalPins);require(hub.global64VerifierCommitment()==global64VerifierCommitment,"GLOBAL64_MANIFEST_JOIN");
        receiptHub = hub;
        receiptHubCodeHash = configuration.receiptHubCodeHash;
        hubDomain = configuration.hubDomain;
        registryCommitment = configuration.registryCommitment;
        ledgerNamespace = configuration.hubDomain;
        domainCommitment = sha256(bytes.concat(_part(bytes("LIANUM/PAEG/64/domain/2")),_part(bytes("LIANUM_PAEG_FUNDED_64_V2")),_part(abi.encodePacked(scope)),_part(abi.encodePacked(policy)),_part(abi.encodePacked(assetIdentity)),_part(abi.encodePacked(hubDomain)),_part(abi.encodePacked(registryCommitment))));
        for (uint256 i = CAPACITY - 1; i > 0; --i) {
            nodes[i] = nodeHash(nodes[i * 2], nodes[i * 2 + 1]);
        }
        currentRoot = nodes[1];
        _acceptCurrentRoot();
        spentDigest = _spentDigest();

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

    /// One global authorization and one reservation, never one spend per page.
    function reserveGlobal64(bytes calldata proof,bytes32[] calldata inputs,uint64 expectedSequence,bytes32 expectedPostRoot) external nonReentrant {
        _globalDomain(inputs,75);require(currentRoot==_digest(inputs,8)&&stateSequence==expectedSequence,"GLOBAL64_SOURCE_CHANGED");
        _window(_u64(inputs[72]),_u64(inputs[73]));require(_u64(inputs[73])<=_u64(inputs[74]),"GLOBAL64_CUTOFF");
        bytes32 inputNF=_digest(inputs,16);bytes32 authorization=_digest(inputs,24);bytes32 reserveNF=_digest(inputs,32);bytes32 change=_digest(inputs,40);bytes32 recovery=_digest(inputs,48);
        require(authorization!=bytes32(0)&&globalReservations[authorization].outcome==0,"GLOBAL64_DUPLICATE_AUTHORIZATION");_availableNullifier(inputNF);_availableNullifier(reserveNF);require(inputNF!=reserveNF,"GLOBAL64_NULLIFIER_JOIN");_availableOutput(change);_availableOutput(recovery);require(change!=recovery,"GLOBAL64_OUTPUT_JOIN");require(outputCapacity>0,"NO_OUTPUT_CAPACITY");
        _headroom(uint256(leafCount)+65,uint256(spentCount)+2,uint256(liveReservations)+1,uint256(outputCapacity)+64);
        require(_globalVerify(0,proof,inputs),"GLOBAL64_RESERVE_PROOF");_requireReceiptHub();receiptHub.bookGlobalCapacity64();
        _consume(inputNF);globalReservations[authorization]=GlobalReservation(reserveNF,_digest(inputs,56),_digest(inputs,64),recovery,_u64(inputs[74]),1);++liveReservations;_append(change);require(nodes[1]==expectedPostRoot,"GLOBAL64_POST_ROOT");_advance();emit GlobalReserved(authorization,_digest(inputs,56));
    }
    /// A stable scoped relation checks precisely this node's predecessors.
    function admitScopedReady64(bytes calldata proof,bytes32[] calldata inputs,uint64 healthFrom,uint64 healthUntil,FlatHubCodec.QuorumSignature[3] calldata healthSignatures) external nonReentrant {
        _globalDomain(inputs,58);GlobalReservation storage r=globalReservations[_digest(inputs,8)];require(r.outcome==1&&r.graphRoot==_digest(inputs,16),"GLOBAL64_RESERVATION_REQUIRED");require(_u64(inputs[57])<=r.settleBefore,"GLOBAL64_CUTOFF");_window(_u64(inputs[56]),_u64(inputs[57]));bytes32 dispatch=_digest(inputs,32);require(dispatch!=bytes32(0)&&!admittedDispatches[dispatch],"GLOBAL64_DISPATCH_DUPLICATE");_requireReceiptHub();require(receiptHub.isUsable(domainCommitment,_digest(inputs,40)),"UNUSABLE_EVIDENCE_STATE");receiptHub.verifyFinalityHealth(healthFrom,healthUntil,healthSignatures);require(_globalVerify(2,proof,inputs),"GLOBAL64_READY_PROOF");originalReady[dispatch]=ScopedReady(_digest(inputs,8),_digest(inputs,16),_digest(inputs,24),_digest(inputs,48),_digest(inputs,40));admittedDispatches[dispatch]=true;emit ScopedReady(dispatch,_digest(inputs,48));
    }
    function isOriginalReady64(bytes32 auth,bytes32 graph,bytes32 local,bytes32 dispatch,bytes32 ready,bytes32 evidence) external view returns(bool){ScopedReady storage r=originalReady[dispatch];return r.authorization==auth&&r.graph==graph&&r.local==local&&r.ready==ready&&r.evidence==evidence&&globalReservations[auth].outcome==1&&globalReservations[auth].graphRoot==graph;}
    function globalCutoff64(bytes32 auth) external view returns(uint64){return globalReservations[auth].settleBefore;}
    /// Timeout emits the recovery commitment already proved in the ONE reserve.
    /// It has no new permission, renewal or dependency on foreign availability.
    function recoverGlobal64(bytes32 authorization) external nonReentrant {
        GlobalReservation storage r=globalReservations[authorization];require(r.outcome==1,"GLOBAL64_RESERVATION_REQUIRED");require(block.timestamp>=r.settleBefore,"RECOVERY_BEFORE_SETTLEMENT_DEADLINE");_availableNullifier(r.reserveNullifier);_availableOutput(r.recovery);_headroom(uint256(leafCount)+1,uint256(spentCount)+1,uint256(liveReservations)-1,uint256(outputCapacity)+1);_requireReceiptHub();receiptHub.releaseGlobalCapacity64();r.outcome=3;_consume(r.reserveNullifier);--liveReservations;++outputCapacity;_append(r.recovery);_advance();emit GlobalClosed(authorization,3);
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
        uint256 /* legacy role unused: every V2 output is the same type-4 PC23 note */
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
        require(_globalVerify(4,proof,inputs), "GLOBAL64_WITHDRAW_PROOF");

        _consume(nullifier);
        --outputCapacity;
        backedAmount -= amount;
        _advance();
        // Failure rolls back counters, spent state, roots, sequence and events.
        _sendAsset(recipient, amount);
        emit Withdrawal(recipient, amount, nullifier);
    }

    /// All64 positions close under ONE root before any solver payout is issued.
    /// Padding is authenticated privately; no owner/host accepted flag exists.
    function fulfillGlobal64(bytes calldata proof,bytes32[] calldata inputs,uint64 healthFrom,uint64 healthUntil,FlatHubCodec.QuorumSignature[3] calldata healthSignatures) external nonReentrant {
        _globalDomain(inputs,1066);bytes32 authorization=_digest(inputs,8);GlobalReservation storage r=globalReservations[authorization];require(r.outcome==1&&r.reserveNullifier==_digest(inputs,16)&&r.outputRoot==_digest(inputs,32),"GLOBAL64_ORIGINAL_RESERVATION");_window(_u64(inputs[1064]),_u64(inputs[1065]));require(_u64(inputs[1065])<=r.settleBefore,"GLOBAL64_CUTOFF");_availableNullifier(r.reserveNullifier);_headroom(uint256(leafCount)+64,uint256(spentCount)+1,uint256(liveReservations)-1,uint256(outputCapacity)+64);_requireReceiptHub();bytes32 state=_digest(inputs,24);require(receiptHub.isUsable(domainCommitment,state),"UNUSABLE_EVIDENCE_STATE");
        for(uint256 i=0;i<64;++i){bytes32 cm=_digest(inputs,40+8*i);bytes32 tag=_digest(inputs,552+8*i);_availableOutput(cm);require(tag!=bytes32(0),"ZERO_RECEIPT_TAG");for(uint256 j=0;j<i;++j){require(cm!=_digest(inputs,40+8*j)&&tag!=_digest(inputs,552+8*j),"GLOBAL64_DUPLICATE_OUTPUT_OR_TAG");}}
        require(_globalVerify(1,proof,inputs),"GLOBAL64_TERMINAL_PROOF");r.outcome=2;_consume(r.reserveNullifier);bytes32[64] memory tags;for(uint256 i=0;i<64;++i)tags[i]=_digest(inputs,552+8*i);receiptHub.consumeGlobal64(authorization,tags,state,healthFrom,healthUntil,healthSignatures);--liveReservations;outputCapacity+=64;for(uint256 i=0;i<64;++i)_append(_digest(inputs,40+8*i));_advance();emit GlobalClosed(authorization,2);
    }
    function _globalDomain(bytes32[] calldata inputs,uint256 width) private view {require(inputs.length==width&&_digest(inputs,0)==domainCommitment,"GLOBAL64_PUBLIC_DOMAIN");}
    function _globalVerify(uint256 role,bytes calldata proof,bytes32[] calldata inputs) private view returns(bool){FlatVerifierSet.Pin storage pin=global64Verifiers[role];FlatVerifierSet.requireCode(pin.verifier,pin.codeHash);return IFlatProofVerifier(pin.verifier).verify(proof,inputs);}
    function _part(bytes memory value) private pure returns(bytes memory){return bytes.concat(abi.encodePacked(uint32(value.length)),value);}

    function _requireReceiptHub() private view {
        FlatVerifierSet.requireCode(address(receiptHub), receiptHubCodeHash);
        require(receiptHub.hubDomain() == hubDomain, "HUB_DOMAIN_CHANGED");
        require(receiptHub.registryCommitment() == registryCommitment, "REGISTRY_CHANGED");
        require(receiptHub.verifierSetCommitment() == verifierSetCommitment, "VERIFIER_SET_CHANGED");
        require(receiptHub.ledgerNamespace() == ledgerNamespace, "NAMESPACE_CHANGED");
        require(receiptHub.isRegisteredPool(address(this)), "POOL_NOT_PINNED");
        require(receiptHub.poolDomain() == domainCommitment, "POOL_DOMAIN_NOT_REGISTERED");
    }

    function transitionInProgress() external view returns (bool) { return entered != 0; }

    function nodeHash(bytes32 left, bytes32 right) public pure returns (bytes32) {
        return sha256(abi.encodePacked(bytes1(0x01), left, right));
    }

    function treeNodes() external view returns (bytes32[512] memory) { return nodes; }

    function spentList() external view returns (bytes32[256] memory) { return spentEntries; }

    function rootHistory() external view returns (bytes32[257] memory) { return rootHistoryEntries; }

    function noteLeaves() external view returns (bytes32[256] memory result) {
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
        bytes32[256] memory commitments,
        bytes32[256] memory nullifiers
    ) {
        for (uint256 i = 0; i < CAPACITY; ++i) commitments[i] = nodes[CAPACITY + i];
        return (
            currentRoot, spentDigest, stateSequence, leafCount, spentCount,
            liveReservations, outputCapacity, commitments, spentEntries
        );
    }

    function canonicalRootHistory() external view returns (
        uint64 sequence, bytes32 digest, uint32 count, bytes32[257] memory roots
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
