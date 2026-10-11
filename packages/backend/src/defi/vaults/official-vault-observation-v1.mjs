/** Canonical read-only private share valuation. No runtime, custody or receipt
 * authority is created; the owner binds these ports to its original fixture. */
import assert from 'node:assert/strict';
import {exactRecord} from '@lianum/components/encoding/commitments';
/** @typedef {{number:string, hash:string}} Header */
/**
 * @template {object} Runtime
 * @template {object} Fixture
 * @template {object} Position
 * @param {{blue:boolean,aave:boolean,runtime:Runtime,originalFixture:Fixture,position:Position}} binding
 * @param {{assertBlue:(r:Runtime,p:Position)=>unknown,assertAave:(r:Runtime,f:Fixture)=>unknown,assertMeta:(r:Runtime,f:Fixture)=>unknown,assertRuntime:(r:Runtime)=>Promise<unknown>}} guards
 */
export async function assertOfficialVaultFixtureV1(binding, guards) {
 const {blue,aave,runtime,originalFixture,position}=binding;
 if(blue)guards.assertBlue(runtime,position);
 if(aave)guards.assertAave(runtime,originalFixture);else guards.assertMeta(runtime,originalFixture);
 await guards.assertRuntime(runtime);
}
/**
 * @template {{header:Header}} View
 * @template {object} Contract
 * @param {unknown} input
 * @param {{runtime:{assertCanonical:(header:Header)=>Promise<unknown>,block:()=>Promise<Header>},vault:Contract,observed:()=>Promise<View>,read:(target:Contract,method:string,args:string[],tag:string)=>Promise<[bigint]>,detached:<T>(value:T)=>T}} ports
 */
export async function observeOfficialPrivateSharesV1(input, ports) {
 const {runtime,vault,observed,read,detached}=ports;
      exactRecord(input, ['amount', 'holder']);
      assert.ok(typeof input.amount === 'string' && /^(0|[1-9][0-9]*)$/.test(input.amount)
        && BigInt(input.amount) < (1n << 64n), 'METAMORPHO_PRIVATE_SHARE_AMOUNT');
      assert.ok(typeof input.holder === 'string' && /^0x[0-9a-f]{40}$/.test(input.holder)
        && input.holder !== '0x' + '0'.repeat(40), 'METAMORPHO_PRIVATE_SHARE_HOLDER');
      const amount = input.amount, holder = input.holder, current = await observed(), at = current.header.number;
      const [preview, maximum, held] = await Promise.all([
        read(vault, 'previewRedeem', [amount], at), read(vault, 'maxRedeem', [holder], at),
        read(vault, 'balanceOf', [holder], at),
      ]);
      assert.ok(BigInt(amount) <= held[0], 'METAMORPHO_PRIVATE_SHARE_BACKING');
      await runtime.assertCanonical(current.header);
      assert.deepEqual(await runtime.block(), current.header, 'METAMORPHO_PRIVATE_POSITION_HEAD_CHANGED');
      return detached({ ...current, privateSharePreview: { amount, holder,
        redeemableUnderlying: preview[0].toString(), maximumShares: maximum[0].toString(), heldShares: held[0].toString() } });
}
