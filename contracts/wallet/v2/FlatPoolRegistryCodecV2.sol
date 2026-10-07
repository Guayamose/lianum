// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
import {FlatVerifierSet} from "../FlatVerifierSet.sol";
import {FlatHubCodec} from "../FlatHubCodec.sol";
interface IFlatPoolRegistryTargetV2 {
    function canRetire() external view returns (bool);
    function leafCount() external view returns (uint32);
    function spentCount() external view returns (uint32);
    function liveReservations() external view returns (uint32);
    function outputCapacity() external view returns (uint32);
    function authorizationLeafCount() external view returns (uint32);
    function transitionInProgress() external view returns (bool);
    function scope() external view returns (bytes32);
    function policy() external view returns (bytes32);
    function assetIdentity() external view returns (bytes32);
    function receiptHub() external view returns (address);
    function receiptHubCodeHash() external view returns (bytes32);
    function hubDomain() external view returns (bytes32);
    function registryCommitment() external view returns (bytes32);
    function verifierSetCommitment() external view returns (bytes32);
    function poseidon2Domains() external view returns (address);
    function poseidon2DomainsCodeHash() external view returns (bytes32);
    function hubCodec() external view returns (address);
    function hubCodecCodeHash() external view returns (bytes32);
    function ledgerNamespace() external view returns (bytes32);
    function domainCommitment() external view returns (bytes32);
    function currentRoot() external view returns (bytes32);
    function spentDigest() external view returns (bytes32);
    function stateSequence() external view returns (uint64);
}
interface IFlatPoolRegistryHubV2 {
    function hubDomain() external view returns (bytes32);
    function registryCommitment() external view returns (bytes32);
    function verifierSetCommitment() external view returns (bytes32);
    function poseidon2Domains() external view returns (address);
    function poseidon2DomainsCodeHash() external view returns (bytes32);
    function hubCodec() external view returns (address);
    function hubCodecCodeHash() external view returns (bytes32);
    function ledgerNamespace() external view returns (bytes32);
}
/** Stateless, runtime-pinned read/validation only. The hub owns every mutation.
 * Factoring existing registration checks out gives the near-limit hub a bounded
 * size-reduction path; actual new runtime sizes have NOT been compiled/measured. */
