/** Fixed public faucet DATA only. No owner, key, runtime or permission. */
import assert from 'node:assert/strict';
export const FAUCET='0xc959483dba39aa9e78757139af0e9a2edeb3f42d',USDC='0x94a9d9ac8a22534e3faca9f4e7f2e2cf85d5e4c8',AMOUNT='2000000',GENESIS='0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9';
// Official address/ABI: aave-dao/aave-address-book AaveV3Sepolia.FAUCET;
// aave/aave-v3-periphery contracts/mocks/testnet-helpers/Faucet.sol mint.
// Code pinned read-only at finalized Sepolia block 0xb5f343, hash
// 0x69eab7c26bb15c171f130c9469318363a93eda9c826e1a452b594a929d42d635.
export const CODE_SHA256='66624cc1d26affba8e8ea3af0a208632cef7a3388a50d564e0d92d6e59f7649e',CODE_BYTES=3591,TTL=30000;

const word=v=>BigInt(v).toString(16).padStart(64,'0'),aw=v=>{assert.match(v,/^0x[0-9a-f]{40}$/);return v.slice(2).padStart(64,'0');};
/** DATA only: Root validates a retained row without issuing a permission. */
export function validateAaveSepoliaFaucetDataV8(grant,account,targetPlanSHA256){
 assert.equal(arguments.length,3);assert.ok(grant&&Object.getPrototypeOf(grant)===Object.prototype);assert.deepEqual(Reflect.ownKeys(grant).sort(),['profile','targetPlanSHA256','policySHA256','chainId','from','to','value','calldata','token','recipient','amountAtomic','faucetCodeSHA256'].sort());assert.equal(grant.profile,'ORIGINAL_AAVE_SEPOLIA_FAUCET_GRANT_V8');assert.match(grant.policySHA256,/^[0-9a-f]{64}$/);assert.equal(grant.targetPlanSHA256,targetPlanSHA256);assert.equal(grant.chainId,'11155111');assert.equal(grant.from,account);assert.equal(grant.to,FAUCET);assert.equal(grant.value,'0');assert.equal(grant.calldata,'0xc6c3bbe6'+aw(USDC)+aw(account)+word(AMOUNT));assert.equal(grant.token,USDC);assert.equal(grant.recipient,account);assert.equal(grant.amountAtomic,AMOUNT);assert.equal(grant.faucetCodeSHA256,CODE_SHA256);return grant;
}
