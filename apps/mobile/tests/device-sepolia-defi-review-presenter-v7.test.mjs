import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {presentDeviceSepoliaDefiReviewV7} from '../src/screens/sepolia-defi-review-presenter-v7.mjs';
const h=value=>createHash('sha256').update(value).digest('hex');
function review(protocol='AAVE_STATIC',action='INVEST') {
  return {profile:'DEVICE_SEPOLIA_DEFI_REVIEW_V4',protocol,action,
    descriptor:{profile:'LIANUM_DEVICE_EXTERNAL_FLAT_SHARE_NOTE_V1',origin:'https://lianum.example.test',devicePublicKey:'04'+'11'.repeat(64),pairingId:h('pairing'),lifetime:h('lifetime'),
      poolTerms:Object.fromEntries(['pool','asset','hub','poolCodeHash','scope','policy','assetIdentity','assetCodeHash','genesis','domainCommitment','hubCodeHash','hubDomain','ledgerNamespace'].map(name=>[name,h(name).slice(0,['pool','asset','hub'].includes(name)?40:64)])),
      assetMetadata:{kind:'ERC20',symbol:protocol==='AAVE_STATIC'?'stataUSDC':'mvUSDC',decimals:protocol==='AAVE_STATIC'?6:18}},
    rootId:h('root'),noteRevision:1,reference:h('reference'),shares:protocol==='AAVE_STATIC'?'1000001':'1000000000000000001',
    maximumInputAtomic:action==='INVEST'?'9007199254740993123456':null,minimumAssetsAtomic:action==='REDEEM'?'1000001':null,
    underlyingReceiver:'0x'+'8'.repeat(40),shareWithdrawalRecipient:'0x'+'9'.repeat(40),validFrom:'1000',validUntil:'1600',receiptCommitment:action==='INVEST'?h('receipt'):null};
}
test('review keeps the exact maximum USDC and fractional shares without floating point',()=>{
  const view=presentDeviceSepoliaDefiReviewV7(review(),1200000);
  assert.equal(view.amount,'9007199254740993.123456 USDC');
  assert.equal(view.shares,'1.000001 stataUSDC');
  assert.equal(view.confirmLabel,'Confirm investment');
  assert.equal(view.live,true);
  assert.match(view.detail,/when the network accepts the deposit/);
  assert.ok(!JSON.stringify(view).includes('Investment confirmed'));
});
test('redemption identifies the public destination and the signed minimum',()=>{
  const source=review('MORPHO_V2','REDEEM'),view=presentDeviceSepoliaDefiReviewV7(source,1200000);
  assert.equal(view.shares,'1.000000000000000001 mvUSDC');
  assert.equal(view.amount,'1.000001 USDC');
  assert.equal(view.destination,source.underlyingReceiver);
  assert.match(view.detail,/transfer is visible on the public network/);
  assert.equal(view.confirmLabel,'Confirm withdrawal');
});
test('the exact authorization window closes without extending the signed deadline',()=>{
  const source=review();
  assert.equal(presentDeviceSepoliaDefiReviewV7(source,999999).live,false);
  assert.equal(presentDeviceSepoliaDefiReviewV7(source,1000000).live,true);
  assert.equal(presentDeviceSepoliaDefiReviewV7(source,1599999).live,true);
  const expired=presentDeviceSepoliaDefiReviewV7(source,1600000);
  assert.equal(expired.live,false);assert.match(expired.timeNotice,/expired/);assert.equal(expired.validUntil,'1600');
  assert.throws(()=>presentDeviceSepoliaDefiReviewV7({...source,maximumInputAtomic:'-1'},1200000));
});