library FlatPoolRegistryCodecV2 {
    error PoolTransitionInProgress(); error PoolHubPin(); error PoolNativeDomain();
    error PoolVerifierSet(); error PoolMathLibrary(); error PoolHubCodec();
    error PoolNamespace(); error PoolDomainMismatch(); error SuccessorNotFresh();
    struct Context {
        address hub; bytes32 hubCodeHash; bytes32 hubDomain; bytes32 registryCommitment;
        bytes32 verifierSetCommitment; address poseidon2Domains; bytes32 poseidon2DomainsCodeHash;
        address hubCodec; bytes32 hubCodecCodeHash; bytes32 ledgerNamespace;
    }
    struct PoolSnapshot {
        bytes32 scope; bytes32 policy; bytes32 assetIdentity; bytes32 poolRoot;
        bytes32 poolSpentDigest; uint32 poolSpentCount; uint64 poolStateSequence;
    }
    /** Only the same seven read-only pool getters, in the original order.
     * Registration, transition and timestamp predicates remain in the hub. */
    function readPoolSnapshot(address pool) public view returns (PoolSnapshot memory snapshot) {
        IFlatPoolRegistryTargetV2 target = IFlatPoolRegistryTargetV2(pool);
        snapshot.scope = target.scope(); snapshot.policy = target.policy();
        snapshot.assetIdentity = target.assetIdentity(); snapshot.poolRoot = target.currentRoot();
        snapshot.poolSpentDigest = target.spentDigest(); snapshot.poolSpentCount = target.spentCount();
        snapshot.poolStateSequence = target.stateSequence();
    }
    /** Solidity's linked library call executes in the hub's address context.
     * Only unchanged generated immutable getters are called on that exact hub.
     * No caller-supplied context, pointer, callback or ledger write is accepted. */
    function _hubContext() private view returns (Context memory context) {
        IFlatPoolRegistryHubV2 hub = IFlatPoolRegistryHubV2(address(this));
        context = Context({
            hub: address(this), hubCodeHash: address(this).codehash, hubDomain: hub.hubDomain(),
            registryCommitment: hub.registryCommitment(), verifierSetCommitment: hub.verifierSetCommitment(),
            poseidon2Domains: hub.poseidon2Domains(), poseidon2DomainsCodeHash: hub.poseidon2DomainsCodeHash(),
            hubCodec: hub.hubCodec(), hubCodecCodeHash: hub.hubCodecCodeHash(), ledgerNamespace: hub.ledgerNamespace()
        });
    }
    /** Read-only proof marshaling and original verifier-pin assembly.
     * The caller supplies its typed, constructor-pinned configuration storage
     * reference. This library declares no state or state-changing function.
     * Admission, freshness, replay, checkpoint and health decisions remain in
     * the hub after the unchanged FlatHubCodec verifier result is returned. */
    function verifyAdmissionBundle(FlatVerifierSet.Configuration storage configuration,
        FlatVerifierSet.Proof calldata dependency, FlatVerifierSet.Proof calldata readiness,
        FlatVerifierSet.Proof calldata admission)
        public view returns (FlatHubCodec.AdmissionStatement memory)
    {
        FlatHubCodec.VerifierPin[3] memory pins;
        for (uint256 i = 0; i < 3; ++i) {
            FlatVerifierSet.Pin storage pin = configuration.pins[FlatVerifierSet.P + i];
            pins[i] = FlatHubCodec.VerifierPin(pin.verifier, pin.codeHash);
        }
        FlatHubCodec.Proof[3] memory proofs;
        proofs[0] = FlatHubCodec.Proof(dependency.proof, dependency.inputs);
        proofs[1] = FlatHubCodec.Proof(readiness.proof, readiness.inputs);
        proofs[2] = FlatHubCodec.Proof(admission.proof, admission.inputs);
        return FlatHubCodec.verifyAdmissionBundle(pins, proofs);
    }
    function validateFreshSuccessor(address pool) public view {
        IFlatPoolRegistryTargetV2 target = IFlatPoolRegistryTargetV2(pool);
        if (!target.canRetire() || target.leafCount() != 0 || target.spentCount() != 0
            || target.liveReservations() != 0 || target.outputCapacity() != 0
            || target.authorizationLeafCount() != 0) revert SuccessorNotFresh();
    }
    function validatePool(address pool) public view returns (bytes32 domain) {
        Context memory context = _hubContext();
        IFlatPoolRegistryTargetV2 target = IFlatPoolRegistryTargetV2(pool);
        if (target.transitionInProgress()) revert PoolTransitionInProgress();
        if (target.receiptHub() != context.hub || target.receiptHubCodeHash() != context.hubCodeHash)
            revert PoolHubPin();
        if (target.hubDomain() != context.hubDomain || target.registryCommitment() != context.registryCommitment)
            revert PoolNativeDomain();
        if (target.verifierSetCommitment() != context.verifierSetCommitment) revert PoolVerifierSet();
        if (target.poseidon2Domains() != context.poseidon2Domains
            || target.poseidon2DomainsCodeHash() != context.poseidon2DomainsCodeHash) revert PoolMathLibrary();
        if (target.hubCodec() != context.hubCodec || target.hubCodecCodeHash() != context.hubCodecCodeHash)
            revert PoolHubCodec();
        if (target.ledgerNamespace() != context.ledgerNamespace) revert PoolNamespace();
        domain = FlatVerifierSet.domainCommitment([target.scope(), target.policy(), target.assetIdentity(),
            context.hubDomain, context.registryCommitment, context.verifierSetCommitment, context.ledgerNamespace]);
        if (target.domainCommitment() != domain) revert PoolDomainMismatch();
    }
}
