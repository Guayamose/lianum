/** Trusted host-only unit/asset binding. Never constructed from an API intent.
 * Deployment readers and source pins establish the descriptor before this
 * module validates it. This module does not establish token provenance. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const hex=(value,bytes)=>assert.ok(typeof value==='string'&&new RegExp(`^[0-9a-f]{${bytes*2}}$`).test(value),'PRIVATE_WALLET_ASSET_HEX');
const quantity=value=>{assert.ok((typeof value==='string'&&/^(0|[1-9][0-9]*)$/.test(value))||typeof value==='bigint','PRIVATE_WALLET_ASSET_QUANTITY');const n=BigInt(value);assert.ok(n>=0n&&n<(1n<<256n),'PRIVATE_WALLET_ASSET_QUANTITY');return n;};
export function derivePrivateWalletAssetIdentity(chainId,address,codeHash){
 hex(address,20);hex(codeHash,32);const chain=quantity(chainId);assert.ok(chain>0n,'PRIVATE_WALLET_ASSET_CHAIN');
 return createHash('sha256').update(Buffer.concat([Buffer.from([0x24]),Buffer.from(chain.toString(16).padStart(64,'0'),'hex'),Buffer.from(address,'hex'),Buffer.from(codeHash,'hex')])).digest('hex');
}
export function validatePrivateWalletAssetDescriptor(value,chainId){
 assert.ok(value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).length===4&&['kind','address','codeHash','identity'].every(k=>Object.hasOwn(value,k)),'PRIVATE_WALLET_ASSET_FIELDS');
 assert.ok(['NATIVE','ERC20'].includes(value.kind),'PRIVATE_WALLET_ASSET_KIND');hex(value.address,20);hex(value.codeHash,32);hex(value.identity,32);
 assert.equal(value.address==='00'.repeat(20),value.kind==='NATIVE','PRIVATE_WALLET_ASSET_ADDRESS');assert.equal(value.codeHash==='00'.repeat(32),value.kind==='NATIVE','PRIVATE_WALLET_ASSET_CODE');
 assert.equal(value.identity,derivePrivateWalletAssetIdentity(chainId,value.address,value.codeHash),'PRIVATE_WALLET_ASSET_IDENTITY');
 return Object.freeze({...value});
}

export function privateWalletPoolAssetDescriptor(pool,chainId){
 if(pool.assetIdentity===undefined){assert.equal(pool.asset,undefined,'PRIVATE_WALLET_ASSET_IDENTITY_REQUIRED');assert.equal(pool.assetCodeHash,undefined,'PRIVATE_WALLET_ASSET_IDENTITY_REQUIRED');return null;}
 for(const [name,bytes] of [['asset',20],['assetCodeHash',32],['assetIdentity',32]])assert.ok(typeof pool[name]==='string'&&new RegExp(`^0x[0-9a-f]{${bytes*2}}$`).test(pool[name]),'PRIVATE_WALLET_ASSET_POOL');
 return validatePrivateWalletAssetDescriptor({kind:pool.asset==='0x'+'00'.repeat(20)?'NATIVE':'ERC20',address:pool.asset.slice(2),codeHash:pool.assetCodeHash.slice(2),identity:pool.assetIdentity.slice(2)},chainId);
}
/** Re-read immutable deployment fields at the canonical observation height.
 * No supplied descriptor can replace the original pool's pinned identity. */
export async function assertPrivateWalletPoolAsset(pool,descriptor,chainId,block){
 assert.deepEqual(privateWalletPoolAssetDescriptor(pool,chainId),descriptor,'PRIVATE_WALLET_ASSET_POOL_CHANGED');
 if(descriptor)for(const [method,expected] of [['asset()','0x'+'0'.repeat(24)+descriptor.address],['assetCodeHash()','0x'+descriptor.codeHash],['assetIdentity()','0x'+descriptor.identity]])assert.equal(await pool.call(method,[],block),expected,'PRIVATE_WALLET_ASSET_DEPLOYMENT_CHANGED');
}

/** Capture separate asset methods; never replace runtime.balance with tokens.
 * Asset backing is the pool's tracked liability, not unsolicited token/native
 * surplus. The runtime adapter requests exact approval; the pinned pool checks
 * exact transfer deltas. */
export function privateWalletAssetBinding(shared){
 const {identity,pool,runtime,assetAdapter}=shared;
 if(!Object.hasOwn(identity,'asset')){
  assert.equal(assetAdapter,undefined,'PRIVATE_WALLET_UNEXPECTED_ASSET_ADAPTER');assert.equal(pool.assetIdentity,undefined,'PRIVATE_WALLET_ASSET_IDENTITY_REQUIRED');
  const balance=runtime.balance.bind(runtime);
  return Object.freeze({descriptor:null,balance:(address,block)=>balance(address,block),backingBalance:block=>balance(pool.address,block),fundingTransactionValue:amount=>quantity(amount),beforeDeposit:async()=>{}});
 }
 const descriptor=validatePrivateWalletAssetDescriptor(identity.asset,identity.chainId);
 assert.ok(assetAdapter,'PRIVATE_WALLET_ASSET_ADAPTER_REQUIRED');assert.deepEqual(validatePrivateWalletAssetDescriptor(assetAdapter.descriptor,identity.chainId),descriptor,'PRIVATE_WALLET_ASSET_ADAPTER_MISMATCH');
 assert.deepEqual(privateWalletPoolAssetDescriptor(pool,identity.chainId),descriptor,'PRIVATE_WALLET_ASSET_POOL');
 for(const name of ['balance','backingBalance','fundingTransactionValue','beforeDeposit'])assert.equal(typeof assetAdapter[name],'function','PRIVATE_WALLET_ASSET_ADAPTER_METHOD');
 const balance=assetAdapter.balance.bind(assetAdapter),backing=assetAdapter.backingBalance.bind(assetAdapter),funding=assetAdapter.fundingTransactionValue.bind(assetAdapter),approve=assetAdapter.beforeDeposit.bind(assetAdapter);
 return Object.freeze({descriptor,balance:async(address,block)=>quantity(await balance(address,block)),backingBalance:async block=>quantity(await backing(block)),fundingTransactionValue:amount=>{const n=quantity(amount),funded=funding(amount);assert.ok(typeof funded==='bigint'||typeof funded==='string'&&/^(0|[1-9][0-9]*|0x(?:0|[1-9a-f][0-9a-f]*))$/.test(funded),'PRIVATE_WALLET_ASSET_FUNDING_VALUE');const value=quantity(BigInt(funded));assert.equal(value,descriptor.kind==='ERC20'?0n:n,'PRIVATE_WALLET_ASSET_FUNDING_VALUE');return value;},beforeDeposit:async(amount,from)=>{quantity(amount);await approve(amount,from);}});
}
