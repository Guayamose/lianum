// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
import {FlatVerifierSet,IFlatProofVerifier} from "./FlatVerifierSet.sol";
import {FlatHubCodec} from "./FlatHubCodec.sol";
interface IPagedNativeReceiptStateV3 {
 function graphProfileHash() external view returns(bytes32);function domain() external view returns(bytes32);function graphState() external view returns(address);function artifactManifest() external view returns(bytes32);function revocationSequence() external view returns(uint64);function receiptRoot() external view returns(bytes32);function isCurrentEvidence(bytes32,uint64) external view returns(bool);function verifyFinalityHealth(uint64,uint64,FlatHubCodec.QuorumSignature[3] calldata) external view returns(bool);
}
interface IPagedSourcePoolV3 {function graphProfileHash() external view returns(bytes32);function currentRoot() external view returns(bytes32);function domainCommitment() external view returns(bytes32);}
/// SAME signed graph/reservation/NF, with privately blinded progress. Neither
/// cursor, dependency endpoints/degrees, mode nor per-node payout delta is
/// stored/emitted here. Counts/timing of transactions and native facts remain
/// observable; this is not systemic chain/RPC anonymity.
contract PrivatePagedFundedGraphStateV3 {
 string public constant PROFILE="LIANUM_PAEG_FUNDED_PAGED_V3";
 address public immutable pool;bytes32 public poolCodeHash;bytes32 public immutable domain;
 bytes32 public immutable artifactManifest;bytes32 public immutable verifierCommitment;
 IPagedNativeReceiptStateV3 public immutable nativeState;bytes32 public immutable nativeStateCodeHash;
 FlatVerifierSet.Pin[3] private verifiers;
 struct Reservation {bytes32 reserveNF;bytes32 pagesRoot;bytes32 nodesRoot;bytes32 outputsRoot;bytes32 outputsCommitment;bytes32 recovery;bytes32 change;bytes32 commitment;bytes32 ready;uint64 totalPages;uint64 totalNodes;uint64 budget;uint64 settleBefore;uint64 revocationSequence;uint8 outcome;}
 mapping(bytes32=>Reservation) private reservations;
 mapping(bytes32=>bool) public consumedSourceNullifiers;mapping(bytes32=>bool) public consumedReserveNullifiers;mapping(bytes32=>bool) public reservedReserveNullifiers;
 uint256 private entered;
 event GlobalReserved(bytes32 indexed authorization,bytes32 reserveNF,uint64 pages,uint64 nodes);
 event ProgressFolded(bytes32 indexed authorization,bytes32 previousCommitment,bytes32 nextCommitment);
 event GlobalClosed(bytes32 indexed authorization,uint8 outcome,bytes32 outputsOrRecovery);
 modifier onlyPool(){require(msg.sender==pool,"PAGED_ORIGINAL_POOL");FlatVerifierSet.requireCode(pool,poolCodeHash);require(IPagedSourcePoolV3(pool).graphProfileHash()==keccak256(bytes(PROFILE))&&IPagedSourcePoolV3(pool).domainCommitment()==domain,"PAGED_POOL_PROFILE");_;}
 modifier exclusive(){require(entered==0,"PAGED_REENTRANT");entered=1;_;entered=0;}
 constructor(address originalPool,bytes32 originalPoolCodeHash,bytes32 originalDomain,bytes32 manifest,FlatVerifierSet.Pin[3] memory newV3Verifiers,address originalV3NativeState,bytes32 nativeCodeHash){
 require(originalPool!=address(0)&&originalDomain!=bytes32(0)&&manifest!=bytes32(0)&&originalPoolCodeHash!=bytes32(0)&&originalPoolCodeHash!=keccak256(""),"PAGED_DEPLOYMENT");pool=originalPool;poolCodeHash=originalPoolCodeHash;domain=originalDomain;artifactManifest=manifest;
 FlatVerifierSet.requireCode(originalV3NativeState,nativeCodeHash);nativeState=IPagedNativeReceiptStateV3(originalV3NativeState);nativeStateCodeHash=nativeCodeHash;require(nativeState.graphProfileHash()==keccak256(bytes(PROFILE))&&nativeState.domain()==domain&&nativeState.graphState()==address(this)&&nativeState.artifactManifest()==manifest,"PAGED_NATIVE_PROFILE");bytes memory pins=abi.encodePacked(manifest);for(uint256 i=0;i<3;++i){FlatVerifierSet.requireCode(newV3Verifiers[i].verifier,newV3Verifiers[i].codeHash);verifiers[i]=newV3Verifiers[i];pins=bytes.concat(pins,abi.encodePacked(uint8(i),newV3Verifiers[i].verifier,newV3Verifiers[i].codeHash));}verifierCommitment=sha256(pins);
 }
 function graphProfileHash() external pure returns(bytes32){return keccak256(bytes(PROFILE));}
 function begin(bytes calldata proof,bytes32[] calldata p) external onlyPool exclusive {
 require(p.length==119&&_digest(p,0)==domain,"PAGED_R_DOMAIN");_window(_u64(p[99]),_u64(p[100]));require(_u64(p[100])<=_u64(p[101]),"PAGED_CUTOFF");require(_digest(p,88)==IPagedSourcePoolV3(pool).currentRoot(),"PAGED_ORIGINAL_SOURCE_ROOT");bytes32 auth=_digest(p,8);bytes32 nf=_digest(p,24);bytes32 sourceNF=_digest(p,16);require(auth!=bytes32(0)&&nf!=bytes32(0)&&sourceNF!=bytes32(0)&&nf!=sourceNF,"PAGED_R_IDENTITIES");require(reservations[auth].outcome==0&&!consumedSourceNullifiers[sourceNF]&&!reservedReserveNullifiers[nf]&&!consumedReserveNullifiers[nf],"PAGED_ALREADY_RESERVED");uint64 pages=_u64(p[96]);uint64 nodes=_u64(p[97]);uint64 budget=_u64(p[98]);require(pages>0&&nodes>=pages&&uint256(nodes)<=uint256(pages)*64&&budget>=nodes,"PAGED_R_COUNTS");FlatVerifierSet.requireCode(address(nativeState),nativeStateCodeHash);uint64 sequence=_u64(p[118]);require(sequence==nativeState.revocationSequence(),"PAGED_REVOCATION_CHANGED");bytes32 initial=_digest(p,102);bytes32 ready=_digest(p,110);require(initial!=bytes32(0)&&ready!=bytes32(0),"PAGED_PRIVATE_PROGRESS_REQUIRED");require(_verify(0,proof,p),"PAGED_R_PROOF");
 consumedSourceNullifiers[sourceNF]=true;reservedReserveNullifiers[nf]=true;Reservation storage r=reservations[auth];r.reserveNF=nf;r.pagesRoot=_digest(p,32);r.nodesRoot=_digest(p,40);r.outputsRoot=_digest(p,48);r.outputsCommitment=_digest(p,80);r.recovery=_digest(p,64);r.change=_digest(p,72);r.totalPages=pages;r.totalNodes=nodes;r.budget=budget;r.settleBefore=_u64(p[101]);r.revocationSequence=sequence;r.commitment=initial;r.ready=ready;r.outcome=1;emit GlobalReserved(auth,nf,pages,nodes);
 }
 function fold(bytes calldata proof,bytes32[] calldata p,uint64 from,uint64 until,FlatHubCodec.QuorumSignature[3] calldata health) external onlyPool exclusive {
 require(p.length==66&&_digest(p,0)==domain,"PAGED_FOLD_DOMAIN");bytes32 auth=_digest(p,8);Reservation storage r=reservations[auth];require(r.outcome==1&&block.timestamp<r.settleBefore,"PAGED_R_REQUIRED");bytes32 previous=_digest(p,24);bytes32 next=_digest(p,32);bytes32 ready=_digest(p,56);require(_digest(p,16)==r.reserveNF&&previous==r.commitment&&next!=bytes32(0)&&next!=previous&&ready!=bytes32(0),"PAGED_PREVIOUS_COMMITMENT");_window(_u64(p[64]),_u64(p[65]));require(_u64(p[65])<=r.settleBefore,"PAGED_FOLD_WINDOW");_currentEvidence(_digest(p,40),r.revocationSequence,from,until,health);require(_digest(p,48)==nativeState.receiptRoot(),"PAGED_CURRENT_RECEIPT_ROOT");require(_verify(1,proof,p),"PAGED_FOLD_PROOF");r.commitment=next;r.ready=ready;emit ProgressFolded(auth,previous,next);
 }
 // This is an opaque token, not a Ready authority for every private state.
 // A3 must prove hidden same-node prerequisites complete at this commitment.
 function issueReady(bytes32 auth) external onlyPool view returns(bytes32){Reservation storage r=reservations[auth];require(r.outcome==1&&block.timestamp<r.settleBefore&&nativeState.revocationSequence()==r.revocationSequence,"PAGED_READY_CURRENT");return r.ready;}
 function isOriginalReady(bytes32 auth,bytes32 ready,bytes32 commitment) external view returns(bool){Reservation storage r=reservations[auth];return r.outcome==1&&ready!=bytes32(0)&&r.ready==ready&&r.commitment==commitment&&block.timestamp<r.settleBefore&&r.revocationSequence==nativeState.revocationSequence();}
 function fulfill(bytes calldata proof,bytes32[] calldata p,uint64 from,uint64 until,FlatHubCodec.QuorumSignature[3] calldata health) external onlyPool exclusive returns(bytes32 outputs){require(p.length==46&&_digest(p,0)==domain,"PAGED_TERMINAL_DOMAIN");bytes32 auth=_digest(p,8);Reservation storage r=reservations[auth];require(r.outcome==1&&block.timestamp<r.settleBefore&&!consumedReserveNullifiers[r.reserveNF],"PAGED_R_REQUIRED");require(_digest(p,16)==r.reserveNF&&_digest(p,24)==r.commitment,"PAGED_TERMINAL_COMMITMENT");require(_u64(p[32])==r.totalPages&&_u64(p[33])==r.totalNodes&&_u64(p[34])==r.budget,"PAGED_TERMINAL_COUNTS");require(_u64(p[43])==r.revocationSequence,"PAGED_REVOCATION_CHANGED");_window(_u64(p[44]),_u64(p[45]));require(_u64(p[45])<=r.settleBefore,"PAGED_TERMINAL_WINDOW");_currentEvidence(_digest(p,35),r.revocationSequence,from,until,health);require(_verify(2,proof,p),"PAGED_TERMINAL_PROOF");r.outcome=2;consumedReserveNullifiers[r.reserveNF]=true;outputs=r.outputsRoot;emit GlobalClosed(auth,2,outputs);}
 function recover(bytes32 auth) external onlyPool exclusive returns(bytes32 recovery){Reservation storage r=reservations[auth];require(r.outcome==1&&block.timestamp>=r.settleBefore&&!consumedReserveNullifiers[r.reserveNF],"PAGED_RECOVERY_NOT_AVAILABLE");r.outcome=3;consumedReserveNullifiers[r.reserveNF]=true;recovery=r.recovery;emit GlobalClosed(auth,3,recovery);}
 function progress(bytes32 auth) external view returns(Reservation memory){return reservations[auth];}
 function globalCutoff(bytes32 auth) external view returns(uint64){return reservations[auth].settleBefore;}
 function verifierPin(uint256 role) external view returns(address,bytes32){require(role<3,"PAGED_VERIFIER_ROLE");return(verifiers[role].verifier,verifiers[role].codeHash);}
 function _currentEvidence(bytes32 evidence,uint64 sequence,uint64 from,uint64 until,FlatHubCodec.QuorumSignature[3] calldata health) private view {_window(from,until);require(until-from<=30,"PAGED_NATIVE_HEALTH_WINDOW");FlatVerifierSet.requireCode(address(nativeState),nativeStateCodeHash);require(nativeState.isCurrentEvidence(evidence,sequence),"PAGED_NATIVE_STATE_CHANGED");require(nativeState.verifyFinalityHealth(from,until,health),"PAGED_NATIVE_HEALTH");}
 function _verify(uint256 role,bytes calldata proof,bytes32[] calldata p) private view returns(bool){FlatVerifierSet.Pin storage pin=verifiers[role];FlatVerifierSet.requireCode(pin.verifier,pin.codeHash);return IFlatProofVerifier(pin.verifier).verify(proof,p);}
 function _hash(string memory tag,bytes memory body) private pure returns(bytes32){return sha256(bytes.concat(_part(bytes(string.concat("LIANUM/PAEG/paged/",tag,"/3"))),_part(bytes(PROFILE)),body));}
 function _part(bytes memory v) private pure returns(bytes memory){return bytes.concat(abi.encodePacked(uint32(v.length)),v);}
 function _window(uint64 from,uint64 until) private view {require(from<until&&from<=block.timestamp&&block.timestamp<until,"PAGED_OUTSIDE_WINDOW");}
 function _u64(bytes32 v) private pure returns(uint64){require(uint256(v)<=type(uint64).max,"PAGED_PUBLIC_U64");return uint64(uint256(v));}
 function _digest(bytes32[] calldata p,uint256 at) private pure returns(bytes32){uint256 x;for(uint256 i=0;i<8;++i){require(uint256(p[at+i])<=type(uint32).max,"PAGED_PUBLIC_U32");x=(x<<32)|uint32(uint256(p[at+i]));}return bytes32(x);}
}
