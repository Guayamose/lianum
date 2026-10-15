/** Canonical capacity of the SAME Original public pool. Read-only DATA cannot
 * create a successor, authorize a deposit or revive a historical permission. */
import assert from 'node:assert/strict';
import {assertOriginalFundedPagedGraphSepoliaWalletV4,assertOriginalPagedSepoliaReceiverReadyV4,readOriginalFundedPagedGraphSepoliaDeploymentV4} from '../local/funded-graph-paged-public-kernel-v4.mjs';
const unsigned=value=>{assert.match(value,/^0x[0-9a-f]{64}$/,'PAGED_PUBLIC_CAPACITY_GETTER');return BigInt(value);};
export async function readOriginalPagedPublicPoolCapacityV5(runtime,system){
 assert.equal(arguments.length,2);assertOriginalFundedPagedGraphSepoliaWalletV4(runtime,system);await assertOriginalPagedSepoliaReceiverReadyV4(runtime,system);
 const deployment=readOriginalFundedPagedGraphSepoliaDeploymentV4(runtime,system),head=await runtime.block();await runtime.assertCanonical(head);
 for(const kind of ['pool','state','native'])assert.equal(await runtime.code(system[kind],head.number),deployment[kind].expectedCode,'PAGED_PUBLIC_CAPACITY_SAME_DEPLOYMENT');
 const signatures=['CAPACITY()','leafCount()','liveReservations()','minimumDepositAmount()','backedAmount()','currentRoot()'];
 const values=await Promise.all(signatures.map(signature=>deployment.call('pool',signature,[],head.number)));
 const [capacity,leaves,reservations,minimum,backed]=values.slice(0,5).map(unsigned),currentRoot=values[5];
 assert.equal(capacity,256n,'PAGED_PUBLIC_CAPACITY_COMPILED_BOUND');assert.ok(leaves<=capacity&&reservations<=capacity&&leaves+reservations<=capacity,'PAGED_PUBLIC_CAPACITY_COMMITTED_SLOTS');assert.equal(minimum.toString(),system.minimumDepositAtomic,'PAGED_PUBLIC_CAPACITY_ORIGINAL_MINIMUM');assert.ok(minimum>0n&&minimum<(1n<<64n)&&backed<=capacity*((1n<<64n)-1n),'PAGED_PUBLIC_CAPACITY_BACKING_BOUND');assert.match(currentRoot,/^0x[0-9a-f]{64}$/);
 await runtime.assertCanonical(head);assertOriginalFundedPagedGraphSepoliaWalletV4(runtime,system);
 const remaining=capacity-leaves-reservations;
 return Object.freeze({profile:'ORIGINAL_PAGED_PUBLIC_POOL_CAPACITY_DATA_V5',pool:system.pool,scope:system.scope,domain:system.domain,assetIdentity:system.assetIdentity,minimumDepositAtomic:minimum.toString(),capacity:capacity.toString(),leafCount:leaves.toString(),liveReservations:reservations.toString(),availableSlots:remaining.toString(),requiredSlotsForDepositAndGraph:'3',acceptsDepositAndGraph:remaining>=3n,backedAmountAtomic:backed.toString(),currentRoot,blockHash:head.hash,blockNumber:head.number,blockTimestamp:head.timestamp,withdrawalsConsumeSlots:false,financialAuthorization:false});
}
