// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.37;
import {Poseidon2} from "./Poseidon2.sol";
/// Own V3 sparse domain; no original bounded P2 profile or digest reduction.
/// Consumers pin this linked library's EXACT deployed code before funding.
library PagedSparsePoseidon2V3 {
 uint256 internal constant PROFILE=0x4c49414e554d5f50414745445f545245455f50325f5633;
 uint256 internal constant MODULUS=21888242871839275222246405745257275088548364400416034343698204186575808495617;
 function _kind(uint8 kind) private pure {require(kind<5,"PAGED_SPARSE_KIND");}
 function _field(bytes32 value) private pure returns(uint256){uint256 n=uint256(value);require(n<MODULUS,"PAGED_SPARSE_NONCANONICAL_FIELD");return n;}
 function empty(uint8 kind) public pure returns(bytes32){_kind(kind);uint256[] memory p=new uint256[](5);p[0]=PROFILE;p[1]=3;p[2]=1;p[3]=1;p[4]=kind;return bytes32(Poseidon2.hash(p));}
 function leaf(uint8 kind,bytes32 digest) public pure returns(bytes32){_kind(kind);uint256[] memory p=new uint256[](7);p[0]=PROFILE;p[1]=3;p[2]=2;p[3]=3;p[4]=kind;p[5]=uint256(digest)>>128;p[6]=uint256(digest)&type(uint128).max;return bytes32(Poseidon2.hash(p));}
 function branch(uint8 kind,uint8 level,bytes32 left,bytes32 right) public pure returns(bytes32){_kind(kind);require(level>0&&level<=64,"PAGED_SPARSE_LEVEL");uint256[] memory p=new uint256[](8);p[0]=PROFILE;p[1]=3;p[2]=3;p[3]=4;p[4]=kind;p[5]=level;p[6]=_field(left);p[7]=_field(right);return bytes32(Poseidon2.hash(p));}
}
