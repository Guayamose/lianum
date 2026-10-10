// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {FlatVerifierSet, IFlatProofVerifier} from "./FlatVerifierSet.sol";
import {FlatHubCodec} from "./FlatHubCodec.sol";

interface IFundedGraph64PoolV2 {
    function scope() external view returns(bytes32);
    function policy() external view returns(bytes32);
    function assetIdentity() external view returns(bytes32);
    function hubDomain() external view returns(bytes32);
    function registryCommitment() external view returns(bytes32);
    function receiptHub() external view returns(address);
    function receiptHubCodeHash() external view returns(bytes32);
    function verifierSetCommitment() external view returns(bytes32);
    function domainCommitment() external view returns(bytes32);
    function isOriginalReady64(bytes32 authorization,bytes32 graph,bytes32 local,
        bytes32 dispatch,bytes32 ready,bytes32 evidence) external view returns(bool);
    function globalCutoff64(bytes32 authorization) external view returns(uint64);
}

/// A separate SHA receipt ledger for the bounded64 profile. Original P2/P42/
/// R50/I84 hubs remain unchanged. Registry rules, provider signatures, original
/// native receipt bytes and the 3-of-4 quorum are reused by the new admission
/// relation. This is federated native attestation, not native consensus proof.
contract PrivateFundedGraph64ReceiptHubV2 {
    string public constant PROFILE="LIANUM_PAEG_FUNDED_64_V2";
    uint256 public constant CAPACITY=64;
    uint64 public constant MAX_FINALITY_HEALTH_SECONDS=30;
    struct Deployment {
        bytes32 deploymentDomain;
        address pool;
        bytes32 poolCodeHash;
        FlatVerifierSet.Configuration legacyVerifiers;
        FlatVerifierSet.Pin[5] global64Verifiers;
        bytes32 graph64ManifestSHA256;
        uint64 registryEpoch;
        bytes32 rulesRoot;
        uint256[4] attesterX;
        uint256[4] attesterY;
    }
    address public immutable pool;
    // Constructor-only storage avoids a reciprocal hub/pool runtime-hash fixed point.
    bytes32 public poolCodeHash;
    bytes32 public immutable hubDomain;
    bytes32 public immutable registryCommitment;
    bytes32 public immutable verifierSetCommitment;
    address public immutable hubCodec;
    bytes32 public immutable hubCodecCodeHash;
    FlatVerifierSet.Pin[5] private global64Verifiers;
    bytes32 public immutable global64VerifierCommitment;
    bytes32 public immutable graph64ManifestSHA256;
    address[4] private attesters;
    bytes32 public poolDomain;
    bytes32 public receiptRoot;
    uint32 public receiptCount;
    uint32 public spentTagCount;
    uint64 public spentTagSequence;
    uint32 public revokedCount;
    uint64 public revocationSequence;
    uint64 public stateSequence;
    uint32 public reservedTagCapacity;
    bool public halted;
    bytes32 public evidenceState;
    bytes32 public spentTagDigest;
    bytes32 public revokedDigest;
    bytes32[128] private receiptNodes;
    bytes32[64] private spentTags;
    bytes32[64] private revokedGIDs;
    mapping(bytes32=>bool) public admissionNullifiers;
    mapping(bytes32=>bool) public insertedReceiptLeaves;
    mapping(bytes32=>bool) public consumedTags;
    mapping(bytes32=>bool) public revoked;
    mapping(bytes32=>uint64) private recordedSequencePlusOne;
    uint256 private entered;
    event ReceiptAdmitted(bytes32 indexed nullifier,bytes32 receipt,uint32 index);
    event GlobalTagsConsumed(bytes32 authorization,uint64 sequence);
    event ReceiptRevoked(bytes32 gid,bytes32 reason,uint64 sequence,bool halted);
    modifier nonReentrant(){require(entered==0,"GLOBAL64_HUB_REENTRANCY");entered=1;_;entered=0;}
    modifier onlyPool(){_requirePool();require(msg.sender==pool,"GLOBAL64_POOL_REQUIRED");_;}

    constructor(Deployment memory c){
        require(c.deploymentDomain!=bytes32(0)&&c.rulesRoot!=bytes32(0),"GLOBAL64_CONFIG_DOMAIN");
        require(c.pool!=address(0)&&c.pool!=address(this)&&c.poolCodeHash!=bytes32(0)
            &&c.poolCodeHash!=keccak256(""),"GLOBAL64_CONFIG_POOL");
        FlatVerifierSet.validate(c.legacyVerifiers);
        require(c.graph64ManifestSHA256!=bytes32(0),"GLOBAL64_MANIFEST_REQUIRED");
        bytes memory globalPins=abi.encodePacked(c.graph64ManifestSHA256);for(uint256 i=0;i<5;++i){FlatVerifierSet.requireCode(c.global64Verifiers[i].verifier,c.global64Verifiers[i].codeHash);global64Verifiers[i]=c.global64Verifiers[i];globalPins=bytes.concat(globalPins,abi.encodePacked(uint8(i),c.global64Verifiers[i].verifier,c.global64Verifiers[i].codeHash));}
        graph64ManifestSHA256=c.graph64ManifestSHA256;global64VerifierCommitment=sha256(globalPins);
        pool=c.pool;poolCodeHash=c.poolCodeHash;
        hubDomain=sha256(abi.encodePacked(bytes1(0x64),block.chainid,address(this),c.deploymentDomain));
        hubCodec=c.legacyVerifiers.hubCodec;hubCodecCodeHash=c.legacyVerifiers.hubCodecCodeHash;
        verifierSetCommitment=FlatVerifierSet.commitment(c.legacyVerifiers);

        for(uint256 i=0;i<4;++i){address a=FlatHubCodec.attesterAddress(c.attesterX[i],c.attesterY[i]);
            for(uint256 j=0;j<i;++j)require(c.attesterX[i]!=c.attesterX[j]&&a!=attesters[j],"GLOBAL64_DUPLICATE_ATTESTER");attesters[i]=a;}
        registryCommitment=FlatHubCodec.registryCommitment(hubDomain,c.registryEpoch,c.rulesRoot,c.attesterX,c.attesterY);
        for(uint256 i=63;i>0;--i)receiptNodes[i]=nodeHash(receiptNodes[2*i],receiptNodes[2*i+1]);
        receiptRoot=receiptNodes[1];spentTagDigest=_bounded(0x31,spentTags,0);revokedDigest=_bounded(0x32,revokedGIDs,0);
    }
    function globalVerifierPin(uint256 role) external view returns(address,bytes32){require(role<5,"GLOBAL64_ROLE");return(global64Verifiers[role].verifier,global64Verifiers[role].codeHash);}
    function registerPoolDomain() external nonReentrant returns(bytes32 domain){
        _requirePool();IFundedGraph64PoolV2 p=IFundedGraph64PoolV2(pool);
        require(p.receiptHub()==address(this)&&p.receiptHubCodeHash()==address(this).codehash,"GLOBAL64_POOL_HUB_PIN");
        require(p.hubDomain()==hubDomain&&p.registryCommitment()==registryCommitment
            &&p.verifierSetCommitment()==verifierSetCommitment,"GLOBAL64_POOL_REGISTRY");
        domain=_hash("domain",bytes.concat(_part(abi.encodePacked(p.scope())),_part(abi.encodePacked(p.policy())),
            _part(abi.encodePacked(p.assetIdentity())),_part(abi.encodePacked(hubDomain)),_part(abi.encodePacked(registryCommitment))));
        require(p.domainCommitment()==domain,"GLOBAL64_POOL_DOMAIN");
        if(poolDomain!=bytes32(0)){require(poolDomain==domain,"GLOBAL64_DOMAIN_CHANGED");return domain;}
        poolDomain=domain;_record();
    }
    function isRegisteredPool(address candidate) external view returns(bool){return candidate==pool&&poolDomain!=bytes32(0)&&pool.codehash==poolCodeHash;}
    function ledgerNamespace() external view returns(bytes32){return hubDomain;}
    function isUsable(bytes32 domain,bytes32 state) public view returns(bool){
        return !halted&&domain==poolDomain&&domain!=bytes32(0)&&pool.codehash==poolCodeHash
            &&recordedSequencePlusOne[state]!=0&&recordedSequencePlusOne[state]-1==revocationSequence;
    }
    function bookGlobalCapacity64() external nonReentrant onlyPool {
        require(!halted&&poolDomain!=bytes32(0)&&uint256(spentTagCount)+reservedTagCapacity+64<=64,"GLOBAL64_TAG_HEADROOM");
        reservedTagCapacity+=64;++stateSequence;
    }
    function releaseGlobalCapacity64() external nonReentrant onlyPool {
        require(reservedTagCapacity>=64,"GLOBAL64_CAPACITY_NOT_RESERVED");reservedTagCapacity-=64;++stateSequence;
    }
    function admit64(bytes calldata proof,bytes32[] calldata inputs,uint64 healthFrom,uint64 healthUntil,
        FlatHubCodec.QuorumSignature[3] calldata health) external nonReentrant {
        _requirePool();require(inputs.length==83&&_digest(inputs,0)==poolDomain,"GLOBAL64_ADMISSION_DOMAIN");
        bytes32 authorization=_digest(inputs,8);IFundedGraph64PoolV2 p=IFundedGraph64PoolV2(pool);
        require(p.isOriginalReady64(authorization,_digest(inputs,16),_digest(inputs,32),_digest(inputs,40),
            _digest(inputs,24),_digest(inputs,48)),"GLOBAL64_READY_REQUIRED");
        require(isUsable(poolDomain,_digest(inputs,48))&&_digest(inputs,56)==revokedDigest
            &&_u64(inputs[80])==revocationSequence,"GLOBAL64_REVOCATION_CHANGED");
        _window(_u64(inputs[81]),_u64(inputs[82]));require(_u64(inputs[82])<=p.globalCutoff64(authorization),"GLOBAL64_CUTOFF");
        verifyFinalityHealth(healthFrom,healthUntil,health);
        bytes32 leaf=_digest(inputs,64);bytes32 nf=_digest(inputs,72);
        require(leaf!=bytes32(0)&&!insertedReceiptLeaves[leaf]&&nf!=bytes32(0)&&!admissionNullifiers[nf],"GLOBAL64_NATIVE_EFFECT_ALREADY_ADMITTED");
        require(receiptCount<64,"GLOBAL64_RECEIPT_FULL");FlatVerifierSet.Pin storage pin=global64Verifiers[3];FlatVerifierSet.requireCode(pin.verifier,pin.codeHash);
        require(IFlatProofVerifier(pin.verifier).verify(proof,inputs),"GLOBAL64_ADMISSION_PROOF");
        admissionNullifiers[nf]=true;insertedReceiptLeaves[leaf]=true;uint32 index=receiptCount++;
        uint256 at=64+index;receiptNodes[at]=leaf;while(at>1){at/=2;receiptNodes[at]=nodeHash(receiptNodes[2*at],receiptNodes[2*at+1]);}
        receiptRoot=receiptNodes[1];++stateSequence;_record();emit ReceiptAdmitted(nf,leaf,index);
    }
    function consumeGlobal64(bytes32 authorization,bytes32[64] calldata tags,bytes32 acceptedEvidenceState,
        uint64 healthFrom,uint64 healthUntil,FlatHubCodec.QuorumSignature[3] calldata health) external nonReentrant onlyPool {
        require(isUsable(poolDomain,acceptedEvidenceState),"GLOBAL64_UNUSABLE_EVIDENCE");verifyFinalityHealth(healthFrom,healthUntil,health);
        require(reservedTagCapacity>=64&&uint256(spentTagCount)+64<=64,"GLOBAL64_CAPACITY_NOT_RESERVED");
        for(uint256 i=0;i<64;++i){require(tags[i]!=bytes32(0)&&!consumedTags[tags[i]],"GLOBAL64_RECEIPT_ALREADY_SPENT");for(uint256 j=0;j<i;++j)require(tags[i]!=tags[j],"GLOBAL64_DUPLICATE_TAG");}
        reservedTagCapacity-=64;for(uint256 i=0;i<64;++i){consumedTags[tags[i]]=true;spentTags[spentTagCount++]=tags[i];}
        spentTagDigest=_bounded(0x31,spentTags,spentTagCount);++spentTagSequence;++stateSequence;
        emit GlobalTagsConsumed(authorization,spentTagSequence);
    }
    function revoke(bytes32 gid,uint64 expectedSequence,bytes32 reason,uint64 expiresAt,
        FlatHubCodec.QuorumSignature[3] calldata signatures) external nonReentrant returns(bool){
        require(gid!=bytes32(0)&&reason!=bytes32(0),"GLOBAL64_REVOCATION_FIELDS");if(revoked[gid])return false;
        require(expectedSequence==revocationSequence&&block.timestamp<expiresAt,"GLOBAL64_REVOCATION_EXPIRED");
        _quorum(_hash("revoke",bytes.concat(_part(abi.encodePacked(hubDomain)),_part(abi.encodePacked(registryCommitment)),
            _part(abi.encodePacked(gid)),_part(abi.encodePacked(expectedSequence)),_part(abi.encodePacked(reason)),_part(abi.encodePacked(expiresAt)))),signatures);
        revoked[gid]=true;++revocationSequence;
        if(revokedCount<64)revokedGIDs[revokedCount++]=gid;
        if(revokedCount==64)halted=true;
        revokedDigest=_bounded(0x32,revokedGIDs,revokedCount);++stateSequence;_record();emit ReceiptRevoked(gid,reason,revocationSequence,halted);return true;
    }
    function finalityHealthDigest(uint64 validFrom,uint64 validUntil) public view returns(bytes32){
        return _hash("health",bytes.concat(_part(abi.encodePacked(pool)),_part(abi.encodePacked(poolDomain)),
            _part(abi.encodePacked(hubDomain)),_part(abi.encodePacked(registryCommitment)),_part(abi.encodePacked(evidenceState)),
            _part(abi.encodePacked(spentTagDigest)),_part(abi.encodePacked(spentTagCount)),_part(abi.encodePacked(spentTagSequence)),
            _part(abi.encodePacked(revokedDigest)),_part(abi.encodePacked(revokedCount)),_part(abi.encodePacked(revocationSequence)),
            _part(abi.encodePacked(stateSequence)),_part(abi.encodePacked(uint8(halted?1:0))),
            _part(abi.encodePacked(validFrom)),_part(abi.encodePacked(validUntil))));
    }
    function verifyFinalityHealth(uint64 from,uint64 until,FlatHubCodec.QuorumSignature[3] calldata signatures) public view returns(bool){
        require(!halted,"GLOBAL64_NATIVE_HALTED");_window(from,until);require(until-from<=30,"GLOBAL64_HEALTH_WINDOW");
        _quorum(finalityHealthDigest(from,until),signatures);return true;
    }
    function canonicalEvidence() external view returns(bytes32, uint32,bytes32,uint32,uint64,bytes32[64] memory){return(receiptRoot,receiptCount,revokedDigest,revokedCount,revocationSequence,revokedGIDs);}
    function receiptTreeNodes() external view returns(bytes32[128] memory){return receiptNodes;}
    function _record() private {
        // Byte-exact native_support::state::evidence_state_digest, reused rather
        // than relabeling a P2 root as a SHA root.
        evidenceState=sha256(bytes.concat(_part(bytes("LIANUM/PAEG/evidence-state/2")),_part(abi.encodePacked(hubDomain)),
            _part(abi.encodePacked(registryCommitment)),_part(abi.encodePacked(receiptRoot)),_part(abi.encodePacked(receiptCount)),
            _part(abi.encodePacked(revokedDigest)),_part(abi.encodePacked(revokedCount)),_part(abi.encodePacked(revocationSequence))));
        recordedSequencePlusOne[evidenceState]=revocationSequence+1;
    }
    function _bounded(uint8 prefix,bytes32[64] memory values,uint32 count) private view returns(bytes32){return sha256(abi.encodePacked(bytes1(prefix),hubDomain,count,values));}
    function _quorum(bytes32 digest,FlatHubCodec.QuorumSignature[3] calldata signatures) private view {FlatVerifierSet.requireCode(hubCodec,hubCodecCodeHash);FlatHubCodec.assertQuorum(digest,signatures,attesters);}
    function _requirePool() private view {FlatVerifierSet.requireCode(pool,poolCodeHash);}
    function _window(uint64 from,uint64 until) private view {require(from<until&&from<=block.timestamp&&block.timestamp<until,"GLOBAL64_OUTSIDE_WINDOW");}
    function _hash(string memory tag,bytes memory body) private pure returns(bytes32){return sha256(bytes.concat(_part(bytes(string.concat("LIANUM/PAEG/64/",tag,"/2"))),_part(bytes(PROFILE)),body));}
    function _part(bytes memory v) private pure returns(bytes memory){return bytes.concat(abi.encodePacked(uint32(v.length)),v);}
    function nodeHash(bytes32 left,bytes32 right) public pure returns(bytes32){return sha256(abi.encodePacked(bytes1(1),left,right));}
    function _u64(bytes32 v) private pure returns(uint64){require(uint256(v)<=type(uint64).max,"GLOBAL64_PUBLIC_U64");return uint64(uint256(v));}
    function _digest(bytes32[] calldata a,uint256 offset) private pure returns(bytes32){uint256 v;for(uint256 i=0;i<8;++i){require(uint256(a[offset+i])<=type(uint32).max,"GLOBAL64_PUBLIC_U32");v=(v<<32)|uint32(uint256(a[offset+i]));}return bytes32(v);}
}
