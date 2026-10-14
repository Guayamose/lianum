// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
import {FlatVerifierSet,IFlatProofVerifier} from "./FlatVerifierSet.sol";
import {FlatHubCodec} from "./FlatHubCodec.sol";
import {PrivatePagedFundedGraphStateV3} from "./PrivatePagedFundedGraphStateV3.sol";
/// Separate V3 pool. Original D26/D27/PC23 note bytes and exact backing delta
/// remain unchanged. Graph outputs are one signed sparse root issued ONLY at
/// global T3 closure; pages do not insert notes or pay. The original 256-leaf
/// source/change/recovery ledger is a funding-ledger limit, not a graph cap.
contract PrivatePagedFundedGraphPoolV4 {
 string public constant PROFILE="LIANUM_PAEG_FUNDED_PAGED_V3";
 uint256 public constant CAPACITY=256;uint256 public constant MAX_BACKED_AMOUNT=CAPACITY*type(uint64).max;uint256 public constant EPOCH_SECONDS=600;
 uint64 public immutable minimumDepositAmount;
 address public immutable asset;bytes32 public immutable assetCodeHash;bytes32 public immutable assetIdentity;bytes32 public immutable scope;bytes32 public immutable policy;bytes32 public immutable domainCommitment;
 PrivatePagedFundedGraphStateV3 public immutable graphState;bytes32 public immutable graphStateCodeHash;
 FlatVerifierSet.Configuration private originalVerifiers;FlatVerifierSet.Pin private newWithdrawV3;
 bytes32 public immutable artifactManifest;uint256 public backedAmount;uint32 public leafCount;uint32 public liveReservations;uint64 public stateSequence;bytes32 public currentRoot;
 bytes32[512] private nodes;mapping(bytes32=>bool) public insertedCommitments;mapping(bytes32=>bool) public spentNullifiers;mapping(bytes32=>bool) public acceptedRoots;mapping(bytes32=>bool) public acceptedSparseOutputRoots;
 mapping(bytes32=>uint8) public graphOutcomes;mapping(bytes32=>bytes32) public globalOutputRoots;mapping(bytes32=>bytes32) public globalOutputsCommitments;
 uint256 private entered;
 struct Deployment {uint64 minimumDepositAmount;address asset;bytes32 deploymentDomain;bytes32 policy;bytes32 hubDomain;bytes32 registryCommitment;address state;bytes32 stateCodeHash;bytes32 manifest;FlatVerifierSet.Configuration originals;FlatVerifierSet.Pin withdrawalV3;}
 event NoteInserted(bytes32 indexed commitment,uint32 index);event GlobalClosed(bytes32 indexed authorization,uint8 outcome,bytes32 rootOrRecovery);event Withdrawal(address indexed recipient,uint64 amount,bytes32 nullifier);
 modifier exclusive(){require(entered==0,"PAGED_POOL_REENTRANT");entered=1;_assertBackingBefore();_;_assertBacking(0);entered=0;}
 constructor(Deployment memory c){require(c.minimumDepositAmount>0,"PAGED_MINIMUM_DEPOSIT_REQUIRED");minimumDepositAmount=c.minimumDepositAmount;require(c.deploymentDomain!=bytes32(0)&&c.policy!=bytes32(0)&&c.hubDomain!=bytes32(0)&&c.registryCommitment!=bytes32(0)&&c.manifest!=bytes32(0),"PAGED_POOL_DEPLOYMENT");require(c.asset==address(0)||c.asset.code.length!=0,"CONFIG_ASSET");asset=c.asset;assetCodeHash=c.asset==address(0)?bytes32(0):c.asset.codehash;assetIdentity=sha256(abi.encodePacked(bytes1(0x24),block.chainid,c.asset,assetCodeHash));scope=sha256(abi.encodePacked(bytes1(0x25),block.chainid,address(this),c.deploymentDomain,assetIdentity));policy=c.policy;artifactManifest=c.manifest;FlatVerifierSet.validate(c.originals);originalVerifiers=c.originals;FlatVerifierSet.requireCode(c.withdrawalV3.verifier,c.withdrawalV3.codeHash);newWithdrawV3=c.withdrawalV3;
 domainCommitment=_hash("domain",bytes.concat(_part(abi.encodePacked(scope)),_part(abi.encodePacked(policy)),_part(abi.encodePacked(assetIdentity)),_part(abi.encodePacked(c.hubDomain)),_part(abi.encodePacked(c.registryCommitment))));FlatVerifierSet.requireCode(c.state,c.stateCodeHash);graphState=PrivatePagedFundedGraphStateV3(c.state);graphStateCodeHash=c.stateCodeHash;require(graphState.pool()==address(this)&&graphState.domain()==domainCommitment&&graphState.artifactManifest()==c.manifest,"PAGED_POOL_STATE_BINDING");for(uint256 i=CAPACITY-1;i>0;--i)nodes[i]=nodeHash(nodes[2*i],nodes[2*i+1]);currentRoot=nodes[1];acceptedRoots[currentRoot]=true;
 }
 function graphProfileHash() external pure returns(bytes32){return keccak256(bytes(PROFILE));}
 function depositBalance(bytes calldata proof,bytes32[] calldata p) external payable exclusive {require(p.length==26&&_digest(p,0)==scope&&_digest(p,8)==policy,"PAGED_DEPOSIT_DOMAIN");require(_u64(p[16])==block.timestamp/EPOCH_SECONDS,"STALE_EPOCH");uint64 amount=_u64(p[17]);require(amount>=minimumDepositAmount,"DEPOSIT_BELOW_MINIMUM");require(leafCount+liveReservations+1<=CAPACITY,"PAGED_SOURCE_HEADROOM");require(FlatVerifierSet.verify(originalVerifiers,FlatVerifierSet.DEPOSIT_BALANCE,proof,p),"DEPOSIT_BALANCE_PROOF");_receiveAsset(amount);_append(_digest(p,18));}
 function depositBalanceIntent(bytes calldata proof,bytes32[] calldata p) external payable exclusive {require(p.length==27&&_digest(p,0)==scope&&_digest(p,8)==policy,"PAGED_DEPOSIT_DOMAIN");_window(_u64(p[16]),_u64(p[17]));uint64 amount=_u64(p[18]);require(amount>=minimumDepositAmount,"DEPOSIT_BELOW_MINIMUM");require(leafCount+liveReservations+1<=CAPACITY,"PAGED_SOURCE_HEADROOM");require(FlatVerifierSet.verify(originalVerifiers,FlatVerifierSet.DEPOSIT_INTENT,proof,p),"DEPOSIT_INTENT_PROOF");_receiveAsset(amount);_append(_digest(p,19));}
 function reserve(bytes calldata proof,bytes32[] calldata p) external exclusive {require(p.length==119&&_digest(p,0)==domainCommitment&&_digest(p,88)==currentRoot,"PAGED_RESERVE_CURRENT_SOURCE");bytes32 auth=_digest(p,8);bytes32 nf=_digest(p,16);require(auth!=bytes32(0)&&graphOutcomes[auth]==0&&!spentNullifiers[nf]&&nf!=bytes32(0),"PAGED_ALREADY_RESERVED");require(leafCount+liveReservations+2<=CAPACITY,"PAGED_SOURCE_HEADROOM");_requireState();graphState.begin(proof,p);spentNullifiers[nf]=true;graphOutcomes[auth]=1;++liveReservations;globalOutputRoots[auth]=_digest(p,48);globalOutputsCommitments[auth]=_digest(p,80);_append(_digest(p,72));}
 // R3 authenticates the outputs membership root at p80. Neither a caller
 // root DTO nor an intermediate fold can publish a spendable output.
 function fold(bytes calldata proof,bytes32[] calldata p,uint64 from,uint64 until,FlatHubCodec.QuorumSignature[3] calldata health) external exclusive {_requireState();graphState.fold(proof,p,from,until,health);++stateSequence;}
 function issueReady(bytes32 auth) external view returns(bytes32){_requireState();return graphState.issueReady(auth);}
 function fulfill(bytes calldata proof,bytes32[] calldata p,uint64 from,uint64 until,FlatHubCodec.QuorumSignature[3] calldata health) external exclusive {bytes32 auth=_digest(p,8);require(graphOutcomes[auth]==1,"PAGED_RESERVATION_REQUIRED");_requireState();bytes32 outputs=graphState.fulfill(proof,p,from,until,health);require(outputs==globalOutputRoots[auth],"PAGED_OUTPUT_ROOT_CHANGED");graphOutcomes[auth]=2;--liveReservations;bytes32 membership=globalOutputsCommitments[auth];require(membership!=bytes32(0)&&!acceptedSparseOutputRoots[membership],"PAGED_OUTPUT_MEMBERSHIP_REQUIRED");acceptedSparseOutputRoots[membership]=true;++stateSequence;emit GlobalClosed(auth,2,outputs);}
 function recover(bytes32 auth) external exclusive {require(graphOutcomes[auth]==1,"PAGED_RESERVATION_REQUIRED");_requireState();bytes32 recovery=graphState.recover(auth);graphOutcomes[auth]=3;--liveReservations;_append(recovery);emit GlobalClosed(auth,3,recovery);}
 function withdraw(bytes calldata proof,bytes32[] calldata p) external exclusive {require(p.length==39&&_digest(p,0)==scope&&_digest(p,8)==policy,"PAGED_WITHDRAW_DOMAIN");require(_u64(p[16])==block.timestamp/EPOCH_SECONDS,"STALE_EPOCH");bytes32 root=_digest(p,17);require(acceptedRoots[root]||acceptedSparseOutputRoots[root],"PAGED_UNISSUED_OUTPUT_ROOT");bytes32 nf=_digest(p,25);require(nf!=bytes32(0)&&!spentNullifiers[nf],"NOTE_ALREADY_SPENT");uint64 amount=_u64(p[33]);uint160 raw;for(uint256 i=34;i<39;++i){require(uint256(p[i])<=type(uint32).max,"PUBLIC_U32");raw=(raw<<32)|uint160(uint32(uint256(p[i])));}address recipient=address(raw);require(amount>0&&recipient!=address(0)&&recipient!=address(this)&&backedAmount>=amount,"WITHDRAWAL_TERMS");FlatVerifierSet.requireCode(newWithdrawV3.verifier,newWithdrawV3.codeHash);require(IFlatProofVerifier(newWithdrawV3.verifier).verify(proof,p),"PAGED_WITHDRAW_PROOF");spentNullifiers[nf]=true;backedAmount-=amount;++stateSequence;_sendAsset(recipient,amount);emit Withdrawal(recipient,amount,nf);}
 function _append(bytes32 cm) private {require(cm!=bytes32(0)&&!insertedCommitments[cm]&&leafCount<CAPACITY,"PAGED_SOURCE_NOTE_REUSED");insertedCommitments[cm]=true;uint256 at=CAPACITY+leafCount;emit NoteInserted(cm,leafCount++);nodes[at]=cm;while(at>1){at/=2;nodes[at]=nodeHash(nodes[2*at],nodes[2*at+1]);}currentRoot=nodes[1];acceptedRoots[currentRoot]=true;++stateSequence;}
 function _requireState() private view {FlatVerifierSet.requireCode(address(graphState),graphStateCodeHash);}
 function nodeHash(bytes32 a,bytes32 b) public pure returns(bytes32){return sha256(abi.encodePacked(bytes1(uint8(1)),a,b));}
 function _window(uint64 from,uint64 until) private view {require(from<until&&from<=block.timestamp&&block.timestamp<until,"OUTSIDE_WINDOW");}
 function _u64(bytes32 v) private pure returns(uint64){require(uint256(v)<=type(uint64).max,"PUBLIC_U64");return uint64(uint256(v));}
 function _digest(bytes32[] calldata p,uint256 at) private pure returns(bytes32){uint256 x;for(uint256 i=0;i<8;++i){require(uint256(p[at+i])<=type(uint32).max,"PUBLIC_U32");x=(x<<32)|uint32(uint256(p[at+i]));}return bytes32(x);}
 function _hash(string memory tag,bytes memory body) private pure returns(bytes32){return sha256(bytes.concat(_part(bytes(string.concat("LIANUM/PAEG/paged/",tag,"/3"))),_part(bytes(PROFILE)),body));}
 function _part(bytes memory v) private pure returns(bytes memory){return bytes.concat(abi.encodePacked(uint32(v.length)),v);}
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
