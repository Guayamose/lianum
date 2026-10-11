import { base58Encode, base58Decode } from './solana-base58.mjs';
export { base58Encode, base58Decode } from './solana-base58.mjs';
import { assertOwnedRecoveryScratchV1, writeOriginalSolanaEconomicKeysV1, claimStoppedNativeRecoveryV1, writePrivateRuntimeRecoveryV1, readPrivateRuntimeRecoveryV1, sealStoppedNativeFilesV1, assertStoppedNativeFilesV1, cloneRuntimeRecoveryV1 } from '../../shared/runtime/owned-runtime-recovery-files-v1.mjs';
import { consumeWrappedRuntimeRecoveryV1 } from '../../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
/** Owned flat SOL adapter, source-only derivative of the frozen golden
 * src/chains/solana-runtime.mjs SHA256
 * 0aca0f179705beaf908b9eb2b487aca1b370a6e952270dcf50e353b35c2a397a.
 * Preserves official binary/genesis/owned-loopback/socket isolation and fixed
 * 64-tick/1M-shred profile. Adds exact System+Memo K binding and guarded funds.
 * Native acceptance, independent consensus and independent operators are not
 * established by source preparation or synthetic host-boundary tests.
 */
import assert from 'node:assert/strict';
import { createHash, createPrivateKey, createPublicKey, randomBytes, randomUUID, sign } from 'node:crypto';
import { spawn } from 'node:child_process';
import { types } from 'node:util';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, realpath, mkdir, lstat, open, rename } from 'node:fs/promises';
import { join, sep, dirname } from 'node:path';
import { createServer, createConnection } from 'node:net';
import { createSocket } from 'node:dgram';
import { scratchDirectory, removeOwnScratch, stopOwnProcess, ownedRuntimeRpc, sleep, projectRoot } from '@lianum/engine/chains/shared/runtime-harness';

const PKCS8_ED25519 = Buffer.from('302e020100300506032b657004220420', 'hex');
const PUBLIC_GENESIS = new Set(['5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1', '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY']);
const READ_METHODS = new Set(['getAccountInfo', 'getMultipleAccounts', 'getFeeForMessage', 'getMinimumBalanceForRentExemption', 'isBlockhashValid', 'getGenesisHash', 'getVersion', 'getHealth', 'getClusterNodes', 'getBalance', 'getSlot', 'getBlockHeight', 'getLatestBlockhash', 'getSignatureStatuses', 'getTransaction', 'getBlock', 'getBlocks', 'minimumLedgerSlot', 'getFirstAvailableBlock']);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw new Error(code); };
const requireCondition = (condition, code) => { if (!condition) fail(code); };
const ownedSolanaRuntimes = new WeakSet(), ownedSolanaLiveness = new WeakMap(), ownedSolanaAuditStates = new WeakMap();
const originalSplContextsV1=new WeakMap(),originalSplFacadesV1=new WeakMap(),originalSplGraphsV1=new WeakMap();
export function consumeOwnedSolanaSplContextV1(token){requireCondition(arguments.length===1,'SOLANA_SPL_CONTEXT_ARITY');const value=originalSplContextsV1.get(token);requireCondition(value,'SOLANA_SPL_ORIGINAL_CONTEXT_REQUIRED');originalSplContextsV1.delete(token);value.assertLive();return value;}
export function isOwnedSolanaSplCustodyV1(runtime){requireCondition(arguments.length===1,'SOLANA_SPL_CLASSIFIER_ARITY');return originalSplFacadesV1.has(runtime);}
export function assertOwnedSolanaSplCustodyV1(runtime){requireCondition(arguments.length===1&&originalSplFacadesV1.has(runtime),'SOLANA_SPL_ORIGINAL_CUSTODY_REQUIRED');assertOwnedSolanaRuntimeLive(runtime);}
export function assertOwnedSolanaSplGraphSourceV1(runtime){requireCondition(arguments.length===1&&originalSplGraphsV1.has(runtime),'SOLANA_SPL_ORIGINAL_GRAPH_SOURCE_REQUIRED');assertOwnedSolanaRuntimeLive(runtime);}
export function assertOwnedSolanaSplGraphPairV1(spl,graph){
 requireCondition(arguments.length===2,'SOLANA_SPL_GRAPH_PAIR_ARITY');assertOwnedSolanaSplCustodyV1(spl);assertOwnedSolanaSplGraphSourceV1(graph);
 const group=originalSplFacadesV1.get(spl);requireCondition(originalSplGraphsV1.get(graph)===group&&group.spl===spl&&group.graph===graph&&spl!==graph&&spl.close===graph.close,'SOLANA_SPL_SAME_ORIGINAL_VALIDATOR');
 requireCondition(group.genesis===spl.genesis&&group.genesis===graph.genesis&&group.splAsset!==group.solAsset,'SOLANA_SPL_DISTINCT_PHYSICAL_DOMAINS');return true;
}
/** Fixed original co-owned graph, never selected by a supplied ID/genesis. */
export function readOwnedSolanaSplOriginalGraphV3(spl){
 requireCondition(arguments.length===1,'SOLANA_SPL_GRAPH_CONTEXT_ARITY');assertOwnedSolanaSplCustodyV1(spl);
 const group=originalSplFacadesV1.get(spl);assertOwnedSolanaSplGraphPairV1(spl,group.graph);return group.graph;
}
export function assertOwnedSolanaSplClaimCohortV1(runtimes){
 requireCondition(arguments.length===1&&Array.isArray(runtimes)&&runtimes.length===2,'SOLANA_SPL_FIXED_COHORT');const [spl,sol]=runtimes;assertOwnedSolanaSplCustodyV1(spl);assertOwnedSolanaRuntimeLive(sol);
 const group=originalSplFacadesV1.get(spl);requireCondition(group.spl===spl&&group.sol===sol&&group.close===spl.close&&group.close===sol.close&&spl!==sol,'SOLANA_SPL_SHARED_ORIGINAL_VALIDATOR');
 requireCondition(group.genesis===sol.genesis&&group.genesis===spl.genesis&&group.splAsset!==group.solAsset,'SOLANA_SPL_ASSET_ALIAS');
 requireCondition(new Set([...Object.values(sol.roles),...Object.values(spl.roles)].map(row=>row.endpoint)).size===6,'SOLANA_SPL_CUSTODY_ENDPOINT_ALIAS');return true;
}
export async function createOwnedCombinedSolanaSplRuntimeV1(){requireCondition(arguments.length===0,'SOLANA_SPL_FACTORY_NO_OPTIONS');const value=await createOwnedSolanaRuntimeProfile(async()=>{},SOLANA_PRIVATE_COHORT_OPTIONS,true,true,true,null,false,true);return Object.freeze({custody:value.spl,graph:value.graph});}

export function assertOwnedSolanaRuntime(runtime) {
  requireCondition(ownedSolanaRuntimes.has(runtime), 'SOLANA_OWNED_RUNTIME_CAPABILITY');
}
export function assertOwnedSolanaRuntimeLive(runtime) {
  assertOwnedSolanaRuntime(runtime); ownedSolanaLiveness.get(runtime)();
}
/** Internal state-change fence, not an observation or public projection. */
export function readOwnedSolanaRuntimeAuditState(runtime) {
  requireCondition(arguments.length === 1, 'SOLANA_AUDIT_STATE_NO_OPTIONS');
  assertOwnedSolanaRuntimeLive(runtime);
  return ownedSolanaAuditStates.get(runtime)();
}

const safeInteger = (value, code) => { requireCondition(Number.isSafeInteger(value) && !Object.is(value, -0) && value >= 0, code); return BigInt(value); };

function lamportsValue(value) {
  requireCondition(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.exec(value)?.[0] === value,
    'SOLANA_INVALID_LAMPORTS');
  const n = BigInt(value); requireCondition(n > 0n && n <= BigInt(Number.MAX_SAFE_INTEGER), 'SOLANA_INVALID_LAMPORTS'); return n;
}
function createSyntheticKey() {
  const seed = randomBytes(32), privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, seed]), type: 'pkcs8', format: 'der' });
  const publicBytes = createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).subarray(-32);
  return { seed, publicBytes, address: base58Encode(publicBytes) };
}

import { exactRecord, fixedArray, bytes32 } from '@lianum/components/encoding/commitments';
import { cloneInput, frozenInput, inputUint } from "@lianum/components/plain-input";
import { encodeSolanaBindingMessage, validateSolanaBindingTransaction, assertMemoProgramAccount,
  MEMO_PROGRAM } from '@lianum/engine/native/native-receipt-binding';
import { encodeSolanaNonceBindingMessage, validateSolanaNonceBindingTransaction,
  decodeSolanaNonceAccountData, encodeSolanaNonceBootstrapMessage,
  validateSolanaNonceBootstrapTransaction } from './owned-solana-nonce-binding.mjs';
import { ownedCustodyRoute, assertOwnedCustodyIntent, ownedCustodyFeeAudit, createOwnedCustodyReservationReadWindow,
  auditOwnedSolanaNonceInfrastructure } from '../../shared/runtime/owned-native-custody.mjs';
import { sendOwnedSolanaTransaction } from '../transfers/owned-solana-send.mjs';
import { readOwnedSolanaSocketInodes } from './owned-solana-socket-inodes.mjs';
import {assertJupiterPublicFixtureSourceReviewV1,assertJupiterPublicSwapSourceReviewV1,loadJupiterOfficialMaterialV1} from '../../../operations/deployments/defi/jupiter-official-material-v1.mjs';
import {jupiterPublicBankGenesisV1,validateJupiterPublicBankAccountsV1,jupiterExplicitTokenProgramV1,JUPITER_TOKEN_PROGRAMDATA_V1,JUPITER_BANK_RENT_V1,JUPITER_BANK_CLOCK_V1} from './jupiter-orca-bank-state-v1.mjs';
import {JUPITER_ORCA_V1,quoteJupiterOrcaSolUsdcV1,encodeJupiterOrcaFixtureMessageV1,validateJupiterOrcaFixtureTransactionV1,decodeJupiterSplTokenAccountV1} from '../dispatch/jupiter-orca-route-codec-v1.mjs';
import {validateJupiterOrcaSwapObservationV1} from '../observations/jupiter-orca-swap-observation-v1.mjs';
import {loadOwnedNativeSplProducedProgramV1} from '../../../operations/deployments/defi/native-spl-produced-program-v1.mjs';
import {deriveNativeSplConfigurationV1,nativeSplAssetCommitmentV1} from '../dispatch/native-spl-custody-codec-v1.mjs';
import {deriveOwnedNativeCurrencyAsset} from '../../../operations/deployments/claims/native-claim-deployment-plan.mjs';
export const SOLANA_CUSTODY_PROFILE = 'OWNED_FLAT_SOLANA_CUSTODY_V1';
// Candidate protocol identity only; not proof-profile activation or send authority.
export const SOLANA_NONCE_INGRESS_PROFILE = 'LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3';
// Host-hook semantics only: every fixed payout checks its retained completed
// authorization after the durable first-send latch, without new send authority.
export const SOLANA_PAYOUT_FINAL_SEND_PROFILE = 'OWNED_SOLANA_PAYOUT_AUTHORITY_LIFETIME_V2';
export const SOLANA_CUSTODY_SYNTHETIC_SURPLUS = '10000000';
export const SOLANA_NONCE_BOOTSTRAP_GRANT = '10000000';
export const SOLANA_GRAPH_SYNTHETIC_LIQUIDITY = '10000000000';
export const SOLANA_GRAPH_RECIPIENT_GRANT = '2000000';

/** A zero genesis fee is an initialization state, never permission to sign.
 * All other malformed or underfunded preparations fail immediately. */
export function solanaNonceBootstrapFundingReady(rentLamports, feeLamports, payerLamports) {
  const rent = safeInteger(rentLamports, 'SOLANA_INVALID_RENT_MINIMUM');
  const fee = safeInteger(feeLamports, 'SOLANA_INVALID_FEE');
  requireCondition(payerLamports === SOLANA_NONCE_BOOTSTRAP_GRANT, 'SOLANA_NONCE_BOOTSTRAP_GRANT');
  requireCondition(rent > 0n && rent + fee < BigInt(SOLANA_NONCE_BOOTSTRAP_GRANT),
    'SOLANA_NONCE_BOOTSTRAP_FUNDS');
  return fee > 0n;
}

const ZERO = '0'.repeat(64);
const SYSTEM_PROGRAM = '11111111111111111111111111111111';
const same = (left, right, code) => assert.deepEqual(left, right, code);
const contextSlot = response => safeInteger(response?.context?.slot, 'SOLANA_INVALID_RPC_CONTEXT');
function accountBytes(value) {
  requireCondition(Array.isArray(value) && value.length === 2 && value[1] === 'base64'
    && typeof value[0] === 'string' && value[0].length <= 1_000_000, 'SOLANA_ACCOUNT_DATA');
  const bytes = Buffer.from(value[0], 'base64');
  requireCondition(bytes.toString('base64') === value[0], 'SOLANA_ACCOUNT_DATA'); return bytes;
}
function systemAccount(raw, publicKey, source) {
  bytes32(publicKey, true);
  if (raw === null) {
    requireCondition(!source, 'SOLANA_SOURCE_ACCOUNT_MISSING');
    // Explicit creation placeholder from an actual null RPC result. It is never
    // presented as a fetched existing account or silently funded in genesis.
    return { publicKey, exists: false, owner: ZERO, executable: false, lamports: '0' };
  }
  requireCondition(raw && raw.owner === SYSTEM_PROGRAM && raw.executable === false, 'SOLANA_SYSTEM_ACCOUNT_REQUIRED');
  requireCondition(accountBytes(raw.data).length === 0, 'SOLANA_NONEMPTY_SYSTEM_ACCOUNT');
  return { publicKey, exists: true, owner: ZERO, executable: false,
    lamports: safeInteger(raw.lamports, 'SOLANA_UNSAFE_BALANCE').toString() };
}
function memoAccount(raw) {
  requireCondition(raw !== null && typeof raw === 'object', 'SOLANA_MEMO_ACCOUNT_MISSING');
  accountBytes(raw.data);
  const result = { address: MEMO_PROGRAM.address, owner: raw.owner, executable: raw.executable, dataBase64: raw.data[0] };
  assertMemoProgramAccount(result); return result;
}
function projectRPCAccounts(response, count = 3) {
  exactRecord(response, ['context', 'value']); fixedArray(response.value, count);
  // rentEpoch can be JSON's rounded representation of u64::MAX for an ordinary
  // rent-exempt account. It is not a consumed fact. Ignore it without relaxing
  // numeric safety for lamports, fee, slot, height or any other consumed value.
  const value = response.value.map(account => {
    if (account === null) return null;
    requireCondition(account && typeof account === 'object' && !types.isProxy(account)
      && Object.getPrototypeOf(account) === Object.prototype, 'SOLANA_RPC_ACCOUNT_RECORD');
    exactRecord(account, Reflect.ownKeys(account));
    for (const name of ['owner', 'executable', 'lamports', 'data'])
      requireCondition(Object.hasOwn(account, name), 'SOLANA_RPC_ACCOUNT_FIELDS');
    return Object.fromEntries(['owner', 'executable', 'lamports', 'data'].map(name => [name, account[name]]));
  });
  return { context: response.context, value };
}

/** Pure conformance helper for read-only owned-RPC observations. Passing this
 * helper alone proves neither RPC provenance, funds ownership nor permission.
 * Every contextual response must describe the same confirmed bank slot.
 */
function checkedPreparedState(raw, retained = null) {
  exactRecord(raw, ['genesis', 'expectedGenesis', 'intent', 'recent', 'accounts', 'fee',
    'blockHeight', 'blockhashValidity', 'repeatedRecent', 'rentExemptMinimum']);
  const value = cloneInput({ ...raw, accounts: projectRPCAccounts(raw.accounts) });
  base58Decode(value.expectedGenesis, 32);
  requireCondition(value.genesis === value.expectedGenesis && !PUBLIC_GENESIS.has(value.genesis), 'SOLANA_WRONG_GENESIS');
  const intent = value.intent, message = encodeSolanaBindingMessage(intent), slot = contextSlot(value.recent);
  for (const response of [value.accounts, value.fee, value.blockhashValidity, value.repeatedRecent])
    requireCondition(contextSlot(response) === slot, 'SOLANA_PREPARATION_CONTEXT_CHANGED');
  same(value.recent.value, value.repeatedRecent.value, 'SOLANA_PREPARATION_CONTEXT_CHANGED');
  const latestBlockhash = base58Decode(value.recent.value.blockhash, 32).toString('hex');
  const height = safeInteger(value.blockHeight, 'SOLANA_INVALID_BLOCK_HEIGHT');
  const latestLast = safeInteger(value.recent.value.lastValidBlockHeight, 'SOLANA_INVALID_BLOCK_HEIGHT');
  let last = latestLast;
  if (retained === null) requireCondition(latestBlockhash === intent.recentBlockhash, 'SOLANA_PREPARED_BLOCKHASH');
  else {
    exactRecord(retained, ['prepared', 'context']);
    exactRecord(retained.context, ['slot', 'height', 'rentExemptMinimum']);
    exactRecord(retained.prepared, ['genesis', 'intent', 'unsignedWire', 'funds']);
    same(intent, retained.prepared.intent, 'SOLANA_RETAINED_INTENT_CHANGED');
    requireCondition(message === retained.prepared.unsignedWire, 'SOLANA_RETAINED_WIRE_CHANGED');
    requireCondition(base58Decode(value.genesis, 32).toString('hex') === retained.prepared.genesis, 'SOLANA_WRONG_GENESIS');
    // The original wire may use an older, still-valid blockhash. Never replace
    // it with the newly latest hash or extend its captured expiry.
    last = inputUint(retained.prepared.funds.lastValidBlockHeight);
    requireCondition(slot >= inputUint(retained.context.slot)
      && height >= inputUint(retained.context.height)
      && height >= inputUint(retained.prepared.funds.nativeHead.height), 'SOLANA_PREPARED_CONTEXT_ROLLBACK');
  }
  requireCondition(height < latestLast, 'SOLANA_CURRENT_BLOCKHASH_EXPIRED');
  requireCondition(height < last && value.blockhashValidity.value === true, 'SOLANA_BLOCKHASH_EXPIRED');
  requireCondition(Array.isArray(value.accounts.value) && value.accounts.value.length === 3, 'SOLANA_ACCOUNT_READ_SHAPE');
  const source = systemAccount(value.accounts.value[0], intent.sourcePublicKey, true);
  const recipient = systemAccount(value.accounts.value[1], intent.recipientPublicKey, false);
  const memoProgram = memoAccount(value.accounts.value[2]);
  const amount = lamportsValue(intent.lamports), fee = safeInteger(value.fee.value, 'SOLANA_INVALID_FEE');
  requireCondition(fee > 0n && BigInt(source.lamports) >= amount + fee, 'SOLANA_INSUFFICIENT_OWNED_FUNDS');
  const rent = safeInteger(value.rentExemptMinimum, 'SOLANA_INVALID_RENT_MINIMUM');
  requireCondition(rent > 0n && BigInt(recipient.lamports) + amount >= rent, 'SOLANA_RECIPIENT_RENT_MINIMUM');
  const remainder = BigInt(source.lamports) - amount - fee;
  requireCondition(remainder === 0n || remainder >= rent, 'SOLANA_SOURCE_RENT_MINIMUM');
  if (retained !== null) {
    for (const [field, current] of [['sourceAccount', source], ['recipientAccount', recipient],
      ['feeLamports', fee.toString()], ['memoProgram', memoProgram]])
      same(current, retained.prepared.funds[field], 'SOLANA_PREPARED_FUNDS_CHANGED');
    requireCondition(rent === inputUint(retained.context.rentExemptMinimum), 'SOLANA_PREPARED_RENT_CHANGED');
  }
  const prepared = frozenInput({ genesis: base58Decode(value.genesis, 32).toString('hex'), intent, unsignedWire: message,
    funds: { nativeHead: { id: intent.recentBlockhash, height: height.toString() }, sourceAccount: source,
      recipientAccount: recipient, feeLamports: fee.toString(), lastValidBlockHeight: last.toString(), memoProgram } });
  return { prepared, context: frozenInput({ slot: slot.toString(), height: height.toString(), rentExemptMinimum: rent.toString() }) };
}
export function validateSolanaPreparedState(raw) {
  return checkedPreparedState(raw).prepared;
}
/** Retains the original unsigned message and expiry while authenticating its
 * account/fee/Memo facts in a coherent CURRENT bank. Context is private runtime
 * bookkeeping from the last successful preparation/recheck, not gate input.
 */
export function revalidateSolanaPreparedState(raw) {
  exactRecord(raw, ['prepared', 'context', 'observations']);
  const retained = cloneInput({ prepared: raw.prepared, context: raw.context });
  return checkedPreparedState(raw.observations, retained).context;
}

function nonceAccount(raw, publicKey, authorityPublicKey, minimum) {
  requireCondition(raw !== null && raw.owner === SYSTEM_PROGRAM && raw.executable === false,
    'SOLANA_NONCE_SYSTEM_ACCOUNT_REQUIRED');
  const decoded = decodeSolanaNonceAccountData(accountBytes(raw.data).toString('hex'));
  requireCondition(decoded.authorityPublicKey === authorityPublicKey, 'SOLANA_NONCE_AUTHORITY_CHANGED');
  const lamports = safeInteger(raw.lamports, 'SOLANA_UNSAFE_BALANCE');
  requireCondition(lamports >= minimum && minimum > 0n, 'SOLANA_NONCE_RENT_MINIMUM');
  return { publicKey, owner: ZERO, executable: false, lamports: lamports.toString(), ...decoded };
}
function checkedNoncePreparedState(raw, retained = null) {
  exactRecord(raw, ['genesis', 'expectedGenesis', 'intent', 'recent', 'accounts', 'fee',
    'blockHeight', 'repeatedRecent', 'rentExemptMinimum', 'nonceRentExemptMinimum']);
  const value = cloneInput({ ...raw, accounts: projectRPCAccounts(raw.accounts, 4) });
  base58Decode(value.expectedGenesis, 32);
  requireCondition(value.genesis === value.expectedGenesis && !PUBLIC_GENESIS.has(value.genesis), 'SOLANA_WRONG_GENESIS');
  const intent = value.intent, message = encodeSolanaNonceBindingMessage(intent), slot = contextSlot(value.recent);
  for (const response of [value.accounts, value.fee, value.repeatedRecent])
    requireCondition(contextSlot(response) === slot, 'SOLANA_PREPARATION_CONTEXT_CHANGED');
  same(value.recent.value, value.repeatedRecent.value, 'SOLANA_PREPARATION_CONTEXT_CHANGED');
  const currentHash = base58Decode(value.recent.value.blockhash, 32);
  // Agave refuses using a nonce again in the bank that created its value.
  requireCondition(digest(Buffer.concat([Buffer.from('DURABLE_NONCE'), currentHash])) !== intent.durableNonce,
    'SOLANA_NONCE_NOT_YET_ADVANCEABLE');
  const height = safeInteger(value.blockHeight, 'SOLANA_INVALID_BLOCK_HEIGHT');
  const rent = safeInteger(value.rentExemptMinimum, 'SOLANA_INVALID_RENT_MINIMUM');
  const nonceRent = safeInteger(value.nonceRentExemptMinimum, 'SOLANA_INVALID_RENT_MINIMUM');
  const source = systemAccount(value.accounts.value[0], intent.sourcePublicKey, true);
  const recipient = systemAccount(value.accounts.value[1], intent.recipientPublicKey, false);
  const memoProgram = memoAccount(value.accounts.value[2]);
  const nonce = nonceAccount(value.accounts.value[3], intent.nonceAccountPublicKey, intent.sourcePublicKey, nonceRent);
  requireCondition(nonce.durableNonce === intent.durableNonce, 'SOLANA_NONCE_VALUE_CHANGED');
  const amount = lamportsValue(intent.lamports), fee = safeInteger(value.fee.value, 'SOLANA_INVALID_FEE');
  requireCondition(fee > 0n && BigInt(source.lamports) >= amount + fee, 'SOLANA_INSUFFICIENT_OWNED_FUNDS');
  requireCondition(rent > 0n && BigInt(recipient.lamports) + amount >= rent, 'SOLANA_RECIPIENT_RENT_MINIMUM');
  const remainder = BigInt(source.lamports) - amount - fee;
  requireCondition(remainder === 0n || remainder >= rent, 'SOLANA_SOURCE_RENT_MINIMUM');
  const prepared = frozenInput({ genesis: base58Decode(value.genesis, 32).toString('hex'), intent, unsignedWire: message,
    funds: { nativeHead: { id: currentHash.toString('hex'), height: height.toString() }, sourceAccount: source,
      recipientAccount: recipient, feeLamports: fee.toString(), memoProgram, nonceAccount: nonce,
      nonceRentExemptMinimum: nonceRent.toString() } });
  const context = frozenInput({ slot: slot.toString(), height: height.toString(), rentExemptMinimum: rent.toString(),
    nonceRentExemptMinimum: nonceRent.toString() });
  if (retained !== null) {
    exactRecord(retained, ['prepared', 'context']);
    exactRecord(retained.prepared, ['genesis', 'intent', 'unsignedWire', 'funds']);
    exactRecord(retained.context, ['slot', 'height', 'rentExemptMinimum', 'nonceRentExemptMinimum']);
    same(intent, retained.prepared.intent, 'SOLANA_RETAINED_INTENT_CHANGED');
    requireCondition(message === retained.prepared.unsignedWire && prepared.genesis === retained.prepared.genesis,
      'SOLANA_RETAINED_WIRE_CHANGED');
    requireCondition(slot >= inputUint(retained.context.slot) && height >= inputUint(retained.context.height),
      'SOLANA_PREPARED_CONTEXT_ROLLBACK');
    for (const field of ['sourceAccount', 'recipientAccount', 'feeLamports', 'memoProgram', 'nonceAccount', 'nonceRentExemptMinimum'])
      same(prepared.funds[field], retained.prepared.funds[field], 'SOLANA_PREPARED_FUNDS_CHANGED');
    requireCondition(rent.toString() === retained.context.rentExemptMinimum
      && nonceRent.toString() === retained.context.nonceRentExemptMinimum, 'SOLANA_PREPARED_RENT_CHANGED');
  }
  return { prepared, context };
}
export function validateSolanaNoncePreparedState(raw) { return checkedNoncePreparedState(raw).prepared; }
export function revalidateSolanaNoncePreparedState(raw) {
  exactRecord(raw, ['prepared', 'context', 'observations']);
  return checkedNoncePreparedState(raw.observations, cloneInput({ prepared: raw.prepared, context: raw.context })).context;
}

/** Pure first-send state check. It grants no runtime or broadcast capability. */
export function assertSolanaNonceFirstSendState(raw) {
  const value = cloneInput(raw);
  exactRecord(value, ['route', 'phase', 'broadcastAttempts', 'signingUnresolved', 'nativeId',
    'transactionSHA256', 'nativeWire', 'intent', 'unsignedWire']);
  requireCondition(['deposit', 'refund', 'redeem'].includes(value.route), 'SOLANA_NONCE_CUSTODY_ROUTE_REQUIRED');
  requireCondition(value.phase === 'SIGNED_NOT_BROADCAST' && value.broadcastAttempts === 0,
    'SOLANA_NONCE_FIRST_SEND_ONLY');
  requireCondition(value.signingUnresolved === false, 'SOLANA_PRIOR_SIGNING_UNRESOLVED');
  const decoded = validateSolanaNonceBindingTransaction(value.nativeWire, value.intent);
  requireCondition(decoded.signatureHex === value.nativeId && decoded.transactionSHA256 === value.transactionSHA256,
    'SOLANA_RETAINED_WIRE_IDENTITY');
  requireCondition(encodeSolanaNonceBindingMessage(value.intent) === value.unsignedWire, 'SOLANA_RETAINED_WIRE_CHANGED');
}

/** Fresh finalized same-signature observation of the exact 321-byte wire.
 * Four-account balance deltas account for the System and Memo program keys.
 * This trusts the owned local RPC; it is not a public-chain consensus proof.
 */
export function validateSolanaBindingObservation(raw) {
  return checkedSolanaObservation(raw, 'v1');
}
export function validateSolanaNonceBindingObservation(raw) { return checkedSolanaObservation(raw, 'nonce'); }
export function validateSolanaNonceFailureObservation(raw) { return checkedSolanaObservation(raw, 'nonce-failure'); }
export function validateSolanaNonceBootstrapObservation(raw) { return checkedSolanaObservation(raw, 'bootstrap'); }
function checkedSolanaObservation(raw, profile) {
  const nonce = profile === 'nonce' || profile === 'nonce-failure', failed = profile === 'nonce-failure';
  const value = cloneInput(raw);
  exactRecord(value, ['expected', 'genesis', 'status', 'transaction', 'currentSlot', 'block',
    'statusAgain', 'transactionAgain', 'blockAgain', 'currentSlotAgain']);
  const expected = value.expected;
  exactRecord(expected, ['genesis', 'intent', 'nativeWire', 'nativeId', 'transactionSHA256']);
  base58Decode(value.genesis, 32);
  requireCondition(value.genesis === expected.genesis && !PUBLIC_GENESIS.has(value.genesis), 'SOLANA_WRONG_GENESIS');
  const decoded = (nonce ? validateSolanaNonceBindingTransaction : profile === 'bootstrap'
    ? validateSolanaNonceBootstrapTransaction : validateSolanaBindingTransaction)(expected.nativeWire, expected.intent);
  requireCondition(decoded.signatureHex === expected.nativeId && decoded.transactionSHA256 === expected.transactionSHA256,
    'SOLANA_RETAINED_WIRE_IDENTITY');
  const signature = base58Encode(Buffer.from(expected.nativeId, 'hex'));
  for (const status of [value.status, value.statusAgain]) {
    requireCondition(status && (failed ? status.err !== null && status.err !== undefined : status.err === null),
      'SOLANA_STATUS_MISSING_OR_FAILED');
    requireCondition(status.confirmationStatus === 'finalized' && status.confirmations === null, 'SOLANA_NOT_FINALIZED');
  }
  if (failed) {
    requireCondition(value.transaction?.meta?.err !== null && value.transaction?.meta?.err !== undefined,
      'SOLANA_EXPECTED_EXECUTION_FAILURE');
    same(value.status.err, value.statusAgain.err, 'SOLANA_OBSERVATION_CHANGED');
    same(value.status.err, value.transaction.meta.err, 'SOLANA_OBSERVATION_CHANGED');
  } else requireCondition(value.transaction?.meta?.err === null && value.transactionAgain?.meta?.err === null, 'SOLANA_TRANSACTION_FAILED');
  for (const transaction of [value.transaction, value.transactionAgain]) {
    requireCondition(Array.isArray(transaction.transaction) && transaction.transaction.length === 2
      && transaction.transaction[1] === 'base64' && transaction.transaction[0] === expected.nativeWire, 'SOLANA_OBSERVED_WIRE_CHANGED');
  }
  same(value.transaction, value.transactionAgain, 'SOLANA_OBSERVATION_CHANGED');
  same(value.block, value.blockAgain, 'SOLANA_OBSERVATION_CHANGED');
  const slot = safeInteger(value.transaction.slot, 'SOLANA_INVALID_SLOT');
  requireCondition(slot > 0n && safeInteger(value.status.slot, 'SOLANA_INVALID_STATUS_SLOT') === slot
    && safeInteger(value.statusAgain.slot, 'SOLANA_INVALID_STATUS_SLOT') === slot, 'SOLANA_SLOT_MISMATCH');
  const firstSlot = safeInteger(value.currentSlot, 'SOLANA_INVALID_CURRENT_SLOT');
  const observedSlot = safeInteger(value.currentSlotAgain, 'SOLANA_INVALID_CURRENT_SLOT');
  requireCondition(firstSlot >= slot && observedSlot >= firstSlot, 'SOLANA_OBSERVED_SLOT_ROLLBACK');
  const block = value.block;
  requireCondition(block && Array.isArray(block.signatures) && block.signatures.filter(item => item === signature).length === 1,
    'SOLANA_BLOCK_MEMBERSHIP_MISSING');
  base58Decode(block.blockhash, 32); base58Decode(block.previousBlockhash, 32);
  const parent = safeInteger(block.parentSlot, 'SOLANA_INVALID_PARENT_SLOT'), height = safeInteger(block.blockHeight, 'SOLANA_INVALID_BLOCK_HEIGHT');
  requireCondition(parent < slot && height > 0n, 'SOLANA_BLOCK_CONTEXT');
  const meta = value.transaction.meta;
  requireCondition(Array.isArray(meta.preBalances) && Array.isArray(meta.postBalances)
    && meta.preBalances.length === (nonce ? 6 : profile === 'bootstrap' ? 5 : 4)
    && meta.postBalances.length === meta.preBalances.length, 'SOLANA_INVALID_BALANCES');
  const before = meta.preBalances.map(item => safeInteger(item, 'SOLANA_UNSAFE_BALANCE'));
  const after = meta.postBalances.map(item => safeInteger(item, 'SOLANA_UNSAFE_BALANCE'));
  const amount = failed ? 0n : lamportsValue(profile === 'bootstrap' ? expected.intent.rentLamports : expected.intent.lamports);
  const fee = safeInteger(meta.fee, 'SOLANA_INVALID_FEE');
  requireCondition(fee > 0n && after[1] - before[1] === amount && before[0] - after[0] === amount + fee
    && before.slice(2).every((balance, i) => balance === after[i + 2]), 'SOLANA_BALANCE_DELTA_MISMATCH');
  if (profile === 'bootstrap') requireCondition(before[1] === 0n && before[0] === BigInt(SOLANA_NONCE_BOOTSTRAP_GRANT),
    'SOLANA_NONCE_BOOTSTRAP_ORIGINAL_FUNDING');
  requireCondition(!meta.innerInstructions || meta.innerInstructions.length === 0, 'SOLANA_UNEXPECTED_INNER_INSTRUCTIONS');
  for (const name of ['preTokenBalances', 'postTokenBalances'])
    requireCondition(!meta[name] || meta[name].length === 0, 'SOLANA_UNEXPECTED_TOKEN_BALANCES');
  if (meta.loadedAddresses) requireCondition(meta.loadedAddresses.writable?.length === 0
    && meta.loadedAddresses.readonly?.length === 0, 'SOLANA_UNEXPECTED_LOADED_ADDRESSES');
  return frozenInput({ nativeId: expected.nativeId, nativeWire: expected.nativeWire, intent: expected.intent,
    transactionSHA256: expected.transactionSHA256, genesis: base58Decode(value.genesis, 32).toString('hex'),
    signature, blockId: base58Decode(block.blockhash, 32).toString('hex'), blockHeight: height.toString(),
    transactionSlot: slot.toString(), parentSlot: parent.toString(), observedSlot: observedSlot.toString(),
    feeLamports: fee.toString(), sourceBefore: before[0].toString(), sourceAfter: after[0].toString(),
    recipientBefore: before[1].toString(), recipientAfter: after[1].toString(),
    ...(failed ? { executionFailed: true, transferredLamports: '0' } : {}),
    assurance: 'TRUSTED_OWNED_LOCAL_RPC_NOT_PUBLIC_CONSENSUS' });
}

// Populated only after the separately reviewed source build completes and its
// exact artifact digest is verified. Never fall back to unsafe stock startup.
export const solanaLoopbackCompatibilityPin = Object.freeze(['agave-v2.3.13-loopback/solana-test-validator', 'bc082911d81efe39ffedde30d221789efc950b99617168e35305a2229ba77320']);
// Separate source-derived local profile. This changes only aggregate RocksDB
// memtable flushing, not ledger retention or a host/process memory limit.
export const solanaBoundedLedgerCompatibilityPin = Object.freeze(['agave-v2.3.13-loopback-memtable128m/solana-test-validator', '7d6d38cfe120c74b486104955029aa6ae4ff1de8167a602125cafeff166f2ca0']);
// Fresh-path rebuild of the exact same reviewed seven-file source derivative.
// Keep the original artifact identity above. Source/tool/build evidence is in
// native-runtime-restore-20261003.json; actual node acceptance remains separate.
export const solanaRebuiltBoundedLedgerCompatibilityPin = Object.freeze(['agave-v2.3.13-loopback-memtable128m-rebuilt-20261003/solana-test-validator', 'a5da595fa47557c6952aa786b279219edd99e15247c87f0bf5fe9b93d1e02596']);
// Fresh source-reviewed rebuild after runtime loss. The separate recovery
// archive preserves the candidate binary and complete build provenance.
// Native acceptance is recorded separately; never select a caller-supplied pin.
export const solanaCandidateBoundedLedgerCompatibilityPin = Object.freeze(['agave-v2.3.13-loopback-memtable128m-candidate-20261005/solana-test-validator', 'a159dd521869c60e317b0db6d4f5ac7b24cfbb400308e6349a0fd63586d58517']);
export const SOLANA_BOUNDED_LEDGER_PROFILE = 'PC23_BOUNDED_LEDGER_V1';
export const SOLANA_PRIVATE_COHORT_PROFILE = 'PC24_TWO_OWNER_COHORT_V1';
export const SOLANA_PRIVATE_COHORT_OPTIONS = Object.freeze({ ledgerRetentionShreds: 1_000_000, ticksPerSlot: 64, resourceProfile: SOLANA_BOUNDED_LEDGER_PROFILE });

export const solanaRuntimePins = Object.freeze({
  validator: ['agave-v2.3.13/solana-release/bin/agave-validator', '5024f1b59afed531d4de067159084bf6ec7f20ab4b5424a61f8da3a23a4646dd'],
  genesis: ['agave-v2.3.13/solana-release/bin/solana-genesis', '19bb6f182cc67d7238457a358a95ba4c075fcc28ec0363397e13711d6e3b93cb'],
  cli: ['agave-v2.3.13/solana-release/bin/solana', 'ad7ae4b1dcb5cc1bb3395e0fd578d0827fd506451f3497a275de5413a6f3ccd5'],
  pohLibrary: ['agave-v2.3.13/solana-release/bin/perf-libs/libpoh-simd.so', 'e43a4b70fa85f49463fc872fd6a735317f3468010d1e656e68f4801e7998e9f9'],
});
async function pinnedSolanaBinary([relative, expectedHash]) {
  requireCondition(process.platform === 'linux' && process.arch === 'x64', 'SOLANA_PINNED_RUNTIME_REQUIRES_LINUX_X64');
  const root = await realpath(join(projectRoot, '.local/linux-runtimes')), path = await realpath(join(root, relative));
  requireCondition(path.startsWith(root + sep), 'SOLANA_RUNTIME_PATH_ESCAPE');
  const hash = createHash('sha256'); for await (const chunk of createReadStream(path)) hash.update(chunk);
  requireCondition(hash.digest('hex') === expectedHash, 'SOLANA_PINNED_EXECUTABLE_HASH_MISMATCH'); return path;
}
export function validateOwnedSocketRows(rows, requiredTcpPorts = []) {
  requireCondition(Array.isArray(rows) && rows.length > 0, 'SOLANA_NO_OWNED_SOCKET_EVIDENCE');
  for (const row of rows) {
    requireCondition(['ipv4', 'ipv6'].includes(row.family) && ['tcp', 'udp'].includes(row.protocol) && Number.isSafeInteger(row.localPort) && row.localPort > 0 && row.localPort <= 65535 && Number.isSafeInteger(row.remotePort) && row.remotePort >= 0 && row.remotePort <= 65535, 'SOLANA_INVALID_OWNED_SOCKET_ROW');
    const localLoopback = row.family === 'ipv4' ? row.localAddress === '0100007F' : row.localAddress === '00000000000000000000000001000000';
    const zero = row.family === 'ipv4' ? '00000000' : '0'.repeat(32);
    const remoteLoopback = row.remoteAddress === zero || row.remoteAddress === row.localAddress;
    if (!(localLoopback && remoteLoopback)) { const error = new Error('SOLANA_NON_LOOPBACK_OWNED_SOCKET'); error.ownedSockets = rows; error.offendingSocket = row; throw error; }
  }
  for (const port of requiredTcpPorts) requireCondition(rows.some(row => row.protocol === 'tcp' && row.localPort === port && row.state === '0A'), 'SOLANA_MISSING_OWNED_LOOPBACK_LISTENER');
  return rows;
}
async function inspectOwnedLoopbackSockets(pid, requiredTcpPorts) {
  requireCondition(process.platform === 'linux' && Number.isSafeInteger(pid) && pid > 0, 'SOLANA_INVALID_OWNED_PID');
  const inodes = await readOwnedSolanaSocketInodes(`/proc/${pid}/fd`);
  const rows = [];
  for (const [table, family, protocol] of [['tcp', 'ipv4', 'tcp'], ['tcp6', 'ipv6', 'tcp'], ['udp', 'ipv4', 'udp'], ['udp6', 'ipv6', 'udp']]) {
    const text = await readFile(`/proc/${pid}/net/${table}`, 'utf8');
    for (const line of text.trim().split('\n').slice(1)) {
      const fields = line.trim().split(/\s+/); if (!inodes.has(fields[9])) continue;
      const [localAddress, localPort] = fields[1].split(':'), [remoteAddress, remotePort] = fields[2].split(':');
      rows.push({ family, protocol, localAddress, localPort: parseInt(localPort, 16), remoteAddress, remotePort: parseInt(remotePort, 16), state: fields[3] });
    }
  }
  return validateOwnedSocketRows(rows, requiredTcpPorts);
}

// Reserve TCP+UDP across the whole candidate range before spawning. Releasing
// immediately before child startup still leaves the ordinary bind race; genesis
// and child-liveness checks fail closed if another process wins that race.
async function reserveOwnLoopbackPorts() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const base = 22000 + (randomBytes(2).readUInt16BE() % 180) * 100, release = [];
    try {
      for (let port = base; port < base + 100; port++) {
        const tcp = createServer(); tcp.unref();
        await new Promise((resolve, reject) => { tcp.once('error', reject); tcp.listen(port, '127.0.0.1', resolve); });
        release.push(() => new Promise(resolve => tcp.close(resolve)));
        const udp = createSocket('udp4'); udp.unref();
        try { await new Promise((resolve, reject) => { udp.once('error', reject); udp.bind(port, '127.0.0.1', resolve); }); }
        catch (error) { udp.close(); throw error; }
        release.push(() => new Promise(resolve => udp.close(resolve)));
      }
      return { rpcPort: base, gossipPort: base + 2, faucetPort: base + 3, dynamicBase: base + 4, dynamicEnd: base + 99, release: async () => { await Promise.all(release.map(fn => fn())); } };
    } catch (error) {
      await Promise.all(release.map(fn => fn()));
      if (error.code !== 'EADDRINUSE') throw error;
    }
  }
  fail('SOLANA_NO_UNUSED_LOOPBACK_PORT_RANGE');
}
const envFor = cwd => ({ HOME: cwd, XDG_CONFIG_HOME: join(cwd, 'config'), XDG_DATA_HOME: join(cwd, 'data'), TMPDIR: cwd, TMP: cwd, TEMP: cwd, RUST_LOG: 'info', RAYON_NUM_THREADS: '2', SOLANA_RAYON_THREADS: '2', LANG: 'C' });

export function solanaLedgerRetentionArguments(options = {}) {
  requireCondition(options && Object.getPrototypeOf(options) === Object.prototype && Object.keys(options).every(k => ['ledgerRetentionShreds', 'ticksPerSlot', 'resourceProfile'].includes(k)), 'SOLANA_INVALID_RETENTION_OPTIONS');
  if (Object.hasOwn(options, 'resourceProfile')) requireCondition(options.resourceProfile === SOLANA_BOUNDED_LEDGER_PROFILE, 'SOLANA_INVALID_RESOURCE_PROFILE');
  if (Object.hasOwn(options, 'ticksPerSlot')) requireCondition([16, 64].includes(options.ticksPerSlot), 'SOLANA_INVALID_SLOT_TIMING');
  if (!Object.hasOwn(options, 'ledgerRetentionShreds')) return [];
  requireCondition(Number.isSafeInteger(options.ledgerRetentionShreds) && options.ledgerRetentionShreds >= 10_000 && options.ledgerRetentionShreds <= 1_000_000, 'SOLANA_INVALID_LEDGER_RETENTION');
  return ['--limit-ledger-size', String(options.ledgerRetentionShreds)];
}
/** Fixed fresh local profile only: no key, endpoint, executable, data path,
 * retention or slot timing override. Actual native execution is separate from
 * the source/host tests accompanying this module. */
export async function createOwnedSolanaCohortRuntime(progress = async () => {}) {
  requireCondition(arguments.length <= 1 && typeof progress === 'function', 'SOLANA_COHORT_FIXED_CONSTRUCTOR');
  return createOwnedSolanaRuntimeProfile(progress, SOLANA_PRIVATE_COHORT_OPTIONS, true);
}
export const createOwnedSolanaRuntime = createOwnedSolanaCohortRuntime;
export async function createOwnedSolanaCustodyRuntime(progress = async () => {}) {
  requireCondition(arguments.length <= 1 && typeof progress === 'function', 'SOLANA_CUSTODY_FIXED_CONSTRUCTOR');
  return createOwnedSolanaRuntimeProfile(progress, SOLANA_PRIVATE_COHORT_OPTIONS, true, true);
}
/** One owned node, distinct custody and graph capabilities. The graph grant is
 * synthetic fixture liquidity, never custody backing or custody fee reserve. */
export async function createOwnedCombinedSolanaRuntime(progress = async () => {}) {
  requireCondition(arguments.length <= 1 && typeof progress === 'function', 'SOLANA_COMBINED_FIXED_CONSTRUCTOR');
  return createOwnedSolanaRuntimeProfile(progress, SOLANA_PRIVATE_COHORT_OPTIONS, true, true, true);
}
/** Fixed original CI51 ingress. The selection precedes the native birth;
 * deposits use the existing recent-blockhash wire and all payout routes keep
 * the original nonce authority. No caller can convert an existing runtime. */
export async function createOwnedCombinedSolanaRecentBlockhashClaimRuntimeV1() {
  requireCondition(arguments.length === 0, 'SOLANA_ORIGINAL_CLAIM_FIXED_CONSTRUCTOR');
  return createOwnedSolanaRuntimeProfile(async()=>{}, SOLANA_PRIVATE_COHORT_OPTIONS, true, true, true, null, false, false, true);
}
const ownedJupiterPublicBanksV1=new WeakSet();
export function assertOwnedJupiterPublicBankV1(bank){requireCondition(arguments.length===1&&ownedJupiterPublicBanksV1.has(bank),'ORIGINAL_JUPITER_PUBLIC_BANK_REQUIRED');}
/** Source-reviewed fixed public bank. It does not expose native claim adapters. */
export async function createOwnedJupiterPublicBankV1(){
 requireCondition(arguments.length===0,'JUPITER_BANK_NO_OPTIONS');assertJupiterPublicFixtureSourceReviewV1();
 return createOwnedSolanaRuntimeProfile(async()=>{},SOLANA_PRIVATE_COHORT_OPTIONS,false,false,false,null,true);
}
const fixedOwnedSolanaSend = sendOwnedSolanaTransaction;
const originalSolanaRecoveryCapturesV1=new WeakMap(),originalSolanaRetentionArmsV1=new WeakMap();
export async function armOwnedSolanaRecoveryRetentionV1(runtime){requireCondition(arguments.length===1,'SOLANA_RETENTION_ARITY');assertOwnedSolanaRuntime(runtime);const arm=originalSolanaRetentionArmsV1.get(runtime);requireCondition(arm,'SOLANA_RETENTION_FIXED_CUSTODY');return arm();}
export async function captureOwnedSolanaRecoveryV1(runtime){requireCondition(arguments.length===1,'SOLANA_RECOVERY_ARITY');assertOwnedSolanaRuntime(runtime);const capture=originalSolanaRecoveryCapturesV1.get(runtime);requireCondition(capture,'SOLANA_RECOVERY_FIXED_CUSTODY');return capture();}
export async function reopenOwnedSolanaRecoveryV1(token){requireCondition(arguments.length===1,'SOLANA_RECOVERY_ARITY');const record=consumeWrappedRuntimeRecoveryV1(token,'solana');return createOwnedSolanaRuntimeProfile(async()=>{},SOLANA_PRIVATE_COHORT_OPTIONS,true,true,false,record);}
function restoreSolanaKeyV1(row,role){
 requireCondition(row&&typeof row.publicHex==='string'&&/^[0-9a-f]{64}$/.test(row.publicHex),'SOLANA_RECOVERY_KEY');const publicBytes=Buffer.from(row.publicHex,'hex');requireCondition(base58Encode(publicBytes)===row.address,'SOLANA_RECOVERY_KEY_ADDRESS');
 if(row.seedHex===null){requireCondition(['depositorNonceBootstrapPayer','depositorNonce','nonceBootstrapPayer','escrowNonce'].includes(role),'SOLANA_RECOVERY_MISSING_SOURCE_KEY');return{seed:Buffer.alloc(32),publicBytes,address:row.address};}
 requireCondition(typeof row.seedHex==='string'&&/^[0-9a-f]{64}$/.test(row.seedHex),'SOLANA_RECOVERY_SEED');const seed=Buffer.from(row.seedHex,'hex'),key=createPrivateKey({key:Buffer.concat([PKCS8_ED25519,seed]),type:'pkcs8',format:'der'});assert.deepEqual(createPublicKey(key).export({type:'spki',format:'der'}).subarray(-32),publicBytes,'SOLANA_RECOVERY_KEY_PAIR');return{seed,publicBytes,address:row.address};
}
async function createOwnedSolanaRuntimeProfile(progress, options, cohort, custody = false, combined = false,recovery=null,jupiterPublic=false,jupiterSpl=false,originalClaimIngress=false) {
  requireCondition(typeof originalClaimIngress === 'boolean'
    && (!originalClaimIngress || (cohort && custody && combined && !recovery && !jupiterPublic && !jupiterSpl)),
    'SOLANA_ORIGINAL_CLAIM_FIXED_PROFILE');
  requireCondition(!jupiterPublic||(!cohort&&!custody&&!combined&&!recovery),'JUPITER_BANK_FIXED_PROFILE');
  requireCondition(!jupiterSpl||(cohort&&custody&&combined&&!recovery&&!jupiterPublic),'SOLANA_SPL_FIXED_ORIGINAL_PROFILE');
  const splMaterial=jupiterSpl?loadOwnedNativeSplProducedProgramV1():null;
  const jupiterMaterial=jupiterPublic||jupiterSpl?loadJupiterOfficialMaterialV1():null;
  let jupiterGenesisRows=null,jupiterGenesisFiles=null,jupiterCurrentRows=null,splFacade=null;
  // Load once before any native operation; never yield to import at a send boundary.
  const payoutController = custody ? await import('../../../claims/payouts/payout-controller-dispatch-v1.mjs') : null;
  const originalKeyControllerV4 = custody ? await import('../../../claims/payouts/payout-controller-dispatch-v1.mjs') : null;
  const retentionArguments = solanaLedgerRetentionArguments(options);
  requireCondition(solanaLoopbackCompatibilityPin !== null, 'SOLANA_LOOPBACK_COMPAT_BUILD_NOT_READY');
  const boundedLedger = options.resourceProfile === SOLANA_BOUNDED_LEDGER_PROFILE;
  const selectedValidatorPin = boundedLedger ? solanaCandidateBoundedLedgerCompatibilityPin : solanaLoopbackCompatibilityPin;
  const binaries = { validator: await pinnedSolanaBinary(selectedValidatorPin) };
  try { await lstat(join(dirname(binaries.validator), 'perf-libs')); fail('SOLANA_UNREVIEWED_PERFORMANCE_LIBRARY_DIRECTORY'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  let restored=null;
  if(recovery){requireCondition(custody&&cohort&&!combined,'SOLANA_RECOVERY_FIXED_CUSTODY');requireCondition(recovery.schema==='OWNED_FIXED_SOLANA_CAPTURE_V1'&&recovery.family==='solana','SOLANA_RECOVERY_RECORD');requireCondition(recovery.terminal.ownedProcessStopped===true&&recovery.terminal.forced===false&&recovery.terminal.nativeOrderlyExit===true,'SOLANA_RECOVERY_TERMINAL');await assertOwnedRecoveryScratchV1(recovery.cwd,'flat-solana-');await assertStoppedNativeFilesV1(recovery.cwd,recovery.files);restored=await readPrivateRuntimeRecoveryV1(recovery.cwd,recovery.privateRecord);requireCondition(restored.schema==='OWNED_FIXED_SOLANA_PRIVATE_RECOVERY_V1'&&restored.cwd===recovery.cwd,'SOLANA_RECOVERY_IDENTITY');assert.deepEqual(restored.validatorPin,selectedValidatorPin);assert.deepEqual(restored.options,options);assert.equal(restored.processGeneration,recovery.processGeneration,'NATIVE_RECOVERY_GENERATION_MISMATCH');await claimStoppedNativeRecoveryV1(recovery.cwd,recovery);}
  const cwd = restored?restored.cwd:await scratchDirectory('flat-solana-'), ledger = join(cwd, 'ledger'), env = envFor(cwd);
  let initialPrivateRecord=null;
  let recoveryCapturing=false,recoveryRetained=Boolean(restored),recoveryCapture=null,recoveryCaptureResult=null;
  const processGeneration=restored?restored.processGeneration+1:0;requireCondition(Number.isSafeInteger(processGeneration)&&processGeneration>=0&&processGeneration<16,'SOLANA_RECOVERY_GENERATION');
  let handle, portReservation, metadata, cleanupOutcome, closePromise, isolationTimer, isolationCheck, isolationFailure, diagnostic = '', closed = false, shuttingDown = false, busy = false, observationBusy = false, preSignReadWindow = false, preBroadcastReadWindow = false, signingUnresolved = false, activePrepared = null, activeRoute = null, inventoryBusy = false;
  let readPayoutAuditState;
  const lifetimeId = randomUUID();
  let readGeneration = 0n, mutationGeneration = 0n, activeNativeReads = 0, activeNativeMutations = 0, activeNativeReadOperations = 0;
  const sendOwnedSolanaTransaction = async (ownedEndpoint, nativeWire) => {
    mutationGeneration++; activeNativeMutations++;
    try { return await fixedOwnedSolanaSend(ownedEndpoint, nativeWire); }
    finally { activeNativeMutations--; }
  };
  const keys = {}, records = new Map(), graphRecords = new Map(), signedPreparations = new Map(), reservationReads = createOwnedCustodyReservationReadWindow();
  const bootstrapRecordsByAuthority = { depositor: null, escrow: null };
  const allRecords = () => [...records.values(), ...graphRecords.values()];
  const routeRecords = selectedRoute => combined && selectedRoute.name === null ? graphRecords : records;
  let nativeExitTimeoutObserved=false,nativeChildCloseObserved=false;const nativeDiagnosticOverlap={stdout:'',stderr:''};
  async function stopRetainedValidator(){
    const child=handle.child;
    if(child.exitCode!==null||child.signalCode!==null)return{stopped:true,forced:false,nativeOrderlyExit:false};
    const socketPath=join(ledger,'admin.rpc');let nativeStopFailure=null;
    const requestAdmin=async method=>{
      requireCondition(method==='pid'||method==='exit','SOLANA_RECOVERY_ADMIN_FIXED_METHOD');
      handle.assertAlive();const st=await lstat(socketPath);requireCondition(st.isSocket()&&!st.isSymbolicLink()&&st.uid===process.getuid()&&(await realpath(socketPath))===socketPath,'SOLANA_RECOVERY_OWNED_ADMIN_SOCKET');
      return new Promise((resolve,reject)=>{
        const socket=createConnection({path:socketPath});let data='',settled=false;
        const absoluteTimer=setTimeout(()=>done(new Error('SOLANA_RECOVERY_ADMIN_TIMEOUT')),5000);
        const done=(error,value)=>{if(settled)return;settled=true;clearTimeout(absoluteTimer);socket.destroy();error?reject(error):resolve(value);};
        socket.setTimeout(5000,()=>done(new Error('SOLANA_RECOVERY_ADMIN_TIMEOUT')));
        socket.on('error',cause=>{const error=new Error('SOLANA_RECOVERY_ADMIN_UNAVAILABLE');if(['EACCES','EPERM','ENOENT','ECONNREFUSED'].includes(cause.code))error.code=cause.code;done(error);});
        socket.on('connect',()=>socket.write(JSON.stringify({jsonrpc:'2.0',id:1,method,params:[]})+'\n'));
        socket.on('data',chunk=>{data+=chunk.toString('utf8');if(data.length>4096)return done(new Error('SOLANA_RECOVERY_ADMIN_RESPONSE_BOUND'));try{const row=JSON.parse(data.trim());requireCondition(row.jsonrpc==='2.0'&&row.id===1&&!row.error&&Object.hasOwn(row,'result'),'SOLANA_RECOVERY_ADMIN_RESPONSE');done(null,row.result);}catch(error){if(data.includes('\n'))done(new Error('SOLANA_RECOVERY_ADMIN_RESPONSE'));}});
        socket.on('end',()=>{if(!settled)done(new Error('SOLANA_RECOVERY_ADMIN_RESPONSE'));});
        socket.on('close',()=>{if(!settled)done(new Error('SOLANA_RECOVERY_ADMIN_RESPONSE'));});
      });
    };
    try{
      requireCondition(await requestAdmin('pid')===child.pid,'SOLANA_RECOVERY_ADMIN_ORIGINAL_PID');
      requireCondition(await requestAdmin('exit')===null,'SOLANA_RECOVERY_ADMIN_EXIT_ACK');
      for(let i=0;i<300&&!nativeChildCloseObserved;i++)await sleep(100);
      if(nativeChildCloseObserved&&child.exitCode===0&&child.signalCode===null&&!nativeExitTimeoutObserved)return{stopped:true,forced:false,nativeOrderlyExit:true};
    }catch(error){nativeStopFailure=['EACCES','EPERM','ENOENT','ECONNREFUSED'].includes(error.code)?error.code:(/^[A-Z_]{1,100}$/.test(error.message)?error.message:'SOLANA_RECOVERY_ADMIN_FAILED');/* Cleanup only; no alternate endpoint or permission bypass. */}
    const result=await stopOwnProcess(handle,{graceMs:30000});return{...result,nativeOrderlyExit:false,nativeStopFailure:nativeStopFailure??'SOLANA_RECOVERY_NATIVE_JOIN_NOT_ESTABLISHED'};
  }
  const close = async () => {if(recoveryRetained&&!recoveryCapturing&&recoveryCapture){try{await recoveryCapture();return cleanupOutcome;}catch(error){recoveryCapturing=true;try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'SOLANA_RECOVERY_CAPTURE_AND_STOP_FAILED');}throw error;}}return closePromise ??= (async () => {
    if (closed) return cleanupOutcome;
    shuttingDown = true; clearInterval(isolationTimer);
    if (isolationCheck) await isolationCheck;
    const processOutcome = handle ? (recoveryRetained?await stopRetainedValidator():await stopOwnProcess(handle, { graceMs: 30000 })) : { stopped: true, forced: false,nativeOrderlyExit:false };
    if (portReservation) { await portReservation.release(); portReservation = undefined; }
    for (const key of Object.values(keys)) key.seed.fill(0);
    if(!recoveryRetained)await removeOwnScratch(cwd); closed = true;
    cleanupOutcome = { ownedProcessStopped: processOutcome.stopped, forced: processOutcome.forced,nativeOrderlyExit:processOutcome.nativeOrderlyExit===true,nativeStopFailure:processOutcome.nativeStopFailure??null, syntheticKeysAndLedgerRemoved: !recoveryRetained, retainedForRecovery:recoveryRetained };
    if (metadata) metadata.cleanup = cleanupOutcome;
    return cleanupOutcome;
  })();};
  const sanitize = text => String(text).replaceAll(cwd, '[OWN_SCRATCH]').slice(-12000);
  try {
    await progress('Creating fresh synthetic keys for isolated local Solana');
    if(!restored)for (const role of ['solver', 'recipient', ...(cohort ? ['recipient1'] : []), 'unusedMint']) keys[role] = createSyntheticKey();
    if(jupiterPublic)for(const role of ['jupiterSource','jupiterDestination'])keys[role]=createSyntheticKey();
    if(jupiterSpl)for(const role of ['splFeePayer','splSource','splRefund','splRecipient','splRecipientOwner'])keys[role]=createSyntheticKey();
    if (custody&&!restored) for (const role of ['depositorNonceBootstrapPayer', 'depositorNonce', 'nonceBootstrapPayer', 'escrowNonce'])
      keys[role] = createSyntheticKey();
    if (combined&&!restored) {
      for (const role of ['graphSolver', 'graphRecipient', 'graphRecipient1']) keys[role] = createSyntheticKey();
    }
    if(restored){assert.deepEqual(Object.keys(restored.keys).sort(),['solver','recipient','recipient1','unusedMint','depositorNonceBootstrapPayer','depositorNonce','nonceBootstrapPayer','escrowNonce'].sort());for(const [role,row]of Object.entries(restored.keys))keys[role]=restoreSolanaKeyV1(row,role);}
    if(custody&&!combined&&!restored){const economicKeys={};for(const role of ['solver','recipient','recipient1','unusedMint']){economicKeys[role]={publicHex:keys[role].publicBytes.toString('hex'),address:keys[role].address,seedHex:keys[role].seed.toString('hex')};const verified=restoreSolanaKeyV1(economicKeys[role],role);verified.seed.fill(0);}initialPrivateRecord=await writeOriginalSolanaEconomicKeysV1(cwd,{schema:'OWNED_SOLANA_ORIGINAL_ECONOMIC_KEYS_V1',keys:economicKeys});}
    // Includes economic roles, both infrastructure pairs, graph roles and mint.
    requireCondition(new Set(Object.values(keys).map(key => key.address)).size === Object.keys(keys).length,
      'SOLANA_ALL_DISTINCT_KEYS');
    const recipientAddresses = [keys.recipient.address, ...(cohort ? [keys.recipient1.address] : [])];
    const roleKeys = { depositor: keys.solver, escrow: keys.recipient, recipient: keys.recipient1 };
    const roles = frozenInput(Object.fromEntries(Object.entries(roleKeys).filter(([, key]) => key)
      .map(([role, key]) => [role, { address: key.address, endpoint: key.publicBytes.toString('hex') }])));
    const custodyRoute = name => ({ name, ...ownedCustodyRoute(name) });
    const graphRoute = recipientIndex => ({ name: null, recipientIndex, sourceRole: 'depositor',
      destinationRole: recipientIndex === 0 ? 'escrow' : 'recipient' });
    const graphRoleKeys = combined ? { depositor: keys.graphSolver, escrow: keys.graphRecipient, recipient: keys.graphRecipient1 } : roleKeys;
    const selectedKeys = selectedRoute => selectedRoute.name === null ? graphRoleKeys : roleKeys;
    const sourceKey = selectedRoute => selectedKeys(selectedRoute)[selectedRoute.sourceRole];
    const recipientAddress = selectedRoute => selectedKeys(selectedRoute)[selectedRoute.destinationRole].address;
    const nonceAuthorityRoles = Object.freeze(['depositor', 'escrow']);
    const nonceKeysByAuthority = custody ? Object.freeze({
      depositor: Object.freeze({ payer: keys.depositorNonceBootstrapPayer, account: keys.depositorNonce }),
      escrow: Object.freeze({ payer: keys.nonceBootstrapPayer, account: keys.escrowNonce }),
    }) : null;
    const usesNonce = selectedRoute => custody && ['deposit', 'refund', 'redeem'].includes(selectedRoute.name)
      && (!originalClaimIngress || selectedRoute.name !== 'deposit');
    function selectedNonce(selectedRoute) {
      requireCondition(usesNonce(selectedRoute), 'SOLANA_NONCE_CUSTODY_ROUTE_REQUIRED');
      same(selectedRoute, custodyRoute(selectedRoute.name), 'SOLANA_NONCE_FIXED_ROUTE');
      const authorityRole = ownedCustodyRoute(selectedRoute.name).sourceRole;
      requireCondition(nonceAuthorityRoles.includes(authorityRole), 'SOLANA_NONCE_AUTHORITY_ROLE');
      const infrastructure = nonceInfrastructureByAuthority?.[authorityRole];
      const bootstrap = bootstrapRecordsByAuthority[authorityRole];
      requireCondition(infrastructure && bootstrap?.phase === 'OBSERVED_FINALIZED', 'SOLANA_NONCE_BOOTSTRAP_REQUIRED');
      requireCondition(infrastructure.authorityPublicKey === roles[authorityRole].endpoint
        && sourceKey(selectedRoute).publicBytes.toString('hex') === infrastructure.authorityPublicKey,
        'SOLANA_NONCE_ROUTE_AUTHORITY');
      const keysForAuthority = nonceKeysByAuthority[authorityRole];
      requireCondition(infrastructure.nonceAccountPublicKey === keysForAuthority.account.publicBytes.toString('hex'),
        'SOLANA_NONCE_ROUTE_ACCOUNT');
      return { authorityRole, ...keysForAuthority, infrastructure };
    }
    function assertRetainedNonceRoute(record) {
      const selected = selectedNonce(custodyRoute(record.route));
      assertOwnedCustodyIntent(record.route, roles, '2', record.intent);
      requireCondition(record.sourceRole === selected.authorityRole
        && record.intent.nonceAccountPublicKey === selected.infrastructure.nonceAccountPublicKey,
        'SOLANA_NONCE_RETAINED_ROUTE');
      return selected;
    }
    if(!restored)await mkdir(ledger);
    const solverAccount = join(cwd, 'solver-account.json'), config = join(cwd, 'cli.yml');
    await writeFile(solverAccount, JSON.stringify({ pubkey: keys.solver.address, account: { lamports: 10000000000, data: ['', 'base64'], owner: '11111111111111111111111111111111', executable: false, rentEpoch: 0, space: 0 } }), { mode: 0o600 });
    const custodyGenesisArguments = [];
    if (custody) {
      const escrowAccount = join(cwd, 'escrow-account.json');
      await writeFile(escrowAccount, JSON.stringify({ pubkey: keys.recipient.address,
        account: { lamports: Number(SOLANA_CUSTODY_SYNTHETIC_SURPLUS), data: ['', 'base64'], owner: SYSTEM_PROGRAM,
          executable: false, rentEpoch: 0, space: 0 } }), { mode: 0o600 });
      custodyGenesisArguments.push('--account', keys.recipient.address, escrowAccount);
      // The bounded custody redemption policy requires an existing funded
      // destination. This separate recipient grant is fixture value only; it
      // is never escrow fee surplus or admitted claim principal.
      const payoutAccount = join(cwd, 'payout-account.json');
      await writeFile(payoutAccount, JSON.stringify({ pubkey: keys.recipient1.address,
        account: { lamports: 2000000, data: ['', 'base64'], owner: SYSTEM_PROGRAM,
          executable: false, rentEpoch: 0, space: 0 } }), { mode: 0o600 });
      custodyGenesisArguments.push('--account', keys.recipient1.address, payoutAccount);
      for (const authorityRole of nonceAuthorityRoles) {
        const payer = nonceKeysByAuthority[authorityRole].payer;
        const bootstrapPayer = join(cwd, authorityRole + '-nonce-bootstrap-payer.json');
        await writeFile(bootstrapPayer, JSON.stringify({ pubkey: payer.address,
          account: { lamports: Number(SOLANA_NONCE_BOOTSTRAP_GRANT), data: ['', 'base64'], owner: SYSTEM_PROGRAM,
            executable: false, rentEpoch: 0, space: 0 } }), { mode: 0o600 });
        custodyGenesisArguments.push('--account', payer.address, bootstrapPayer);
      }
    }
    if (combined) {
      for (const role of ['graphSolver', 'graphRecipient', 'graphRecipient1']) {
        const accountFile = join(cwd, role + '-account.json'), key = keys[role];
        await writeFile(accountFile, JSON.stringify({ pubkey: key.address,
          account: { lamports: Number(role === 'graphSolver' ? SOLANA_GRAPH_SYNTHETIC_LIQUIDITY : SOLANA_GRAPH_RECIPIENT_GRANT),
            data: ['', 'base64'], owner: SYSTEM_PROGRAM, executable: false, rentEpoch: 0, space: 0 } }), { mode: 0o600 });
        custodyGenesisArguments.push('--account', key.address, accountFile);
      }
    }
    if(jupiterPublic||jupiterSpl){
      jupiterGenesisRows=jupiterPublicBankGenesisV1(jupiterMaterial,jupiterSpl?keys.graphRecipient1.address:keys.solver.address,jupiterSpl?keys.splSource.address:keys.jupiterSource.address,jupiterSpl?keys.splRefund.address:keys.jupiterDestination.address);
      if(jupiterSpl){
        const address=keys.splSource.address;jupiterGenesisRows=jupiterGenesisRows.map(row=>{if(row.address!==address)return row;const data=Buffer.from(row.data);data.writeBigUInt64LE(0n,64);const lamports=JUPITER_ORCA_V1.tokenRent;
          return {...row,data,dataSHA256:digest(data),lamports,origin:{classification:'RENT_ONLY_WSOL_ZERO_PRINCIPAL_BEFORE_ORIGINAL_SOURCE'},json:{pubkey:address,account:{...row.json.account,lamports:Number(lamports),data:[data.toString('base64'),'base64']}}};});
        const recipient=Buffer.alloc(165);base58Decode(JUPITER_ORCA_V1.usdcMint,32).copy(recipient);keys.splRecipientOwner.publicBytes.copy(recipient,32);recipient[108]=1;
        const privateAccounts=[{pubkey:keys.splFeePayer.address,account:{lamports:100000000,data:['','base64'],owner:SYSTEM_PROGRAM,executable:false,rentEpoch:0,space:0}},
          {pubkey:keys.splRecipient.address,account:{lamports:Number(JUPITER_ORCA_V1.tokenRent),data:[recipient.toString('base64'),'base64'],owner:JUPITER_ORCA_V1.tokenProgram,executable:false,rentEpoch:0,space:165}}];
        for(const [i,account]of privateAccounts.entries()){const path=join(cwd,'spl-operational-account-'+i+'.json');await writeFile(path,JSON.stringify(account),{mode:0o600});custodyGenesisArguments.push('--account',account.pubkey,path);}
        const path=join(cwd,'new-native-spl-custody-v1.so');await writeFile(path,splMaterial.elf,{mode:0o600});custodyGenesisArguments.push('--bpf-program',splMaterial.program,path);
      }
      jupiterCurrentRows=jupiterGenesisRows;
      jupiterGenesisFiles=[];
      for(const [index,row] of jupiterGenesisRows.entries()){
        // Agave installs this canonical mint itself after initial accounts.
        if(row.address===JUPITER_ORCA_V1.solMint)continue;
        if(row.address===JUPITER_ORCA_V1.tokenProgram){
          const raw=jupiterExplicitTokenProgramV1(jupiterMaterial).elf,path=join(cwd,'jupiter-original-token-program.so');
          const file=await open(path,'wx',0o600);try{await file.writeFile(raw);await file.sync();}finally{await file.close();}
          jupiterGenesisFiles.push({address:row.address,path,inputSHA256:digest(raw)});
          custodyGenesisArguments.push('--bpf-program',row.address,path);continue;
        }
        const path=join(cwd,'jupiter-public-account-'+index+'.json'),raw=Buffer.from(JSON.stringify(row.json));
        const file=await open(path,'wx',0o600);try{await file.writeFile(raw);await file.sync();}finally{await file.close();}
        jupiterGenesisFiles.push({address:row.address,path,inputSHA256:digest(raw)});
        custodyGenesisArguments.push('--account',row.address,path);
      }
      const directory=await open(cwd,'r');try{await directory.sync();}finally{await directory.close();}
    }
    const ports = portReservation = await reserveOwnLoopbackPorts();
    const { rpcPort, gossipPort, faucetPort, dynamicBase, dynamicEnd } = ports;
    const endpoint = `http://127.0.0.1:${rpcPort}`;
    await writeFile(config, `json_rpc_url: ${endpoint}\nwebsocket_url: ws://127.0.0.1:${rpcPort + 1}\nkeypair_path: ${JSON.stringify(join(cwd, 'unused.json'))}\ncommitment: finalized\n`, { mode: 0o600 });
    const args = ['--config', config, '--ledger', ledger, ...(restored?[]:['--mint',keys.unusedMint.address,'--account',keys.solver.address,solverAccount,...custodyGenesisArguments]), '--bind-address', '127.0.0.1', '--gossip-host', '127.0.0.1', '--rpc-port', String(rpcPort), '--gossip-port', String(gossipPort), '--faucet-port', String(faucetPort), '--faucet-sol', '0', '--dynamic-port-range', `${dynamicBase}-${dynamicEnd}`, '--ticks-per-slot', String(options.ticksPerSlot ?? 16), '--slots-per-epoch', '512', '--log', ...retentionArguments];
    await ports.release(); portReservation = undefined;
    const child = spawn(binaries.validator, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.once('close',()=>{nativeChildCloseObserved=true;});
    let spawnError;
    child.on('error', e => { spawnError = e.code; });
    const collectDiagnostic = (stream,bytes) => { const chunk=bytes.toString(),combined=nativeDiagnosticOverlap[stream]+chunk;if(combined.includes('validator exit timeout'))nativeExitTimeoutObserved=true;nativeDiagnosticOverlap[stream]=combined.slice(-64);diagnostic = (diagnostic + chunk).slice(-48000); };
    child.stderr.on('data', bytes=>collectDiagnostic('stderr',bytes)); child.stdout.on('data', bytes=>collectDiagnostic('stdout',bytes));
    handle = { child, assertAlive() { if (spawnError || child.exitCode !== null || child.signalCode !== null) { const error = new Error('SOLANA_VALIDATOR_EXITED'); error.diagnostic = sanitize(diagnostic); error.exitCode = child.exitCode; error.signal = child.signalCode; throw error; } } };
    const read = async (method, params = []) => {
      requireCondition(READ_METHODS.has(method), 'SOLANA_READ_ONLY_METHOD_REQUIRED');
      requireCondition(!closed && !shuttingDown && !recoveryCapturing, 'SOLANA_RUNTIME_CLOSED');
      if (isolationFailure) throw isolationFailure; handle.assertAlive();
      readGeneration++; activeNativeReads++;
      try { return await ownedRuntimeRpc(endpoint, method, params, { timeoutMs: 5000 }); }
      finally { activeNativeReads--; }
    };
    await progress('Starting Solana validator with loopback-only addresses and no public entrypoint');
    let ready = false;
    for (let i = 0; i < 240; i++) { handle.assertAlive(); try { ready = await read('getHealth') === 'ok'; if (ready) break; } catch {} await sleep(250); }
    if (!ready) { const error = new Error('SOLANA_STARTUP_TIMEOUT'); error.diagnostic = sanitize(diagnostic); throw error; }
    // Read identity from this child's freshly generated ledger, independently
    // of its RPC response. The local key file is synthetic and never exported.
    const genesis = base58Encode(createHash('sha256').update(await readFile(join(ledger, 'genesis.bin'))).digest());
    requireCondition(!PUBLIC_GENESIS.has(genesis), 'SOLANA_PUBLIC_GENESIS_FORBIDDEN');
    const identityFile = JSON.parse(await readFile(join(ledger, 'validator-keypair.json'), 'utf8'));
    requireCondition(Array.isArray(identityFile) && identityFile.length === 64 && identityFile.every(x => Number.isInteger(x) && x >= 0 && x <= 255), 'SOLANA_INVALID_OWN_IDENTITY_FILE');
    const identity = base58Encode(Buffer.from(identityFile.slice(32))); identityFile.fill(0);
    requireCondition(await read('getGenesisHash') === genesis, 'SOLANA_WRONG_GENESIS');
    const clusterNodes = await read('getClusterNodes');
    requireCondition(clusterNodes.length === 1 && clusterNodes[0].pubkey === identity, 'SOLANA_UNEXPECTED_CLUSTER_PEER');
    for (const peer of clusterNodes) for (const field of ['gossip', 'tpu', 'rpc']) if (peer[field]) requireCondition(/^127\.0\.0\.1:[0-9]+$/.test(peer[field]), 'SOLANA_NON_LOOPBACK_CONTACT');
    const runtimeMaps = await readFile(`/proc/${child.pid}/maps`, 'utf8');
    requireCondition(!runtimeMaps.includes('libpoh-simd.so') && !runtimeMaps.includes('libcuda-crypt.so'), 'SOLANA_UNPINNED_VENDOR_LIBRARY_LOADED');
    const dynamicLibraryPaths = [...new Set(runtimeMaps.split('\n').filter(line => /\.so(?:[.0-9]*)?(?: |$)/.test(line)).map(line => line.trim().split(/\s+/).at(-1)))].sort();
    const ownedSockets = await inspectOwnedLoopbackSockets(child.pid, [rpcPort, rpcPort + 1, faucetPort]);
    const balance = async (address = keys.recipient.address) => {
      requireCondition(address === keys.solver.address || recipientAddresses.includes(address), 'SOLANA_BALANCE_REQUIRES_OWNED_ADDRESS');
      const result = await read('getBalance', [address, { commitment: 'confirmed' }]); return safeInteger(result.value, 'SOLANA_UNSAFE_BALANCE').toString();
    };
    if(!restored)requireCondition(await balance(keys.solver.address) === '10000000000', 'SOLANA_SYNTHETIC_FUNDING_MISMATCH');
    metadata = { classification: 'OWNED_PROJECT_BUILT_LOOPBACK_AGAVE_TEST_VALIDATOR', runtimeVersion: await read('getVersion'), runtimePins: { validator: selectedValidatorPin }, pohImplementation: 'RUST_FALLBACK_NO_LIBPOH_SIMD_LOADED', dynamicLibraryPaths, officialSourceVersion: '2.3.13', compatibilityChanges: 'Six-file source-derived build: loopback faucet/RPC/PubSub/IP-echo/UDP-vote-client sockets; existing test-mode resource limit branch returns before any getrlimit/setrlimit call', sourceCommit: '5466f4592b1983adb13ba0a5d53f41ea2de69fba', sourcePatchSHA256: '68d9b1e48f9a62811b8bbaa35066ce99a9aa6907db683ce55ea7ea313bdeaf54', patchManifestSHA256: '3ab20c75760c6eae344a021abaa16bb182ce64545abd32f8cfdf152c0673454f', genesis, genesisHex: '0x' + base58Decode(genesis, 32).toString('hex'), publicKeys: { identity, ...Object.fromEntries(Object.entries(keys).map(([role, key]) => [role, key.address])) }, solverHex: '0x' + keys.solver.publicBytes.toString('hex'), recipientHex: '0x' + keys.recipient.publicBytes.toString('hex'), clusterNodes, ownedSockets, processId: child.pid, binding: '127.0.0.1', publicEntrypoints: [], faucetStarted: true, faucetBinding: `127.0.0.1:${faucetPort}`, faucetGenesisLamports: '0', faucetUsed: false, freshSyntheticKeys: !restored, restoredOriginalState:Boolean(restored), recoveryProcessGeneration:processGeneration, hostSecurityChanged: false, genesisSource: restored?'SHA256 of retained original own genesis.bin':'SHA256 of freshly generated own genesis.bin', validatorArgs: args.map(sanitize), signing: 'Node Ed25519 with ephemeral synthetic solver key; no external wallet', assurance: 'trusted-owned-local-rpc-observation-not-public-consensus-proof' };
    if (boundedLedger) {
      metadata.compatibilityChanges = 'Seven-file source-derived build: original loopback/no-host-limit compatibility plus one aggregate RocksDB memtable flush threshold';
      metadata.sourcePatchSHA256 = 'b5f93d0b28f8438d146948b14d1378e2123a8c0eaec8c70fb96678c2b13e59a5';
      metadata.patchManifestSHA256 = 'f6e62a557520dc579c2bf3980805049fd9acde08a898091857f7c74b7a02972b';
      metadata.resourceProfile = { name: SOLANA_BOUNDED_LEDGER_PROFILE, aggregateMemtableFlushThresholdBytes: 134217728, strictProcessMemoryCap: false, processResourceFloorsChanged: false };
    }
    metadata.ledgerRetention = { requestedShreds: options.ledgerRetentionShreds ?? null, effectiveShreds: options.ledgerRetentionShreds ?? 10_000, upstreamDefaultShreds: 10_000, finiteLocalLedgerOnly: true };
    metadata.slotTiming = { requestedTicksPerSlot: options.ticksPerSlot ?? null, effectiveTicksPerSlot: options.ticksPerSlot ?? 16, historicalAdapterTicksPerSlot: 16, officialDefaultTicksPerSlot: 64 };
    if (cohort && !custody) metadata.cohortProfile = { name: SOLANA_PRIVATE_COHORT_PROFILE, recipientCount: 2, registeredRecipients: recipientAddresses.slice(), sharedNativeSolver: true, commonTrustedHost: true, externalAnonymitySetClaim: false };
    metadata.periodicSocketAudit = { intervalMs: 250, completedChecks: 0, failure: null };
    isolationTimer = setInterval(() => {
      if (isolationCheck || shuttingDown || isolationFailure) return;
      isolationCheck = inspectOwnedLoopbackSockets(child.pid, [rpcPort, rpcPort + 1, faucetPort]).then(() => {
        metadata.periodicSocketAudit.completedChecks++;
      }).catch(error => {
        if (shuttingDown) return;
        isolationFailure = error;
        metadata.periodicSocketAudit.failure = { message: error.message, ...(error.offendingSocket ? { offendingSocket: error.offendingSocket } : {}) };
        // Stop only this exact owned child on an isolation violation. Any
        // already signed effect remains recorded and is never blindly resent.
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      }).finally(() => { isolationCheck = undefined; });
    }, 250);
    isolationTimer.unref();
    // Verify the bundled program from the actual owned RPC before minting any
    // adapter capability. The same account/code check repeats before key use.
    memoAccount((await read('getAccountInfo', [MEMO_PROGRAM.address,
      { commitment: 'confirmed', encoding: 'base64' }])).value);
    metadata.classification = custody ? SOLANA_CUSTODY_PROFILE : 'OWNED_FLAT_SOLANA_RECEIPT_BINDING_RUNTIME_V1';
    const syntheticPrefunding = custody ? frozenInput({ amount: SOLANA_CUSTODY_SYNTHETIC_SURPLUS,
      classification: 'SYNTHETIC_LOCAL_FEE_SURPLUS_NOT_USER_BACKING', origin: 'SYNTHETIC_GENESIS_SYSTEM_ACCOUNT', fee: '0' }) : null;
    if (custody) {
      if(!restored)requireCondition(await balance(keys.recipient.address) === SOLANA_CUSTODY_SYNTHETIC_SURPLUS, 'SOLANA_SYNTHETIC_SURPLUS_MISMATCH');
      metadata.custody = { roles, syntheticPrefunding, recipientGenesisLamports: '2000000', ephemeralCustody: true };
      metadata.signing = 'Node Ed25519 with fixed owned route source key; no external wallet';
    }
    if (combined) {
      const accounts = [];
      for (const role of ['graphSolver', 'graphRecipient', 'graphRecipient1']) {
        const key = keys[role], amount = role === 'graphSolver' ? SOLANA_GRAPH_SYNTHETIC_LIQUIDITY : SOLANA_GRAPH_RECIPIENT_GRANT;
        requireCondition(safeInteger((await read('getBalance', [key.address, { commitment: 'confirmed' }])).value,
          'SOLANA_UNSAFE_BALANCE').toString() === amount, 'SOLANA_GRAPH_SYNTHETIC_FUNDING_MISMATCH');
        accounts.push({ role, address: key.address, endpoint: key.publicBytes.toString('hex'), genesisLamports: amount });
      }
      metadata.graphLiquidity = { classification: 'SYNTHETIC_GRAPH_LIQUIDITY_NOT_CLAIM_PRINCIPAL',
        origin: 'SYNTHETIC_GENESIS_SYSTEM_ACCOUNTS', accounts, custodyInventoryExcluded: true, custodyFeeAuditExcluded: true };
    }
    const graphReceiptBinding = frozenInput({ version: '1', transferInstruction: 0, memoInstruction: 1,
      memoProgram: structuredClone(MEMO_PROGRAM), wireBytes: 321, preparation: 'STABLE_CONFIRMED_CONTEXT_AND_FRESH_FUNDS' });
    metadata.receiptBinding = cloneInput(graphReceiptBinding);
    if (custody) {
      const nonceBinding = { version: '2', advanceNonceInstruction: 0, transferInstruction: 1,
        memoInstruction: 2, memoProgram: structuredClone(MEMO_PROGRAM), wireBytes: 395,
        preparation: 'STABLE_CONFIRMED_CONTEXT_AND_FRESH_NONCE_AND_FUNDS' };
      metadata.receiptBinding = { ...(originalClaimIngress ? graphReceiptBinding : nonceBinding), routes: originalClaimIngress ? ['deposit'] : ['deposit', 'refund', 'redeem'] };
      metadata.ingressReceiptBinding = { ...(originalClaimIngress ? graphReceiptBinding : nonceBinding), routes: ['deposit'], authorityRole: 'depositor' };
      if (originalClaimIngress) metadata.claimIngressProfile = 'OWNED_SOLANA_ORIGINAL_RECENT_BLOCKHASH_CLAIM_V1';
      metadata.payoutReceiptBinding = { ...nonceBinding, routes: ['refund', 'redeem'], authorityRole: 'escrow' };
    }
    const journalDirectory = join(cwd, 'signed-native'); if(!restored)await mkdir(journalDirectory);
    const graphJournalDirectory = join(cwd, 'signed-graph'); if (combined) await mkdir(graphJournalDirectory);
    const bootstrapDirectories = {};
    if (custody) {
      const root = join(cwd, 'nonce-bootstrap'); if(!restored)await mkdir(root);
      for (const authorityRole of nonceAuthorityRoles) {
        bootstrapDirectories[authorityRole] = join(root, authorityRole);
        if(!restored)await mkdir(bootstrapDirectories[authorityRole]);
      }
    }
    let nativePersistenceFailure = null, boundNativeAsset = null;
    const originalBootstrapPins = {};
    let nonceInfrastructureByAuthority = null;
    if (custody) metadata.nonceBootstrapPreparationByAuthority = {};
    const preparationContexts = new WeakMap(), nonceObservations = new WeakMap();
    async function persistNative(record, directoryPath = graphRecords.get(record.nativeId) === record ? graphJournalDirectory : journalDirectory) {
      if (nativePersistenceFailure) throw nativePersistenceFailure;
      try {
        const path = join(directoryPath, record.nativeId + '.json'), temporary = path + '.next';
        const file = await open(temporary, 'wx', 0o600);
        try { await file.writeFile(JSON.stringify(record)); await file.sync(); } finally { await file.close(); }
        await rename(temporary, path);
        const directory = await open(directoryPath, 'r');
        try { await directory.sync(); } finally { await directory.close(); }
      } catch (cause) {
        nativePersistenceFailure = new Error('SOLANA_NATIVE_JOURNAL_UNCERTAIN', { cause });
        throw nativePersistenceFailure;
      }
    }
    async function healthy() {
      activeNativeReadOperations++;
      try {
      readGeneration++;
      requireCondition(!closed && !shuttingDown && !recoveryCapturing, 'SOLANA_RUNTIME_CLOSED');
      if (isolationFailure) throw isolationFailure;
      if (nativePersistenceFailure) throw nativePersistenceFailure;
      handle.assertAlive();
      requireCondition(await read('getGenesisHash') === genesis, 'SOLANA_WRONG_GENESIS');
      await inspectOwnedLoopbackSockets(child.pid, [rpcPort, rpcPort + 1, faucetPort]);
      } finally { activeNativeReadOperations--; readGeneration++; }
    }
    async function bootstrapNonce(authorityRole) {
      requireCondition(custody && nonceAuthorityRoles.includes(authorityRole)
        && bootstrapRecordsByAuthority[authorityRole] === null, 'SOLANA_NONCE_BOOTSTRAP_ONCE');
      const { payer, account } = nonceKeysByAuthority[authorityRole];
      const authorityPublicKey = roles[authorityRole].endpoint, bootstrapDirectory = bootstrapDirectories[authorityRole];
      let bootstrapRecord;
      const preparationDeadline = Date.now() + 45_000;
      metadata.nonceBootstrapPreparationByAuthority[authorityRole] = { observations: [], signed: false };
      let prepared;
      for (let attempt = 0; attempt < 120 && Date.now() < preparationDeadline; attempt++) {
        await healthy();
        const recent = await read('getLatestBlockhash', [{ commitment: 'confirmed' }]);
        const slot = Number(contextSlot(recent)), context = { commitment: 'confirmed', minContextSlot: slot };
        const rent = safeInteger(await read('getMinimumBalanceForRentExemption', [80, { commitment: 'confirmed' }]), 'SOLANA_INVALID_RENT_MINIMUM');
        const intent = { payerPublicKey: payer.publicBytes.toString('hex'), nonceAccountPublicKey: account.publicBytes.toString('hex'),
          authorityPublicKey, recentBlockhash: base58Decode(recent.value.blockhash, 32).toString('hex'),
          rentLamports: rent.toString() };
        const message = encodeSolanaNonceBootstrapMessage(intent);
        const [accounts, fee, height, validity] = await Promise.all([
          read('getMultipleAccounts', [[payer.address, account.address], { ...context, encoding: 'base64' }]),
          read('getFeeForMessage', [Buffer.from(message, 'hex').toString('base64'), context]),
          read('getBlockHeight', [context]), read('isBlockhashValid', [recent.value.blockhash, context]),
        ]);
        const again = await read('getLatestBlockhash', [context]);
        if ([accounts, fee, validity, again].some(value => contextSlot(value) !== BigInt(slot))
          || JSON.stringify(recent.value) !== JSON.stringify(again.value)) continue;
        const projected = projectRPCAccounts(accounts, 2);
        const checkedPayer = systemAccount(projected.value[0], intent.payerPublicKey, true);
        requireCondition(projected.value[1] === null, 'SOLANA_NONCE_BOOTSTRAP_ACCOUNT_ALREADY_EXISTS');
        const preparedFee = safeInteger(fee.value, 'SOLANA_INVALID_FEE');
        metadata.nonceBootstrapPreparationByAuthority[authorityRole].observations.push({ slot: String(slot),
          rentLamports: rent.toString(), feeLamports: preparedFee.toString(), payerLamports: checkedPayer.lamports });
        // Pinned Agave test-validator documents zero genesis fees until the
        // first completed block containing a transaction. Wait for a fresh
        // coherent positive quote before creating any signature or journal.
        if (!solanaNonceBootstrapFundingReady(Number(rent), fee.value, checkedPayer.lamports)) {
          await sleep(250); continue;
        }
        requireCondition(validity.value === true && safeInteger(height, 'SOLANA_INVALID_BLOCK_HEIGHT')
          < safeInteger(recent.value.lastValidBlockHeight, 'SOLANA_INVALID_BLOCK_HEIGHT'), 'SOLANA_BLOCKHASH_EXPIRED');
        prepared = { intent, message, preparedFee: preparedFee.toString() }; break;
      }
      requireCondition(prepared !== undefined, 'SOLANA_PREPARATION_CONTEXT_CHANGED');
      await healthy();
      const message = Buffer.from(prepared.message, 'hex');
      const signatures = [payer, account].map(key => sign(null, message,
        createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, key.seed]), type: 'pkcs8', format: 'der' })));
      metadata.nonceBootstrapPreparationByAuthority[authorityRole].signed = true;
      const nativeWire = Buffer.concat([Buffer.from([2]), ...signatures, message]).toString('base64');
      const decoded = validateSolanaNonceBootstrapTransaction(nativeWire, prepared.intent);
      bootstrapRecord = bootstrapRecordsByAuthority[authorityRole] = { authorityRole, genesis, intent: prepared.intent, nativeWire, nativeId: decoded.signatureHex,
        transactionSHA256: decoded.transactionSHA256, preparedFee: prepared.preparedFee,
        phase: 'SIGNED_NOT_BROADCAST', broadcastAttempts: 0, observation: null };
      try {
        await persistNative(bootstrapRecord, bootstrapDirectory);
        await healthy();
        bootstrapRecord.phase = 'BROADCAST_UNKNOWN'; bootstrapRecord.broadcastAttempts = 1;
        await persistNative(bootstrapRecord, bootstrapDirectory);
        try {
          requireCondition(await sendOwnedSolanaTransaction(endpoint, nativeWire) === base58Encode(signatures[0]),
            'SOLANA_BROADCAST_SIGNATURE_MISMATCH');
          bootstrapRecord.phase = 'BROADCAST'; await persistNative(bootstrapRecord, bootstrapDirectory);
        } catch (cause) {
          bootstrapRecord.broadcastFailure = { category: /^SOLANA_RPC_[A-Z_]+$/.test(cause.message ?? '')
            ? cause.message : 'SOLANA_RPC_RESPONSE_UNAVAILABLE', rpcCode: Number.isSafeInteger(cause.rpcCode) ? cause.rpcCode : null };
          await persistNative(bootstrapRecord, bootstrapDirectory);
        }
        // Lost replies only trigger exact-signature observation, never resend.
        const signature = base58Encode(signatures[0]), deadline = Date.now() + 45_000;
        for (;;) {
          await healthy();
          const statuses = await read('getSignatureStatuses', [[signature], { searchTransactionHistory: true }]);
          requireCondition(Array.isArray(statuses.value) && statuses.value.length === 1, 'SOLANA_STATUS_SHAPE');
          const status = statuses.value[0];
          if (status?.err !== null && status?.err !== undefined) {
            bootstrapRecord.phase = 'OBSERVED_ADVERSE'; await persistNative(bootstrapRecord, bootstrapDirectory);
            fail('SOLANA_NONCE_BOOTSTRAP_EXECUTION_FAILED');
          }
          if (status?.confirmationStatus === 'finalized') {
            const transaction = await read('getTransaction', [signature, { encoding: 'base64', commitment: 'finalized', maxSupportedTransactionVersion: 0 }]);
            if (transaction !== null) {
              const currentSlot = await read('getSlot', [{ commitment: 'finalized' }]);
              const options = { commitment: 'finalized', transactionDetails: 'signatures', rewards: false, maxSupportedTransactionVersion: 0 };
              const block = await read('getBlock', [transaction.slot, options]);
              const [again, transactionAgain, blockAgain] = await Promise.all([
                read('getSignatureStatuses', [[signature], { searchTransactionHistory: true }]),
                read('getTransaction', [signature, { encoding: 'base64', commitment: 'finalized', maxSupportedTransactionVersion: 0 }]),
                read('getBlock', [transaction.slot, options]),
              ]);
              if (block !== null && transactionAgain !== null && blockAgain !== null && again.value?.[0]) {
                const observed = validateSolanaNonceBootstrapObservation({ expected: { genesis, intent: prepared.intent, nativeWire,
                  nativeId: decoded.signatureHex, transactionSHA256: decoded.transactionSHA256 }, genesis: await read('getGenesisHash'),
                  status, transaction, currentSlot, block, statusAgain: again.value[0], transactionAgain, blockAgain,
                  currentSlotAgain: await read('getSlot', [{ commitment: 'finalized' }]) });
                requireCondition(observed.feeLamports === prepared.preparedFee, 'SOLANA_PREPARED_FEE_CHANGED');
                bootstrapRecord.phase = 'OBSERVED_FINALIZED'; bootstrapRecord.observation = cloneInput(observed);
                await persistNative(bootstrapRecord, bootstrapDirectory);
                const nonceInfrastructure = frozenInput({ classification: 'SYNTHETIC_NONCE_INFRASTRUCTURE_NOT_USER_BACKING',
                  genesisGrant: SOLANA_NONCE_BOOTSTRAP_GRANT, payerPublicKey: prepared.intent.payerPublicKey,
                  nonceAccountPublicKey: prepared.intent.nonceAccountPublicKey, authorityPublicKey,
                  bootstrapNativeId: decoded.signatureHex, bootstrapTransactionSHA256: decoded.transactionSHA256,
                  bootstrapRentLamports: prepared.intent.rentLamports, bootstrapFeeLamports: observed.feeLamports,
                  bootstrapBroadcastAttempts: 1 });
                const current = await read('getAccountInfo', [account.address,
                  { commitment: 'finalized', minContextSlot: Number(observed.transactionSlot), encoding: 'base64' }]);
                nonceAccount(current.value, prepared.intent.nonceAccountPublicKey, authorityPublicKey, BigInt(prepared.intent.rentLamports));
                requireCondition(!Object.values(originalBootstrapPins).some(pin =>
                  pin.bootstrapNativeId === nonceInfrastructure.bootstrapNativeId
                  || pin.bootstrapTransactionSHA256 === nonceInfrastructure.bootstrapTransactionSHA256),
                  'SOLANA_NONCE_BOOTSTRAP_IDENTITY_REUSED');
                originalBootstrapPins[authorityRole] = nonceInfrastructure;
                // Both bootstrap-only seeds are wiped; the economic source is authority.
                payer.seed.fill(0); account.seed.fill(0); return;
              }
            }
          }
          requireCondition(Date.now() < deadline, 'SOLANA_NONCE_BOOTSTRAP_HISTORY_UNKNOWN'); await sleep(200);
        }
      } catch (error) { error.nonceBootstrapByAuthority = cloneInput(bootstrapRecordsByAuthority); throw error; }
    }
    if (custody) {
      // Each bootstrap signs/sends once into its own fsynced journal and is
      // independently observed at the original exact signature before export.
      if(!restored)for (const authorityRole of nonceAuthorityRoles) await bootstrapNonce(authorityRole);
      else {
        requireCondition(genesis===restored.genesis&&identity===restored.validatorIdentity,'SOLANA_RECOVERY_ORIGINAL_GENESIS');assert.deepEqual(metadata.publicKeys,restored.publicKeys,'SOLANA_RECOVERY_ORIGINAL_KEYS');
        // RPC health can precede the restored ledger becoming rooted again.
        // Wait only for the original finalized frontier; never synthesize history.
        let restoredFrontier=false;for(let i=0;i<240;i++){if(await read('getSlot',[{commitment:'finalized'}])>=restored.finalizedSlot){restoredFrontier=true;break;}await sleep(250);}requireCondition(restoredFrontier,'SOLANA_RECOVERY_FINALIZED_FRONTIER_TIMEOUT');
        for(const authorityRole of nonceAuthorityRoles){const record=cloneInput(restored.bootstrapRecordsByAuthority[authorityRole]);requireCondition(record?.phase==='OBSERVED_FINALIZED'&&record.broadcastAttempts===1,'SOLANA_RECOVERY_BOOTSTRAP_TERMINAL');validateSolanaNonceBootstrapTransaction(record.nativeWire,record.intent);bootstrapRecordsByAuthority[authorityRole]=record;originalBootstrapPins[authorityRole]=cloneInput(restored.nonceInfrastructureByAuthority[authorityRole]);
          const signature=base58Encode(Buffer.from(record.nativeId,'hex')),opts={encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0},blockOpts={commitment:'finalized',transactionDetails:'signatures',rewards:false,maxSupportedTransactionVersion:0};
          const status=(await read('getSignatureStatuses',[[signature],{searchTransactionHistory:true}])).value[0],transaction=await read('getTransaction',[signature,opts]);requireCondition(transaction,'SOLANA_RECOVERY_BOOTSTRAP_HISTORY');const block=await read('getBlock',[transaction.slot,blockOpts]);
          const observed=validateSolanaNonceBootstrapObservation({expected:{genesis,intent:record.intent,nativeWire:record.nativeWire,nativeId:record.nativeId,transactionSHA256:record.transactionSHA256},genesis:await read('getGenesisHash'),status,transaction,currentSlot:await read('getSlot',[{commitment:'finalized'}]),block,statusAgain:(await read('getSignatureStatuses',[[signature],{searchTransactionHistory:true}])).value[0],transactionAgain:await read('getTransaction',[signature,opts]),blockAgain:await read('getBlock',[transaction.slot,blockOpts]),currentSlotAgain:await read('getSlot',[{commitment:'finalized'}])});
          requireCondition(observed.feeLamports===record.preparedFee,'SOLANA_RECOVERY_BOOTSTRAP_FEE');
        }
      }
      nonceInfrastructureByAuthority = frozenInput(originalBootstrapPins);
      metadata.nonceInfrastructureByAuthority = cloneInput(nonceInfrastructureByAuthority);
    }
    if(restored){
      requireCondition(Array.isArray(restored.records)&&restored.records.length<=64&&Array.isArray(restored.graphRecords)&&restored.graphRecords.length===0,'SOLANA_RECOVERY_RECORD_BOUND');
      for(const row of restored.records){const record=cloneInput(row),decoded=validateSolanaNonceBindingTransaction(record.nativeWire,record.intent);requireCondition(decoded.signatureHex===record.nativeId&&decoded.transactionSHA256===record.transactionSHA256,'SOLANA_RECOVERY_SIGNED_IDENTITY');requireCondition(!records.has(record.nativeId),'SOLANA_RECOVERY_DUPLICATE_RECORD');records.set(record.nativeId,record);}
      // Historical prepared bytes are retained as evidence; original in-memory
      // preparation/authorization WeakMaps are deliberately never recreated.
      const blockOpts={commitment:'finalized',transactionDetails:'signatures',rewards:false,maxSupportedTransactionVersion:0};assert.deepEqual(await read('getBlock',[restored.finalizedSlot,blockOpts]),restored.finalizedBlock,'SOLANA_RECOVERY_FINALIZED_HEAD');
      const currentSlot=await read('getSlot',[{commitment:'finalized'}]);requireCondition(currentSlot>=restored.finalizedSlot,'SOLANA_RECOVERY_SLOT_REGRESSION');
      if(restored.records.length===0)for(const [role,amount]of Object.entries(restored.balances))requireCondition(safeInteger((await read('getBalance',[roles[role].address,{commitment:'finalized'}])).value,'SOLANA_UNSAFE_BALANCE').toString()===amount,'SOLANA_RECOVERY_UNFUNDED_BALANCE');
      signingUnresolved=restored.signingUnresolved;boundNativeAsset=restored.boundNativeAsset;mutationGeneration=BigInt(restored.mutationGeneration)+1n;
      if(restored.nativePersistenceFailed)nativePersistenceFailure=new Error('SOLANA_NATIVE_JOURNAL_UNCERTAIN');if(restored.isolationFailed)isolationFailure=new Error('SOLANA_RETAINED_ISOLATION_FAILURE');
    }
    recoveryCapture=async()=>{
      if(recoveryCaptureResult)return cloneInput(recoveryCaptureResult);recoveryRetained=true;requireCondition(!closed&&!shuttingDown&&!recoveryCapturing&&!busy&&!observationBusy&&!inventoryBusy&&activeNativeReads===0&&activeNativeMutations===0&&activeNativeReadOperations===0,'SOLANA_RECOVERY_REQUIRES_QUIESCENCE');handle.assertAlive();recoveryRetained=true;recoveryCapturing=true;
      try {
      const ownRead=(method,params=[])=>{requireCondition(READ_METHODS.has(method),'SOLANA_RECOVERY_READ_ONLY');handle.assertAlive();return ownedRuntimeRpc(endpoint,method,params,{timeoutMs:5000});};
      requireCondition(await ownRead('getGenesisHash')===genesis,'SOLANA_RECOVERY_GENESIS');const finalizedSlot=await ownRead('getSlot',[{commitment:'finalized'}]),blockOpts={commitment:'finalized',transactionDetails:'signatures',rewards:false,maxSupportedTransactionVersion:0},finalizedBlock=await ownRead('getBlock',[finalizedSlot,blockOpts]);requireCondition(finalizedBlock,'SOLANA_RECOVERY_FINALIZED_HEAD_UNAVAILABLE');
      const balances={};for(const [role,row]of Object.entries(roles))balances[role]=safeInteger((await ownRead('getBalance',[row.address,{commitment:'finalized',minContextSlot:finalizedSlot}])).value,'SOLANA_UNSAFE_BALANCE').toString();
      const keyRows={};for(const [role,key]of Object.entries(keys))keyRows[role]={publicHex:key.publicBytes.toString('hex'),address:key.address,seedHex:['depositorNonceBootstrapPayer','depositorNonce','nonceBootstrapPayer','escrowNonce'].includes(role)&&key.seed.every(x=>x===0)?null:key.seed.toString('hex')};
      const state={schema:'OWNED_FIXED_SOLANA_PRIVATE_RECOVERY_V1',family:'solana',cwd,validatorPin:[...selectedValidatorPin],options:cloneInput(options),processGeneration,originalProcessId:handle.child.pid,originalLifetimeId:lifetimeId,genesis,validatorIdentity:identity,publicKeys:cloneInput(metadata.publicKeys),keys:keyRows,finalizedSlot,finalizedBlock,balances,records:cloneInput([...records.values()]),graphRecords:cloneInput([...graphRecords.values()]),historicalSignedPreparations:cloneInput([...signedPreparations]),bootstrapRecordsByAuthority:cloneInput(bootstrapRecordsByAuthority),nonceInfrastructureByAuthority:cloneInput(nonceInfrastructureByAuthority),signingUnresolved,boundNativeAsset,nativePersistenceFailed:Boolean(nativePersistenceFailure),isolationFailed:Boolean(isolationFailure),mutationGeneration:mutationGeneration.toString()};
      requireCondition(state.records.length<=64&&state.graphRecords.length===0,'SOLANA_RECOVERY_RECORD_BOUND');const privateRecord=await writePrivateRuntimeRecoveryV1(cwd,'wrapped-runtime-capture.json',state);await close();requireCondition(cleanupOutcome.ownedProcessStopped===true&&cleanupOutcome.forced===false&&cleanupOutcome.nativeOrderlyExit===true,'SOLANA_RECOVERY_REQUIRES_ORDERLY_NATIVE_TERMINAL');
      const files=await sealStoppedNativeFilesV1(cwd),captured={schema:'OWNED_FIXED_SOLANA_CAPTURE_V1',family:'solana',cwd,privateRecord,files,terminal:{ownedProcessStopped:true,forced:false,nativeOrderlyExit:true},processGeneration,genesis};await writePrivateRuntimeRecoveryV1(cwd,'wrapped-runtime-terminal.json',captured);recoveryCaptureResult=captured;return cloneInput(captured);
    } catch(error){try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'SOLANA_RECOVERY_CAPTURE_AND_STOP_FAILED');}throw error;}
    };
    async function prepareAtCurrentHead(selectedRoute, amount, wireKeyCommitment, expected = null) {
      if (usesNonce(selectedRoute)) return prepareNonceAtCurrentHead(selectedRoute, amount, wireKeyCommitment, expected);
      const source = sourceKey(selectedRoute), recipient = recipientAddress(selectedRoute);
      await healthy();
      let lastError;
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          const recent = await read('getLatestBlockhash', [{ commitment: 'confirmed' }]);
          const slot = Number(contextSlot(recent));
          const intent = { sourcePublicKey: source.publicBytes.toString('hex'),
            recipientPublicKey: base58Decode(recipient, 32).toString('hex'),
            recentBlockhash: expected?.intent.recentBlockhash ?? base58Decode(recent.value.blockhash, 32).toString('hex'),
            lamports: lamportsValue(amount).toString(), wireKeyCommitment: bytes32(wireKeyCommitment, true) };
          if (expected !== null) same(intent, expected.intent, 'SOLANA_RETAINED_INTENT_CHANGED');
          const messageBase64 = Buffer.from(encodeSolanaBindingMessage(intent), 'hex').toString('base64');
          const context = { commitment: 'confirmed', minContextSlot: slot };
          const [accounts, fee, blockHeight, blockhashValidity, rentExemptMinimum] = await Promise.all([
            read('getMultipleAccounts', [[source.address, recipient, MEMO_PROGRAM.address], { ...context, encoding: 'base64' }]),
            read('getFeeForMessage', [messageBase64, context]), read('getBlockHeight', [context]),
            read('isBlockhashValid', [base58Encode(Buffer.from(intent.recentBlockhash, 'hex')), context]),
            read('getMinimumBalanceForRentExemption', [0, { commitment: 'confirmed' }]),
          ]);
          const repeatedRecent = await read('getLatestBlockhash', [context]);
          const observations = { genesis: await read('getGenesisHash'), expectedGenesis: genesis,
            intent, recent, accounts, fee, blockHeight, blockhashValidity, repeatedRecent, rentExemptMinimum };
          if (expected !== null) {
            const previousContext = preparationContexts.get(expected);
            requireCondition(previousContext !== undefined, 'SOLANA_UNKNOWN_PREPARED_CONTEXT');
            const currentContext = revalidateSolanaPreparedState({ prepared: expected, context: previousContext, observations });
            preparationContexts.set(expected, currentContext); return expected;
          }
          const checked = checkedPreparedState(observations);
          preparationContexts.set(checked.prepared, checked.context); return checked.prepared;
        } catch (error) {
          // Only an inconsistent read context is retried, before any key use.
          // Funds/code/identity/expiry failures retain their exact refusal.
          if (!error.message.includes('SOLANA_PREPARATION_CONTEXT_CHANGED')) throw error;
          lastError = error;
        }
      }
      throw lastError ?? new Error('SOLANA_PREPARATION_CONTEXT_CHANGED');
    }
    async function prepareNonceAtCurrentHead(selectedRoute, amount, wireKeyCommitment, expected = null) {
      const source = sourceKey(selectedRoute), recipient = recipientAddress(selectedRoute);
      const selected = selectedNonce(selectedRoute), nonceInfrastructure = selected.infrastructure;
      if (expected !== null && selectedRoute.name !== 'deposit') nonceObservations.delete(expected);
      // Includes native health/isolation and every observation used below.
      const observationStarted = performance.now();
      await healthy(); let lastError;
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          const recent = await read('getLatestBlockhash', [{ commitment: 'confirmed' }]);
          const slot = Number(contextSlot(recent)), context = { commitment: 'confirmed', minContextSlot: slot };
          const accounts = await read('getMultipleAccounts', [[source.address, recipient, MEMO_PROGRAM.address, selected.account.address],
            { ...context, encoding: 'base64' }]);
          const nonceData = decodeSolanaNonceAccountData(accountBytes(accounts.value?.[3]?.data).toString('hex'));
          const intent = { sourcePublicKey: source.publicBytes.toString('hex'), recipientPublicKey: base58Decode(recipient, 32).toString('hex'),
            nonceAccountPublicKey: nonceInfrastructure.nonceAccountPublicKey, durableNonce: expected?.intent.durableNonce ?? nonceData.durableNonce,
            lamports: lamportsValue(amount).toString(), wireKeyCommitment: bytes32(wireKeyCommitment, true) };
          if (expected !== null) same(intent, expected.intent, 'SOLANA_RETAINED_INTENT_CHANGED');
          const message = encodeSolanaNonceBindingMessage(intent);
          const [fee, blockHeight, rentExemptMinimum, nonceRentExemptMinimum] = await Promise.all([
            read('getFeeForMessage', [Buffer.from(message, 'hex').toString('base64'), context]), read('getBlockHeight', [context]),
            read('getMinimumBalanceForRentExemption', [0, { commitment: 'confirmed' }]),
            read('getMinimumBalanceForRentExemption', [80, { commitment: 'confirmed' }]),
          ]);
          const observations = { genesis: await read('getGenesisHash'), expectedGenesis: genesis, intent, recent, accounts,
            fee, blockHeight, repeatedRecent: await read('getLatestBlockhash', [context]), rentExemptMinimum, nonceRentExemptMinimum };
          if (expected !== null) {
            const previousContext = preparationContexts.get(expected);
            requireCondition(previousContext !== undefined, 'SOLANA_UNKNOWN_PREPARED_CONTEXT');
            preparationContexts.set(expected, revalidateSolanaNoncePreparedState({ prepared: expected, context: previousContext, observations }));
            retainNonceObservation(expected, selectedRoute, observationStarted);
            return expected;
          }
          const checked = checkedNoncePreparedState(observations);
          preparationContexts.set(checked.prepared, checked.context);
          retainNonceObservation(checked.prepared, selectedRoute, observationStarted); return checked.prepared;
        } catch (error) {
          if (!error.message.includes('SOLANA_PREPARATION_CONTEXT_CHANGED')) throw error;
          lastError = error;
        }
      }
      throw lastError ?? new Error('SOLANA_PREPARATION_CONTEXT_CHANGED');
    }
    function retainNonceObservation(prepared, selectedRoute, started) {
      if (!['refund', 'redeem'].includes(selectedRoute.name)) return;
      requireCondition(!closed && !shuttingDown && !recoveryCapturing, 'SOLANA_RUNTIME_CLOSED');
      if (isolationFailure) throw isolationFailure;
      if (nativePersistenceFailure) throw nativePersistenceFailure;
      handle.assertAlive();
      nonceObservations.set(prepared, { started, prepared: frozenInput(cloneInput(prepared)),
        route: frozenInput(cloneInput(selectedRoute)), genesis, runtimeClose: close });
    }
    function assertPayoutNativeObservation(record, prepared, phase) {
      const observation = nonceObservations.get(prepared);
      requireCondition(observation !== undefined && preparationContexts.has(prepared), 'SOLANA_PAYOUT_FULL_NATIVE_OBSERVATION_REQUIRED');
      requireCondition(observation.runtimeClose === close && observation.genesis === genesis,
        'SOLANA_PAYOUT_NATIVE_OBSERVATION_RUNTIME');
      requireCondition(records.get(record.nativeId) === record && signedPreparations.get(record.nativeId) === prepared
        && prepared === activePrepared, 'SOLANA_PAYOUT_ORIGINAL_PRIVATE_IDENTITY');
      same(prepared, observation.prepared, 'SOLANA_PAYOUT_PREPARATION_CHANGED');
      same(activeRoute, observation.route, 'SOLANA_PAYOUT_ROUTE_CHANGED');
      requireCondition(record.route === observation.route.name && record.sourceRole === observation.route.sourceRole
        && record.recipientIndex === observation.route.recipientIndex, 'SOLANA_PAYOUT_ORIGINAL_ROUTE');
      assertRetainedNonceRoute(record);
      requireCondition(record.phase === phase && record.broadcastAttempts === (phase === 'SIGNED_NOT_BROADCAST' ? 0 : 1),
        'SOLANA_PAYOUT_ORIGINAL_ATTEMPT');
      same(record.intent, prepared.intent, 'SOLANA_PAYOUT_ORIGINAL_INTENT');
      requireCondition(record.genesis === genesis && record.preparedFee === prepared.funds.feeLamports,
        'SOLANA_PAYOUT_ORIGINAL_GENESIS_OR_FEE');
      const decoded = validateSolanaNonceBindingTransaction(record.nativeWire, prepared.intent);
      requireCondition(decoded.signatureHex === record.nativeId && decoded.transactionSHA256 === record.transactionSHA256
        && encodeSolanaNonceBindingMessage(prepared.intent) === prepared.unsignedWire, 'SOLANA_PAYOUT_ORIGINAL_BYTES');
      const elapsed = performance.now() - observation.started;
      requireCondition(Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 30_000, 'SOLANA_PAYOUT_NATIVE_OBSERVATION_TOO_OLD');
    }
    function assertPayoutTerminalWindows(prepared, authority) {
      const observation = nonceObservations.get(prepared), now = performance.now();
      const nativeElapsed = now - observation?.started, authorityElapsed = now - authority.originalAuditStarted;
      requireCondition(Number.isFinite(nativeElapsed) && nativeElapsed >= 0 && nativeElapsed < 30_000,
        'SOLANA_PAYOUT_NATIVE_OBSERVATION_TOO_OLD');
      requireCondition(Number.isFinite(authorityElapsed) && authorityElapsed >= 0 && authorityElapsed < 30_000,
        'SOLANA_PAYOUT_ORIGINAL_AUTHORITY_TOO_OLD');
    }
    async function assertPrepared(prepared) {
      activeNativeReadOperations++;
      try {
      readGeneration++;
      requireCondition(busy && (preSignReadWindow || preBroadcastReadWindow) && activePrepared !== null, 'SOLANA_PRE_SIGN_WINDOW_REQUIRED');
      same(prepared, activePrepared, 'SOLANA_PREPARED_IDENTITY');
      requireCondition(activeRoute !== null, 'SOLANA_RETAINED_ROUTE_REQUIRED');
      if (activeRoute.name !== null) assertOwnedCustodyIntent(activeRoute.name, roles, '2', activePrepared.intent);
      requireCondition(sourceKey(activeRoute).publicBytes.toString('hex') === activePrepared.intent.sourcePublicKey
        && base58Decode(recipientAddress(activeRoute), 32).toString('hex') === activePrepared.intent.recipientPublicKey, 'SOLANA_RETAINED_ROUTE_CHANGED');
      await prepareAtCurrentHead(activeRoute, activePrepared.intent.lamports,
        activePrepared.intent.wireKeyCommitment, activePrepared);
      requireCondition(!observationBusy && !inventoryBusy, 'SOLANA_PRE_SIGN_OBSERVATION_NOT_AWAITED');
      } finally { activeNativeReadOperations--; readGeneration++; }
    }
    async function transfer(selectedRoute, amount, wireKeyCommitment, callbacks) {
      const { recipientIndex } = selectedRoute;
      const nonce = usesNonce(selectedRoute);
      requireCondition(combined || custody === (selectedRoute.name !== null), 'SOLANA_RUNTIME_ROUTE_PROFILE');
      exactRecord(callbacks, ['beforeSign', 'onSigned', ...(nonce ? ['beforeBroadcast'] : []),
        ...(nonce && selectedRoute.name === 'deposit' ? ['beforeSend', 'assertBeforeSend'] : [])]);
      const beforeSign = callbacks.beforeSign, onSigned = callbacks.onSigned, beforeBroadcast = callbacks.beforeBroadcast;
      const beforeSend = callbacks.beforeSend, assertBeforeSend = callbacks.assertBeforeSend;
      requireCondition(typeof beforeSign === 'function' && typeof onSigned === 'function', 'SOLANA_REQUIRED_SIGNING_CALLBACKS');
      if (nonce) requireCondition(typeof beforeBroadcast === 'function', 'SOLANA_REQUIRED_BROADCAST_CALLBACK');
      if (nonce && selectedRoute.name === 'deposit') requireCondition(typeof beforeSend === 'function' && typeof assertBeforeSend === 'function',
        'SOLANA_REQUIRED_INGRESS_FINAL_SEND_CALLBACKS');
      lamportsValue(amount); bytes32(wireKeyCommitment, true);
      requireCondition(Number.isSafeInteger(recipientIndex) && !Object.is(recipientIndex, -0)
        && recipientIndex >= 0 && recipientIndex < recipientAddresses.length, 'SOLANA_INVALID_RECIPIENT_INDEX');
      requireCondition(!busy && !observationBusy && !inventoryBusy && !closed && !shuttingDown && !recoveryCapturing, 'SOLANA_OPERATION_BUSY_OR_CLOSED');
      requireCondition(!signingUnresolved, 'SOLANA_PRIOR_SIGNING_UNRESOLVED');
      requireCondition(!allRecords().some(record => record.phase !== 'OBSERVED_FINALIZED'), 'SOLANA_PRIOR_TRANSFER_UNRESOLVED');
      mutationGeneration++; busy = true;
      activeRoute = selectedRoute; let record, keyAuthorityV4, nativeKeyAuditStarted;
      try {
        activePrepared = await prepareAtCurrentHead(selectedRoute, amount, wireKeyCommitment);
        if (selectedRoute.name !== null) assertOwnedCustodyIntent(selectedRoute.name, roles, '2', activePrepared.intent);
        preSignReadWindow = true;
        try {
          const keyAck = await beforeSign(activePrepared);
          if (['refund', 'redeem'].includes(selectedRoute.name)) {
            keyAuthorityV4 = keyAck;
            const observation = nonceObservations.get(activePrepared);
            requireCondition(observation && observation.runtimeClose === close && observation.genesis === genesis,
              'SOLANA_KEY_ORIGINAL_NATIVE_OBSERVATION');
            same(activePrepared, observation.prepared, 'SOLANA_KEY_NATIVE_PREPARATION_CHANGED');
            same(activeRoute, observation.route, 'SOLANA_KEY_NATIVE_ROUTE_CHANGED');
            nativeKeyAuditStarted = observation.started;
          } else requireCondition(keyAck === undefined, 'SOLANA_BEFORE_SIGN_CALLBACK_MUST_ASSERT');
        } finally { preSignReadWindow = false; }
        requireCondition(!observationBusy && !inventoryBusy, 'SOLANA_PRE_SIGN_OBSERVATION_NOT_AWAITED');
        requireCondition(!closed && !shuttingDown && !recoveryCapturing, 'SOLANA_RUNTIME_CLOSED');
        if (isolationFailure) throw isolationFailure;
        if (nativePersistenceFailure) throw nativePersistenceFailure;
        handle.assertAlive();
        // Finish native codecs and key-object preparation before the final
        // one-use assertion. No await or costly work remains before Ed25519.
        const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, sourceKey(selectedRoute).seed]), type: 'pkcs8', format: 'der' });
        const message = Buffer.from(activePrepared.unsignedWire, 'hex');
        if (['refund', 'redeem'].includes(selectedRoute.name)) {
          requireCondition((nonce ? encodeSolanaNonceBindingMessage : encodeSolanaBindingMessage)(activePrepared.intent)
            === activePrepared.unsignedWire, 'SOLANA_ORIGINAL_KEY_WIRE');
          assertOwnedCustodyIntent(selectedRoute.name, roles, '2', activePrepared.intent);
          requireCondition(!closed && !shuttingDown && !recoveryCapturing, 'SOLANA_RUNTIME_CLOSED');
          if (isolationFailure) throw isolationFailure;
          if (nativePersistenceFailure) throw nativePersistenceFailure;
          handle.assertAlive();
          const authorityAuditStarted = originalKeyControllerV4.consumeNativeClaimOriginalKeyAuthorityV4(keyAuthorityV4, 'payout', close,
            genesis, selectedRoute.name, activePrepared);
          const terminalNow = performance.now(), elapsed = terminalNow - nativeKeyAuditStarted;
          const authorityElapsed = terminalNow - authorityAuditStarted;
          requireCondition(Number.isFinite(authorityElapsed) && authorityElapsed >= 0 && authorityElapsed < 30_000, 'SOLANA_KEY_ORIGINAL_AUTHORITY_TOO_OLD');
          requireCondition(Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 30_000, 'SOLANA_KEY_NATIVE_OBSERVATION_TOO_OLD');
        }
        signingUnresolved = true;
        const signature = sign(null, message, privateKey);
        const nativeWire = Buffer.concat([Buffer.from([1]), signature, message]).toString('base64');
        const decoded = (nonce ? validateSolanaNonceBindingTransaction : validateSolanaBindingTransaction)(nativeWire, activePrepared.intent), nativeId = decoded.signatureHex;
        requireCondition(!records.has(nativeId) && !graphRecords.has(nativeId), 'SOLANA_SIGNED_IDENTITY_ALREADY_RECORDED');
        record = { ...(selectedRoute.name !== null ? { route: selectedRoute.name, sourceRole: selectedRoute.sourceRole, preparedFee: activePrepared.funds.feeLamports } : {}), genesis, nativeId, recipientIndex, intent: cloneInput(activePrepared.intent), nativeWire,
          transactionSHA256: decoded.transactionSHA256, phase: 'SIGNED_NOT_BROADCAST', broadcastAttempts: 0,
          ...(nonce ? { failureObservation: null } : { lastValidBlockHeight: activePrepared.funds.lastValidBlockHeight }),
          ...(selectedRoute.name === 'deposit' ? {
            originalPreparedSlot: preparationContexts.get(activePrepared).slot, externalSubmissionObserved: false,
          } : {}), observation: null };
        routeRecords(selectedRoute).set(nativeId, record);
        if (nonce) signedPreparations.set(nativeId, activePrepared);
        signingUnresolved = false;
        // Own local fsync plus the gate's durable custody record both precede
        // any send. A rejected callback leaves a known, never-resend identity.
        await persistNative(record);
        const signedPayload = frozenInput({ nativeWire });
        const signedAck = selectedRoute.name !== null ? await reservationReads.run(() => onSigned(signedPayload),
          () => requireCondition(!observationBusy && !inventoryBusy, 'SOLANA_SIGNED_READ_NOT_AWAITED'))
          : await onSigned(signedPayload);
        requireCondition(signedAck === undefined, 'SOLANA_SIGNED_CALLBACK_MUST_ASSERT');
        return await broadcastRetained(record, beforeBroadcast, beforeSend, assertBeforeSend);
      } catch (error) {
        // Once signed, even a known unsent wire remains latched. No public
        // method can reset this map, regenerate a key or replay the transaction.
        if (record) error.nativeId = record.nativeId;
        throw error;
      } finally { activePrepared = null; activeRoute = null; preSignReadWindow = false; preBroadcastReadWindow = false; busy = false; }
    }
    async function broadcastRetained(record, beforeBroadcast, beforeSend = null, assertBeforeSend = null) {
      const nonce = usesNonce(activeRoute);
      await healthy();
      const payout = nonce && ['refund', 'redeem'].includes(record.route);
      let broadcastGuardStarted, payoutAuthority;
      if (nonce) {
        assertRetainedNonceRoute(record);
        if (record.route === 'deposit') await assertOriginalIngressUnobserved(record);
        assertSolanaNonceFirstSendState({ route: record.route, phase: record.phase, broadcastAttempts: record.broadcastAttempts,
          signingUnresolved, nativeId: record.nativeId, transactionSHA256: record.transactionSHA256,
          nativeWire: record.nativeWire, intent: record.intent, unsignedWire: activePrepared.unsignedWire });
        requireCondition(typeof beforeBroadcast === 'function', 'SOLANA_REQUIRED_BROADCAST_CALLBACK');
        await prepareNonceAtCurrentHead(activeRoute, record.intent.lamports, record.intent.wireKeyCommitment, activePrepared);
        preBroadcastReadWindow = true; broadcastGuardStarted = performance.now();
        try {
          const ack = await reservationReads.run(() => beforeBroadcast(activePrepared),
            () => requireCondition(!observationBusy && !inventoryBusy, 'SOLANA_BROADCAST_READ_NOT_AWAITED'));
          if (payout) {
            assertPayoutNativeObservation(record, activePrepared, 'SIGNED_NOT_BROADCAST');
            payoutAuthority = payoutController.openNativeClaimSolanaPayoutAuthority(ack, close, genesis, activePrepared, record);
          } else requireCondition(ack === undefined, 'SOLANA_BROADCAST_CALLBACK_MUST_ASSERT');
        } finally { preBroadcastReadWindow = false; }
        if (record.route === 'deposit') await assertOriginalIngressUnobserved(record);
        if (!payout) requireCondition(performance.now() - broadcastGuardStarted < 30_000, 'SOLANA_BROADCAST_AUDIT_TOO_OLD');
        requireCondition(!closed && !shuttingDown && !recoveryCapturing, 'SOLANA_RUNTIME_CLOSED');
        if (isolationFailure) throw isolationFailure;
        if (nativePersistenceFailure) throw nativePersistenceFailure;
        handle.assertAlive();
      }
      if (payout) {
        assertPayoutNativeObservation(record, activePrepared, 'SIGNED_NOT_BROADCAST');
        assertPayoutTerminalWindows(activePrepared, payoutAuthority);
      }
      let assertLatchContinuation;
      if (payout) {
        const expected = cloneInput(readPayoutAuditState());
        requireCondition(records.get(record.nativeId) === record && record.phase === 'SIGNED_NOT_BROADCAST' && record.broadcastAttempts === 0,
          'SOLANA_LATCH_ORIGINAL_RECORD_REQUIRED');
        for (const name of ['transfers', 'custodyTransfers']) {
          const matches = expected[name].filter(item => item.nativeId === record.nativeId);
          requireCondition(matches.length === 1, 'SOLANA_LATCH_EXACT_RECORD');
          matches[0].phase = 'BROADCAST_UNKNOWN'; matches[0].broadcastAttempts = 1;
        }
        requireCondition(!expected.graphTransfers.some(item => item.nativeId === record.nativeId), 'SOLANA_LATCH_WRONG_NAMESPACE');
        let consumed = false;
        assertLatchContinuation = () => {
          requireCondition(!consumed, 'SOLANA_LATCH_CONTINUATION_USED'); consumed = true;
          requireCondition(records.get(record.nativeId) === record, 'SOLANA_LATCH_ORIGINAL_RECORD_CHANGED');
          same(readPayoutAuditState(), expected, 'SOLANA_LATCH_UNEXPECTED_NATIVE_STATE_CHANGE');
        };
      }
      if (payout) assertPayoutTerminalWindows(activePrepared, payoutAuthority);
      record.phase = 'BROADCAST_UNKNOWN'; record.broadcastAttempts = 1;
      await persistNative(record); // The latch precedes the sole possible send.
      try {
        if (payout) {
          // Only fixed assertions returned by the genuine original token run.
          // No caller callback may substitute authority after its completion.
          await payoutAuthority.beforeSend(activePrepared);
        } else if (nonce) {
          requireCondition(typeof beforeSend === 'function' && typeof assertBeforeSend === 'function',
            record.route === 'deposit' ? 'SOLANA_REQUIRED_INGRESS_FINAL_SEND_CALLBACKS'
              : 'SOLANA_REQUIRED_PAYOUT_FINAL_SEND_CALLBACKS');
          // Native history/preparation and latch fsync are already complete.
          // The owned controller now checks its original completed authorization,
          // EVM head and keeper. Payouts cannot collect or sign again here.
          requireCondition(await beforeSend(activePrepared) === undefined, 'SOLANA_FINAL_SEND_ASSERT_ONLY');
          // This is deliberately synchronous: a returned Promise rejects.
          requireCondition(assertBeforeSend(activePrepared) === undefined, 'SOLANA_FINAL_SEND_SYNC_ASSERT_ONLY');
        }
        // Fsync can yield while shutdown or socket isolation fails. Recheck
        // synchronously after it; no await/RPC intervenes before the sole send.
        requireCondition(!closed && !shuttingDown && !recoveryCapturing, 'SOLANA_RUNTIME_CLOSED');
        if (isolationFailure) throw isolationFailure;
        if (nativePersistenceFailure) throw nativePersistenceFailure;
        handle.assertAlive();
        if (payout) {
          assertPayoutNativeObservation(record, activePrepared, 'BROADCAST_UNKNOWN');
          payoutAuthority.assertBeforeSend(activePrepared);
          assertLatchContinuation();
          // Full synchronous codec/identity checks above may themselves consume
          // time. Check both original starts at one final owned-clock instant.
          assertPayoutTerminalWindows(activePrepared, payoutAuthority);
        }
        else if (nonce) requireCondition(performance.now() - broadcastGuardStarted < 30_000, 'SOLANA_BROADCAST_AUDIT_TOO_OLD');
        const returned = await sendOwnedSolanaTransaction(endpoint, record.nativeWire);
        requireCondition(returned === base58Encode(Buffer.from(record.nativeId, 'hex')), 'SOLANA_BROADCAST_SIGNATURE_MISMATCH');
        record.phase = 'BROADCAST'; await persistNative(record);
        return { nativeId: record.nativeId, transactionSHA256: record.transactionSHA256 };
      } catch (cause) {
        record.broadcastFailure = { category: /^SOLANA_RPC_[A-Z_]+$/.test(cause.message ?? '')
          ? cause.message : 'SOLANA_RPC_RESPONSE_UNAVAILABLE', rpcCode: Number.isSafeInteger(cause.rpcCode) ? cause.rpcCode : null };
        await persistNative(record);
        const error = new Error('SOLANA_BROADCAST_UNKNOWN_OBSERVE_EXACT_SIGNATURE', { cause });
        error.nativeId = record.nativeId; throw error;
      }
    }
    async function resumeReservedPayout(selectedRoute, raw, callbacks) {
      const request = cloneInput(raw); exactRecord(request, ['nativeId']);
      exactRecord(callbacks, ['beforeBroadcast']);
      const { beforeBroadcast } = callbacks;
      requireCondition(typeof beforeBroadcast === 'function', 'SOLANA_REQUIRED_BROADCAST_CALLBACK');
      requireCondition(usesNonce(selectedRoute) && ['refund', 'redeem'].includes(selectedRoute.name),
        'SOLANA_NONCE_PAYOUT_ROUTE_REQUIRED');
      requireCondition(!busy && !observationBusy && !inventoryBusy && !closed && !shuttingDown && !recoveryCapturing, 'SOLANA_OPERATION_BUSY_OR_CLOSED');
      const record = recordFor(request.nativeId), prepared = signedPreparations.get(request.nativeId);
      requireCondition(prepared !== undefined, 'SOLANA_ORIGINAL_PREPARATION_UNAVAILABLE');
      requireCondition(record.route === selectedRoute.name && record.recipientIndex === selectedRoute.recipientIndex,
        'SOLANA_OTHER_ROUTE');
      assertSolanaNonceFirstSendState({ route: record.route, phase: record.phase, broadcastAttempts: record.broadcastAttempts,
        signingUnresolved, nativeId: record.nativeId, transactionSHA256: record.transactionSHA256,
        nativeWire: record.nativeWire, intent: record.intent, unsignedWire: prepared.unsignedWire });
      requireCondition(!allRecords().some(other => other !== record && other.phase !== 'OBSERVED_FINALIZED'),
        'SOLANA_PRIOR_TRANSFER_UNRESOLVED');
      mutationGeneration++; busy = true; activeRoute = selectedRoute; activePrepared = prepared;
      try { return await broadcastRetained(record, beforeBroadcast); }
      catch (error) { error.nativeId = record.nativeId; throw error; }
      finally { activePrepared = null; activeRoute = null; preBroadcastReadWindow = false; busy = false; }
    }
    async function resumeReservedIngress(selectedRoute, raw, callbacks) {
      const request = cloneInput(raw); exactRecord(request, ['nativeId']); exactRecord(callbacks, ['beforeBroadcast', 'beforeSend', 'assertBeforeSend']);
      requireCondition(selectedRoute.name === 'deposit' && usesNonce(selectedRoute), 'SOLANA_NONCE_INGRESS_ROUTE_REQUIRED');
      requireCondition(typeof callbacks.beforeBroadcast === 'function' && typeof callbacks.beforeSend === 'function'
        && typeof callbacks.assertBeforeSend === 'function', 'SOLANA_REQUIRED_INGRESS_FINAL_SEND_CALLBACKS');
      requireCondition(!busy && !observationBusy && !inventoryBusy && !closed && !shuttingDown && !recoveryCapturing, 'SOLANA_OPERATION_BUSY_OR_CLOSED');
      const record = recordFor(request.nativeId), prepared = signedPreparations.get(request.nativeId);
      requireCondition(record.route === 'deposit' && record.recipientIndex === selectedRoute.recipientIndex, 'SOLANA_OTHER_ROUTE');
      requireCondition(prepared !== undefined && preparationContexts.has(prepared), 'SOLANA_ORIGINAL_PREPARATION_UNAVAILABLE');
      requireCondition(!allRecords().some(other => other !== record && other.phase !== 'OBSERVED_FINALIZED'),
        'SOLANA_PRIOR_TRANSFER_UNRESOLVED');
      // Fence concurrency before any await. Observations precede recovery and
      // retain a permanent external-submission fence even for nonfinal status.
      mutationGeneration++; busy = true; activeRoute = selectedRoute; activePrepared = prepared;
      try {
        await assertOriginalIngressUnobserved(record);
        assertSolanaNonceFirstSendState({ route: record.route, phase: record.phase, broadcastAttempts: record.broadcastAttempts,
          signingUnresolved, nativeId: record.nativeId, transactionSHA256: record.transactionSHA256,
          nativeWire: record.nativeWire, intent: record.intent, unsignedWire: prepared.unsignedWire });
        return await broadcastRetained(record, callbacks.beforeBroadcast, callbacks.beforeSend, callbacks.assertBeforeSend);
      } catch (error) { error.nativeId = record.nativeId; throw error; }
      finally { activePrepared = null; activeRoute = null; preBroadcastReadWindow = false; busy = false; }
    }
    async function readIngressFirstSendObservation(record) {
      requireCondition(record.route === 'deposit', 'SOLANA_NONCE_INGRESS_ROUTE_REQUIRED');
      assertRetainedNonceRoute(record); await healthy();
      const originalSlot = inputUint(record.originalPreparedSlot);
      const signature = base58Encode(Buffer.from(record.nativeId, 'hex'));
      const statuses = await read('getSignatureStatuses', [[signature], { searchTransactionHistory: true }]);
      requireCondition(Array.isArray(statuses.value) && statuses.value.length === 1, 'SOLANA_STATUS_SHAPE');
      // Persist each positive observation before the next read can fail. A
      // partial read must never erase a pending/external-submission fence.
      if (statuses.value[0] !== null && record.externalSubmissionObserved !== true) {
        record.externalSubmissionObserved = true; await persistNative(record);
      }
      const transaction = await read('getTransaction', [signature,
        { encoding: 'base64', commitment: 'finalized', maxSupportedTransactionVersion: 0 }]);
      if (transaction !== null && record.externalSubmissionObserved !== true) {
        record.externalSubmissionObserved = true; await persistNative(record);
      }
      const [minimumSlot, firstBlock] = await Promise.all([read('minimumLedgerSlot'), read('getFirstAvailableBlock')]);
      requireCondition(contextSlot(statuses) >= originalSlot, 'SOLANA_INGRESS_HISTORY_CONTEXT_ROLLBACK');
      // Read failures throw, and pruned history is explicitly unavailable.
      // Null finalized history alone never clears a prior nonfinal observation.
      const historyAvailable = safeInteger(minimumSlot, 'SOLANA_INVALID_MINIMUM_LEDGER_SLOT') <= originalSlot
        && safeInteger(firstBlock, 'SOLANA_INVALID_FIRST_AVAILABLE_BLOCK') <= originalSlot;
      const found = statuses.value[0] !== null || transaction !== null;
      return frozenInput({ nativeId: record.nativeId,
        status: found || record.externalSubmissionObserved ? 'found' : historyAvailable ? 'not-found' : 'unavailable',
        historyAvailable, statusRead: true, transactionRead: true });
    }
    async function assertOriginalIngressUnobserved(record) {
      const observation = await readIngressFirstSendObservation(record);
      requireCondition(record.externalSubmissionObserved === false, 'SOLANA_INGRESS_EXTERNAL_SUBMISSION_FENCED');
      requireCondition(observation.status === 'not-found' && observation.historyAvailable,
        'SOLANA_INGRESS_ORIGINAL_HISTORY_UNAVAILABLE_OR_OBSERVED');
      return observation;
    }
    async function observeReservedIngress(record) {
      readGeneration++;
      requireCondition(record.route === 'deposit', 'SOLANA_NONCE_INGRESS_ROUTE_REQUIRED');
      requireCondition(!observationBusy && !inventoryBusy, 'SOLANA_OBSERVATION_BUSY');
      const ownsWriter = !busy;
      if (ownsWriter) busy = true;
      else requireCondition(preBroadcastReadWindow && reservationReads.active
        && record.phase === 'SIGNED_NOT_BROADCAST' && record.broadcastAttempts === 0,
        'SOLANA_INGRESS_STAGED_OBSERVATION_WINDOW');
      observationBusy = true;
      try { return await readIngressFirstSendObservation(record); }
      finally { observationBusy = false; if (ownsWriter) busy = false; }
    }
    function recordFor(nativeId, namespace = records) {
      requireCondition(typeof nativeId === 'string' && nativeId.length === 128
        && /^[0-9a-f]+$/.exec(nativeId)?.[0] === nativeId, 'SOLANA_NATIVE_ID');
      const record = namespace.get(nativeId); requireCondition(record, 'SOLANA_UNKNOWN_SIGNED_IDENTITY'); return record;
    }
    async function adverse(record, reason) {
      record.phase = 'OBSERVED_ADVERSE'; record.adverseReason = reason;
      await persistNative(record); return { status: 'adverse', reason };
    }
    async function readObservation(record) {
      if (Object.hasOwn(record, 'route')) assertOwnedCustodyIntent(record.route, roles, '2', record.intent);
      await healthy();
      const nonce = Object.hasOwn(record.intent, 'nonceAccountPublicKey');
      if (nonce) assertRetainedNonceRoute(record);
      // A known execution failure remains adverse while a later finalized
      // exact-wire read can still establish its consumed fee. Never clear it.
      if (record.phase === 'OBSERVED_ADVERSE' && (!nonce || record.failureObservation !== null))
        return { status: 'adverse', reason: 'SOLANA_ADVERSE_LATCHED' };
      const signature = base58Encode(Buffer.from(record.nativeId, 'hex'));
      const statusResponse = await read('getSignatureStatuses', [[signature], { searchTransactionHistory: true }]);
      requireCondition(Array.isArray(statusResponse.value) && statusResponse.value.length === 1, 'SOLANA_STATUS_SHAPE');
      const status = statusResponse.value[0];
      if (record.route === 'deposit' && status !== null && record.externalSubmissionObserved !== true) {
        record.externalSubmissionObserved = true; await persistNative(record);
      }
      if (status?.err !== null && status?.err !== undefined) {
        await adverse(record, 'SOLANA_OBSERVED_EXECUTION_FAILURE');
        if (!nonce || status.confirmationStatus !== 'finalized') return { status: 'adverse', reason: 'SOLANA_OBSERVED_EXECUTION_FAILURE' };
      }
      if (status === null) return record.phase === 'OBSERVED_ADVERSE'
        ? { status: 'adverse', reason: 'SOLANA_ADVERSE_LATCHED' } : { status: 'unknown', reason: 'SOLANA_HISTORY_UNKNOWN' };
      if (status?.confirmationStatus !== 'finalized') return record.phase === 'OBSERVED_ADVERSE'
        ? { status: 'adverse', reason: 'SOLANA_ADVERSE_LATCHED' } : { status: 'pending', reason: 'SOLANA_NOT_YET_FINALIZED' };
      const transaction = await read('getTransaction', [signature,
        { encoding: 'base64', commitment: 'finalized', maxSupportedTransactionVersion: 0 }]);
      if (transaction === null) return record.phase === 'OBSERVED_ADVERSE'
        ? { status: 'adverse', reason: 'SOLANA_ADVERSE_LATCHED' } : { status: 'unknown', reason: 'SOLANA_TRANSACTION_HISTORY_UNKNOWN' };
      // Persist a known adverse result immediately; a later independent query
      // failure must not downgrade it into a clearable unknown observation.
      if (transaction.meta?.err !== null && transaction.meta?.err !== undefined) {
        await adverse(record, 'SOLANA_OBSERVED_EXECUTION_FAILURE');
        if (!nonce) return { status: 'adverse', reason: 'SOLANA_OBSERVED_EXECUTION_FAILURE' };
      }
      const failed = nonce && status.err !== null && status.err !== undefined;
      if (Array.isArray(transaction.transaction) && transaction.transaction[1] === 'base64'
        && transaction.transaction[0] !== record.nativeWire) return adverse(record, 'SOLANA_OBSERVED_WIRE_CHANGED');
      if (record.observation !== null && String(transaction.slot) !== record.observation.transactionSlot)
        return adverse(record, 'SOLANA_FINALIZED_HISTORY_CHANGED');
      safeInteger(transaction.slot, 'SOLANA_INVALID_SLOT');
      const currentSlot = await read('getSlot', [{ commitment: 'finalized' }]);
      const blockOptions = { commitment: 'finalized', transactionDetails: 'signatures', rewards: false, maxSupportedTransactionVersion: 0 };
      const block = await read('getBlock', [transaction.slot, blockOptions]);
      if (block === null) return record.phase === 'OBSERVED_ADVERSE'
        ? { status: 'adverse', reason: 'SOLANA_ADVERSE_LATCHED' } : { status: 'unknown', reason: 'SOLANA_BLOCK_HISTORY_UNKNOWN' };
      if (Array.isArray(block.signatures) && block.signatures.filter(item => item === signature).length !== 1)
        return adverse(record, 'SOLANA_BLOCK_MEMBERSHIP_MISSING');
      const [again, transactionAgain, blockAgain] = await Promise.all([
        read('getSignatureStatuses', [[signature], { searchTransactionHistory: true }]),
        read('getTransaction', [signature, { encoding: 'base64', commitment: 'finalized', maxSupportedTransactionVersion: 0 }]),
        read('getBlock', [transaction.slot, blockOptions]),
      ]);
      const currentSlotAgain = await read('getSlot', [{ commitment: 'finalized' }]);
      requireCondition(Array.isArray(again.value) && again.value.length === 1, 'SOLANA_STATUS_SHAPE');
      if (again.value[0] === null || transactionAgain === null || blockAgain === null)
        return record.phase === 'OBSERVED_ADVERSE' ? { status: 'adverse', reason: 'SOLANA_ADVERSE_LATCHED' }
          : { status: 'unknown', reason: 'SOLANA_REPEATED_HISTORY_UNKNOWN' };
      if ((again.value[0].err !== null && again.value[0].err !== undefined)
        || (transactionAgain.meta?.err !== null && transactionAgain.meta?.err !== undefined)) {
        await adverse(record, 'SOLANA_OBSERVED_EXECUTION_FAILURE');
        if (!nonce) return { status: 'adverse', reason: 'SOLANA_OBSERVED_EXECUTION_FAILURE' };
      }
      const expected = { genesis, intent: record.intent, nativeWire: record.nativeWire,
        nativeId: record.nativeId, transactionSHA256: record.transactionSHA256 };
      const observedGenesis = await read('getGenesisHash'); let observed;
      try {
        observed = (failed ? validateSolanaNonceFailureObservation : nonce ? validateSolanaNonceBindingObservation
          : validateSolanaBindingObservation)({ expected, genesis: observedGenesis, status,
          transaction, currentSlot, block, statusAgain: again.value[0], transactionAgain, blockAgain, currentSlotAgain });
      } catch (error) {
        const code = error.message.split('\n')[0];
        const contradictions = ['SOLANA_OBSERVED_WIRE_CHANGED', 'SOLANA_OBSERVATION_CHANGED', 'SOLANA_BALANCE_DELTA_MISMATCH',
          'SOLANA_BLOCK_MEMBERSHIP_MISSING', 'SOLANA_SLOT_MISMATCH', 'SOLANA_BLOCK_CONTEXT', 'SOLANA_OBSERVED_SLOT_ROLLBACK',
          'SOLANA_NOT_FINALIZED', 'SOLANA_INVALID_BALANCES', 'SOLANA_UNEXPECTED_INNER_INSTRUCTIONS',
          'SOLANA_UNEXPECTED_TOKEN_BALANCES', 'SOLANA_UNEXPECTED_LOADED_ADDRESSES', 'SOLANA_TRANSACTION_FAILED'];
        if (contradictions.includes(code)) return adverse(record, code);
        throw error;
      }
      if (failed) {
        record.failureObservation = cloneInput(observed);
        await persistNative(record);
        try {
          const selected = assertRetainedNonceRoute(record);
          const snapshot = await read('getAccountInfo', [selected.account.address,
            { commitment: 'finalized', minContextSlot: Number(observed.transactionSlot), encoding: 'base64' }]);
          const account = nonceAccount(snapshot.value, record.intent.nonceAccountPublicKey, record.intent.sourcePublicKey,
            BigInt(selected.infrastructure.bootstrapRentLamports));
          record.failureObservation.nonceAfter = { ...account, observedSlot: contextSlot(snapshot).toString() };
          record.failureObservation.nonceAdvanced = account.durableNonce !== record.intent.durableNonce;
          await persistNative(record);
        } catch {
          // Finalized fee evidence survives unavailable nonce-account history.
          // No current nonce value can authorize a replacement or discharge.
          if (nativePersistenceFailure) throw nativePersistenceFailure;
        }
        return adverse(record, observed.feeLamports === record.preparedFee
          ? 'SOLANA_OBSERVED_EXECUTION_FAILURE' : 'SOLANA_PREPARED_FEE_CHANGED');
      }
      if (record.phase === 'OBSERVED_ADVERSE') return { status: 'adverse', reason: 'SOLANA_ADVERSE_LATCHED' };
      if (Object.hasOwn(record, 'route') && observed.feeLamports !== record.preparedFee) return adverse(record, 'SOLANA_PREPARED_FEE_CHANGED');
      await inspectOwnedLoopbackSockets(child.pid, [rpcPort, rpcPort + 1, faucetPort]);
      if (record.observation !== null) {
        for (const field of ['blockId', 'blockHeight', 'transactionSlot', 'parentSlot']) {
          if (observed[field] !== record.observation[field]) {
            return adverse(record, 'SOLANA_FINALIZED_HISTORY_CHANGED');
          }
        }
      }
      record.phase = 'OBSERVED_FINALIZED'; record.observation = cloneInput(observed); await persistNative(record);
      return { status: 'observed', ...cloneInput(observed) };
    }
    async function observeRecord(record, options = {}) {
      readGeneration++;
      exactRecord(options, Object.hasOwn(options, 'timeoutMs') ? ['timeoutMs'] : []);
      const timeoutMs = options.timeoutMs ?? 45_000;
      requireCondition(Number.isSafeInteger(timeoutMs) && !Object.is(timeoutMs, -0) && timeoutMs >= 0 && timeoutMs <= 120_000,
        'SOLANA_INVALID_TIMEOUT');
      requireCondition(!observationBusy && !inventoryBusy, 'SOLANA_OBSERVATION_BUSY');
      const ownsWriter = !busy;
      if (ownsWriter) busy = true;
      else requireCondition((preSignReadWindow || reservationReads.allowsObservation(record.phase))
        && record.phase === 'OBSERVED_FINALIZED', 'SOLANA_OPERATION_BUSY');
      observationBusy = true;
      try {
        const deadline = Date.now() + timeoutMs;
        for (;;) {
          const observed = await readObservation(record);
          if (observed.status === 'observed' || observed.status === 'adverse' || Date.now() >= deadline) return frozenInput(observed);
          await sleep(200);
        }
      } finally { observationBusy = false; if (ownsWriter) busy = false; }
    }
    function bindNativeAsset(asset) {
      bytes32(asset, true);
      requireCondition(boundNativeAsset === null || boundNativeAsset === asset, 'SOLANA_NATIVE_ASSET_REBOUND');
      boundNativeAsset = asset; return asset;
    }
    async function inventory() {
      readGeneration++;
      requireCondition(custody && arguments.length === 0, 'SOLANA_CUSTODY_INVENTORY_ONLY');
      requireCondition(!inventoryBusy && !observationBusy && (!busy || preSignReadWindow || reservationReads.active), 'SOLANA_INVENTORY_BUSY');
      const ownsWriter = !busy; if (ownsWriter) busy = true; inventoryBusy = true;
      try {
        await healthy();
        const addresses = [...Object.values(roles).map(role => role.address),
          ...nonceAuthorityRoles.flatMap(role => [nonceKeysByAuthority[role].payer.address, nonceKeysByAuthority[role].account.address])];
        requireCondition(addresses.length === 7 && new Set(addresses).size === 7, 'SOLANA_INVENTORY_SEVEN_DISTINCT_ACCOUNTS');
        for (let attempt = 0; attempt < 6; attempt++) {
          const first = projectRPCAccounts(await read('getMultipleAccounts', [addresses,
            { commitment: 'finalized', encoding: 'base64' }]), 7);
          const slot = Number(contextSlot(first)), context = { commitment: 'finalized', minContextSlot: slot };
          const rent = safeInteger(await read('getMinimumBalanceForRentExemption', [0, { commitment: 'finalized' }]), 'SOLANA_INVALID_RENT_MINIMUM');
          const nonceRent = safeInteger(await read('getMinimumBalanceForRentExemption', [80, { commitment: 'finalized' }]), 'SOLANA_INVALID_RENT_MINIMUM');
          const block = await read('getBlock', [slot, { commitment: 'finalized', transactionDetails: 'none', rewards: false,
            maxSupportedTransactionVersion: 0 }]);
          const again = projectRPCAccounts(await read('getMultipleAccounts', [addresses, { ...context, encoding: 'base64' }]), 7);
          if (contextSlot(again) !== BigInt(slot)) continue;
          same(first.value, again.value, 'SOLANA_INVENTORY_CHANGED');
          requireCondition(block !== null && rent > 0n, 'SOLANA_INVENTORY_CONTEXT_UNAVAILABLE');
          const blockId = base58Decode(block.blockhash, 32).toString('hex');
          const accounts = Object.entries(roles).map(([role, account], i) => {
            const checked = systemAccount(first.value[i], account.endpoint, false);
            return { role, ...account, exists: checked.exists, total: checked.lamports,
              spendable: checked.lamports, rentExemptMinimum: rent.toString() };
          });
          await healthy();
          const feeAudit = ownedCustodyFeeAudit([...records.values()].map(record => ({
            nativeId: record.nativeId, route: record.route, phase: record.phase, amount: record.intent.lamports,
            preparedFee: record.preparedFee, actualFee: record.observation?.feeLamports ?? record.failureObservation?.feeLamports ?? null,
            broadcastAttempts: record.broadcastAttempts })));
          const infrastructure = Object.fromEntries(nonceAuthorityRoles.map((role, i) => {
            const pin = nonceInfrastructureByAuthority[role], index = 3 + 2 * i;
            requireCondition(pin.authorityPublicKey === roles[role].endpoint, 'SOLANA_NONCE_ROUTE_AUTHORITY');
            return [role, auditOwnedSolanaNonceInfrastructure({ ...pin,
              payerBalance: systemAccount(first.value[index], pin.payerPublicKey, true).lamports,
              nonceAccount: nonceAccount(first.value[index + 1], pin.nonceAccountPublicKey, roles[role].endpoint, nonceRent),
              nonceRentExemptMinimum: nonceRent.toString() })];
          }));
          return frozenInput({ family: '2', genesis: base58Decode(genesis, 32).toString('hex'), asset: boundNativeAsset,
            nativeHead: { id: blockId, height: safeInteger(block.blockHeight, 'SOLANA_INVALID_BLOCK_HEIGHT').toString(), slot: String(slot) },
            accounts, escrow: accounts.find(account => account.role === 'escrow'), feeAudit,
            signingUnresolved, syntheticPrefunding,
            ...(originalClaimIngress ? { payoutNonceInfrastructureByAuthority: { escrow: infrastructure.escrow } }
              : { nonceInfrastructureByAuthority: infrastructure }), finality: 'finalized',
            assurance: 'OWNED_LOCAL_FINALIZED_INVENTORY_NOT_BACKING_ATTESTATION' });
        }
        fail('SOLANA_INVENTORY_CONTEXT_CHANGED');
      } finally { inventoryBusy = false; if (ownsWriter) busy = false; }
    }
    if(jupiterPublic){
      async function inspectBank(){
        requireCondition(arguments.length===0,'JUPITER_BANK_INSPECTION_NO_OPTIONS');await healthy();
        // Recheck every original public byte and every file actually passed to
        // this child. IDL/argv alone is not evidence of loaded executable bytes.
        const current=jupiterPublicBankGenesisV1(loadJupiterOfficialMaterialV1(),keys.solver.address,keys.jupiterSource.address,keys.jupiterDestination.address);
        assert.deepEqual(current.map(row=>({address:row.address,dataSHA256:row.dataSHA256,owner:row.owner,lamports:row.lamports,executable:row.executable})),
          jupiterGenesisRows.map(row=>({address:row.address,dataSHA256:row.dataSHA256,owner:row.owner,lamports:row.lamports,executable:row.executable})));
        for(const row of jupiterGenesisFiles)requireCondition(digest(await readFile(row.path))===row.inputSHA256,'JUPITER_BANK_GENESIS_FILE_CHANGED');
        const minimum=await read('getSlot',[{commitment:'finalized'}]);safeInteger(minimum,'JUPITER_BANK_FINALIZED_SLOT');
        const response=await read('getMultipleAccounts',[[...jupiterGenesisRows.map(row=>row.address),JUPITER_BANK_CLOCK_V1,JUPITER_TOKEN_PROGRAMDATA_V1,JUPITER_BANK_RENT_V1],
          {commitment:'finalized',minContextSlot:minimum,encoding:'base64'}]);
        requireCondition(contextSlot(response)>=BigInt(minimum),'JUPITER_BANK_CONTEXT_ROLLBACK');
        const observed=validateJupiterPublicBankAccountsV1(jupiterCurrentRows,response,jupiterExplicitTokenProgramV1(loadJupiterOfficialMaterialV1())),slot=Number(observed.slot);
        const blockOptions={commitment:'finalized',transactionDetails:'signatures',rewards:false,maxSupportedTransactionVersion:0};
        const block=await read('getBlock',[slot,blockOptions]);
        requireCondition(block&&Number.isSafeInteger(block.parentSlot)&&block.parentSlot<slot,'JUPITER_BANK_CANONICAL_BLOCK');
        base58Decode(block.blockhash,32);base58Decode(block.previousBlockhash,32);
        requireCondition(safeInteger(await read('getSlot',[{commitment:'finalized'}]),'JUPITER_BANK_FINALIZED_SLOT')>=BigInt(slot),'JUPITER_BANK_FINALITY_ROLLBACK');
        requireCondition((await read('getBlock',[slot,blockOptions]))?.blockhash===block.blockhash,'JUPITER_BANK_BLOCK_CHANGED');
        await healthy();return frozenInput({...observed,genesis,blockHash:block.blockhash,parentSlot:String(block.parentSlot),
          sourcePublicKey:keys.jupiterSource.address,destinationPublicKey:keys.jupiterDestination.address,payerPublicKey:keys.solver.address});
      }
      // RPC health can precede the first finalized non-genesis block. Wait for
      // its real frontier; never supply the old snapshot Clock or invent a slot.
      let finalizedReady=false;
      for(let attempt=0;attempt<120;attempt++){
        await healthy();const slot=await read('getSlot',[{commitment:'finalized'}]);safeInteger(slot,'JUPITER_BANK_FINALIZED_SLOT');
        if(slot>0){const block=await read('getBlock',[slot,{commitment:'finalized',transactionDetails:'signatures',rewards:false,maxSupportedTransactionVersion:0}]);
          if(block&&Number.isSafeInteger(block.parentSlot)&&block.parentSlot<slot){finalizedReady=true;break;}}
        await sleep(250);
      }
      requireCondition(finalizedReady,'JUPITER_BANK_FINALIZED_FRONTIER_TIMEOUT');
      const initial=await inspectBank();
      metadata.classification='OWNED_JUPITER_ORCA_PUBLIC_BANK_V1';
      delete metadata.receiptBinding;
      metadata.signing='One fixed public swap with ephemeral synthetic solver key; no customer/claim authority';
      metadata.publicMarket={commit:jupiterMaterial.commit,initialObservation:initial,genesisAccountCount:13,
        clockSnapshotLoaded:false,originalClaimLaneEnabled:false,privateCreditEstablished:false,
        swapExecutionEstablished:false,locallyCompiledProgramEstablished:false,publicNetwork:false};
      let swapAttempted=false,swapRecord=null;
      async function observeFixedSwap(){
        requireCondition(!observationBusy,'JUPITER_SWAP_OBSERVATION_BUSY');observationBusy=true;
        try{
          await healthy();if(!swapRecord)return frozenInput({status:'unavailable',broadcastAttempts:0,privateCreditEstablished:false});
          const signature=swapRecord.signature,status=(await read('getSignatureStatuses',[[signature],{searchTransactionHistory:true}])).value[0];
          if(!status||status.confirmationStatus!=='finalized')return frozenInput({status:'pending',signature,broadcastAttempts:swapRecord.broadcastAttempts,privateCreditEstablished:false});
          const transaction=await read('getTransaction',[signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}]);
          requireCondition(transaction,'JUPITER_SWAP_ORIGINAL_HISTORY_REQUIRED');
          const blockOptions={commitment:'finalized',transactionDetails:'signatures',rewards:false,maxSupportedTransactionVersion:0};
          const block=await read('getBlock',[transaction.slot,blockOptions]),finalizedSlot=await read('getSlot',[{commitment:'finalized'}]);
          const afterAccounts=await read('getMultipleAccounts',[jupiterGenesisRows.map(row=>row.address),
            {commitment:'finalized',minContextSlot:transaction.slot,encoding:'base64'}]);
          const observed=validateJupiterOrcaSwapObservationV1({intent:swapRecord.intent,nativeWire:swapRecord.nativeWire,genesis,
            observedGenesis:await read('getGenesisHash'),status,transaction,block,finalizedSlot,beforeRows:jupiterGenesisRows,
            afterAccounts,payerBefore:swapRecord.payerBefore,expectedFee:swapRecord.preparedFee});
          requireCondition((await read('getBlock',[transaction.slot,blockOptions]))?.blockhash===block.blockhash,'JUPITER_SWAP_CANONICAL_BLOCK_CHANGED');
          assert.deepEqual((await read('getSignatureStatuses',[[signature],{searchTransactionHistory:true}])).value[0],status,'JUPITER_SWAP_FINAL_STATUS_CHANGED');
          const {updatedRows,...publicObservation}=observed;
          const nativeEvidenceJSON=JSON.stringify({intent:swapRecord.intent,nativeWire:swapRecord.nativeWire,genesis,observedGenesis:genesis,
            status,transaction,block,finalizedSlot,afterAccounts,payerBefore:swapRecord.payerBefore,expectedFee:swapRecord.preparedFee,
            beforeRows:jupiterGenesisRows.map(({data,json,...row})=>({...row,data:data.toString('base64')}))});
          if(!swapRecord.observation){
            swapRecord.phase='OBSERVED_FINALIZED';swapRecord.observation=publicObservation;swapRecord.nativeEvidenceJSON=nativeEvidenceJSON;
            await persistNative(swapRecord);jupiterCurrentRows=updatedRows;signingUnresolved=false;
            metadata.publicMarket.swapExecutionEstablished=true;
          }else{
            const {finalizedSlot:originalFrontier,...original}=swapRecord.observation,{finalizedSlot:currentFrontier,...current}=publicObservation;
            assert.deepEqual(current,original,'JUPITER_SWAP_ORIGINAL_OUTCOME_CHANGED');requireCondition(BigInt(currentFrontier)>=BigInt(originalFrontier),'JUPITER_SWAP_FINALITY_ROLLBACK');
            assert.deepEqual(updatedRows.map(row=>[row.address,row.dataSHA256,row.lamports]),jupiterCurrentRows.map(row=>[row.address,row.dataSHA256,row.lamports]),'JUPITER_SWAP_POST_STATE_CHANGED');
          }
          await inspectBank();
          return frozenInput({...publicObservation,broadcastAttempts:swapRecord.broadcastAttempts});
        }finally{observationBusy=false;}
      }
      async function swapOnce(){
        requireCondition(arguments.length===0,'JUPITER_SWAP_NO_OPTIONS');assertJupiterPublicSwapSourceReviewV1();
        requireCondition(!busy&&!observationBusy,'JUPITER_SWAP_ORIGINAL_BUSY');
        if(swapAttempted){requireCondition(swapRecord,'JUPITER_SWAP_ATTEMPT_ALREADY_FAILED_NO_REPLACEMENT');return observeFixedSwap();}
        swapAttempted=true;busy=true;
        try{
          await inspectBank();const began=performance.now(),recent=await read('getLatestBlockhash',[{commitment:'confirmed'}]);
          contextSlot(recent);base58Decode(recent.value.blockhash,32);
          const reserves=address=>decodeJupiterSplTokenAccountV1(jupiterGenesisRows.find(row=>row.address===address).data).amount;
          const quote=quoteJupiterOrcaSolUsdcV1(reserves(JUPITER_ORCA_V1.reserveSol),reserves(JUPITER_ORCA_V1.reserveUsdc));
          const intent={payer:keys.solver.address,source:keys.jupiterSource.address,destination:keys.jupiterDestination.address,
            blockhash:recent.value.blockhash,quotedOutput:quote.quotedOutput,minimumOutput:quote.minimumOutput};
          const encoded=encodeJupiterOrcaFixtureMessageV1(intent.payer,intent.source,intent.destination,intent.blockhash,intent.quotedOutput);
          const fee=await read('getFeeForMessage',[encoded.message.toString('base64'),{commitment:'confirmed',minContextSlot:Number(contextSlot(recent))}]);
          requireCondition(Number.isSafeInteger(fee.value)&&fee.value>0,'JUPITER_SWAP_ORIGINAL_FEE');
          const payerBefore=await balance(keys.solver.address);requireCondition(BigInt(payerBefore)>BigInt(fee.value),'JUPITER_SWAP_OWNED_GAS_FUNDS');
          await inspectBank();const valid=await read('isBlockhashValid',[intent.blockhash,{commitment:'confirmed',minContextSlot:Number(contextSlot(recent))}]);
          requireCondition(valid.value===true,'JUPITER_SWAP_ORIGINAL_BLOCKHASH');await healthy();
          requireCondition(performance.now()-began<30000,'JUPITER_SWAP_ORIGINAL_KEY_BUDGET');
          signingUnresolved=true;
          const privateKey=createPrivateKey({key:Buffer.concat([PKCS8_ED25519,keys.solver.seed]),type:'pkcs8',format:'der'});
          const signature=sign(null,encoded.message,privateKey),nativeWire=Buffer.concat([Buffer.from([1]),signature,encoded.message]).toString('base64');
          const decoded=validateJupiterOrcaFixtureTransactionV1(nativeWire,intent);
          swapRecord={nativeId:signature.toString('hex'),signature:decoded.signature,nativeWire,intent,payerBefore,preparedFee:String(fee.value),
            transactionSHA256:decoded.transactionSHA256,messageSHA256:decoded.messageSHA256,phase:'SIGNED_NOT_BROADCAST',broadcastAttempts:0,
            relation:'OFFICIAL_PUBLIC_JUPITER_ORCA_SWAP_NOT_PRIVATE_CREDIT'};
          records.set(swapRecord.nativeId,swapRecord);await persistNative(swapRecord);
          await inspectBank();await healthy();requireCondition(performance.now()-began<30000,'JUPITER_SWAP_ORIGINAL_BROADCAST_BUDGET');
          swapRecord.phase='BROADCAST_UNKNOWN';swapRecord.broadcastAttempts=1;await persistNative(swapRecord);
          await healthy();requireCondition(performance.now()-began<30000,'JUPITER_SWAP_ORIGINAL_BROADCAST_BUDGET');
          try{requireCondition(await sendOwnedSolanaTransaction(endpoint,nativeWire)===decoded.signature,'JUPITER_SWAP_ORIGINAL_RPC_SIGNATURE');}
          catch(error){swapRecord.transportFailure=/^[A-Z][A-Z0-9_]{2,160}$/.test(error?.message??'')?error.message:'JUPITER_SWAP_SEND_UNCERTAIN';await persistNative(swapRecord);}
          return await observeFixedSwap();
        }finally{busy=false;}
      }
      const bank=Object.freeze({profile:'OWNED_JUPITER_ORCA_PUBLIC_BANK_V1',inspect:inspectBank,swapOnce,
        observeSwap:async function(){requireCondition(arguments.length===0&&!busy,'JUPITER_SWAP_OBSERVE_NO_OPTIONS_OR_BUSY');return observeFixedSwap();},
        get swaps(){return cloneInput(swapRecord?[swapRecord]:[]);},get metadata(){
        try{return cloneInput(metadata);}catch(error){
          // Private path/type only; preserve INPUT_INTEGER, no value/RPC dump.
          if(error?.message==='INPUT_INTEGER'){
            const visit=(value,path)=>{if(typeof value==='number'&&(!Number.isSafeInteger(value)||Object.is(value,-0)))return path;
              if(value&&typeof value==='object')for(const [key,next]of Object.entries(value)){const found=visit(next,path+'.'+key);if(found)return found;}return null;};
            const field=visit(metadata,'metadata');if(field)error.jupiterMetadataNumericField=Object.freeze({path:field,type:'number',safeInteger:false});
          }
          throw error;
        }
      },close});
      ownedJupiterPublicBanksV1.add(bank);return bank;
    }
    function createFacade(custody) {
      const namespace = combined && !custody ? graphRecords : records, adapters = new Map();
      const graphSource = graphRoleKeys.depositor;
      const viewRecipients = combined && !custody
        ? [graphRoleKeys.escrow.address, graphRoleKeys.recipient.address] : recipientAddresses;
      const viewBalance = combined && !custody ? async (address = viewRecipients[0]) => {
        requireCondition(address === graphSource.address || viewRecipients.includes(address), 'SOLANA_BALANCE_REQUIRES_OWNED_ADDRESS');
        const result = await read('getBalance', [address, { commitment: 'confirmed' }]);
        return safeInteger(result.value, 'SOLANA_UNSAFE_BALANCE').toString();
      } : balance;
      function route(options) {
        exactRecord(options, custody ? ['asset', 'route'] : ['asset', 'recipientIndex']); bytes32(options.asset, true);
        let selectedRoute;
        if (custody) selectedRoute = custodyRoute(options.route);
        else {
          requireCondition(Number.isSafeInteger(options.recipientIndex) && !Object.is(options.recipientIndex, -0)
            && options.recipientIndex >= 0 && options.recipientIndex < viewRecipients.length, 'SOLANA_INVALID_RECIPIENT_INDEX');
          selectedRoute = graphRoute(options.recipientIndex);
        }
        bindNativeAsset(options.asset); return { asset: options.asset, selectedRoute };
      }
      function adapter(options) {
        const { asset, selectedRoute } = route(options), { recipientIndex } = selectedRoute;
        const recipient = recipientAddress(selectedRoute), source = sourceKey(selectedRoute);
        const name = asset + ':' + (selectedRoute.name ?? recipientIndex);
        if (adapters.has(name)) return adapters.get(name);
        const binding = frozenInput({ family: '2', genesis: base58Decode(genesis, 32).toString('hex'), asset,
          sourceEndpoint: source.publicBytes.toString('hex'), destinationEndpoint: base58Decode(recipient, 32).toString('hex'), changeEndpoint: null });
        const result = Object.freeze({ binding,
          async transfer(request, callbacks) {
            const copied = cloneInput(request); exactRecord(copied, ['amount', 'wireKeyCommitment']);
            return transfer(selectedRoute, copied.amount, copied.wireKeyCommitment, callbacks);
          },
          ...(usesNonce(selectedRoute) && ['refund', 'redeem'].includes(selectedRoute.name) ? {
            async resumeReservedPayout(request, callbacks) { return resumeReservedPayout(selectedRoute, request, callbacks); },
          } : {}),
          ...(usesNonce(selectedRoute) && selectedRoute.name === 'deposit' ? {
            async resumeReservedIngress(request, callbacks) { return resumeReservedIngress(selectedRoute, request, callbacks); },
            async observeReservedIngress(request) {
              const input = cloneInput(request); exactRecord(input, ['nativeId']);
              const record = recordFor(input.nativeId, namespace);
              requireCondition(record.route === selectedRoute.name && record.recipientIndex === recipientIndex, 'SOLANA_OTHER_ROUTE');
              return observeReservedIngress(record);
            },
          } : {}),
          async assertPrepared(prepared) {
            requireCondition(activeRoute?.name === selectedRoute.name && activeRoute?.recipientIndex === recipientIndex, 'SOLANA_OTHER_ROUTE');
            return assertPrepared(prepared);
          },
          async observe(request) {
            const copied = cloneInput(request); exactRecord(copied, ['nativeId']);
            const record = recordFor(copied.nativeId, namespace);
            requireCondition(!custody || record.route === selectedRoute.name, 'SOLANA_OTHER_ROUTE');
            requireCondition(record.recipientIndex === recipientIndex, 'SOLANA_OTHER_RECIPIENT');
            const observation = await observeRecord(record, { timeoutMs: 0 });
            return { status: observation.status, nativeId: copied.nativeId,
              nativeWire: observation.status === 'observed' ? observation.nativeWire : null };
          },
        });
        adapters.set(name, result); return result;
      }
      function factReader(options) {
        const config = cloneInput(options); exactRecord(config, custody ? ['asset', 'route'] : ['asset']); bindNativeAsset(config.asset);
        const selectedRoute = custody ? custodyRoute(config.route) : null;
        return Object.freeze({ async observe(request) {
          const input = cloneInput(request); exactRecord(input, ['family', 'recipientIndex', 'nativeId']);
          requireCondition(input.family === '2', 'SOLANA_FACT_FAMILY');
          const recipientIndex = Number(inputUint(input.recipientIndex, 8, 1n)), record = recordFor(input.nativeId, namespace);
          requireCondition(!custody || record.route === selectedRoute.name, 'SOLANA_OTHER_ROUTE');
          requireCondition(record.recipientIndex === recipientIndex, 'SOLANA_OTHER_RECIPIENT');
          const observed = await observeRecord(record, { timeoutMs: 0 });
          if (observed.status !== 'observed') return { status: observed.status === 'pending' ? 'unavailable' : observed.status,
            reason: observed.reason };
          return { status: 'observed', genesis: observed.genesis, asset: config.asset, nativeWire: observed.nativeWire,
            intent: observed.intent, blockId: observed.blockId, blockHeight: observed.blockHeight, finalityKind: '2', confirmations: '0',
            nativeContext: { observedTipId: ZERO, observedTipHeight: '0', transactionSlot: observed.transactionSlot,
              parentSlot: observed.parentSlot, observedSlot: observed.observedSlot } };
        } });
      }
      const runtime = Object.freeze({ genesis, genesisHex: '0x' + base58Decode(genesis, 32).toString('hex'),
        ...(custody ? { roles, inventory, syntheticPrefunding,
          ...(originalClaimIngress ? { originalClaimIngressProfile: 'OWNED_SOLANA_ORIGINAL_RECENT_BLOCKHASH_CLAIM_V1',
            payoutNonceInfrastructureByAuthority: frozenInput({ escrow: nonceInfrastructureByAuthority.escrow }) }
            : { nonceInfrastructureByAuthority, nonceIngressProfile: SOLANA_NONCE_INGRESS_PROFILE }),
          payoutFinalSendProfile: SOLANA_PAYOUT_FINAL_SEND_PROFILE } : {
          solver: graphSource.address, solverHex: '0x' + graphSource.publicBytes.toString('hex'),
          recipients: Object.freeze([...viewRecipients]), recipient: viewRecipients[0],
          recipientHex: '0x' + base58Decode(viewRecipients[0], 32).toString('hex'),
          // Preserve graph coordinator read access; custody has only fixed-role reads.
          readPublic: async (method, params = []) => structuredClone(await read(method, params)),
        }),
        adapter, factReader, observe: async (nativeId, options) => observeRecord(recordFor(nativeId, namespace), options), balance: viewBalance,
        get metadata() {
          const result = cloneInput(metadata);
          if (combined && !custody) {
            result.classification = 'OWNED_FLAT_SOLANA_RECEIPT_BINDING_RUNTIME_V1';
            result.solverHex = '0x' + graphSource.publicBytes.toString('hex');
            result.recipientHex = '0x' + base58Decode(viewRecipients[0], 32).toString('hex');
            Object.assign(result.publicKeys, { solver: graphSource.address, recipient: viewRecipients[0], recipient1: viewRecipients[1] });
            result.signing = 'Node Ed25519 with separate ephemeral synthetic graph solver key; no external wallet';
            result.cohortProfile = { name: SOLANA_PRIVATE_COHORT_PROFILE, recipientCount: 2,
              registeredRecipients: [...viewRecipients], sharedNativeSolver: true, commonTrustedHost: true, externalAnonymitySetClaim: false };
            result.receiptBinding = cloneInput(graphReceiptBinding);
            for (const field of ['custody', 'ingressReceiptBinding', 'payoutReceiptBinding',
              'nonceInfrastructureByAuthority', 'nonceBootstrapPreparationByAuthority']) delete result[field];
            for (const role of ['depositorNonceBootstrapPayer', 'depositorNonce', 'nonceBootstrapPayer', 'escrowNonce'])
              delete result.publicKeys[role];
          }
          return result;
        }, get transfers() { return cloneInput([...namespace.values()]); },
        ...(custody ? { get nonceBootstrapByAuthority() { return cloneInput(bootstrapRecordsByAuthority); } } : {}), close });
      if(custody&&!combined)originalSolanaRecoveryCapturesV1.set(runtime,()=>recoveryCapture());
      if(custody&&!combined)originalSolanaRetentionArmsV1.set(runtime,()=>{requireCondition(!closed&&!shuttingDown&&!recoveryCapturing&&processGeneration===0&&initialPrivateRecord&&!busy&&records.size===0,'SOLANA_RETENTION_BEFORE_NATIVE_EFFECTS');handle.assertAlive();recoveryRetained=true;return cloneInput({schema:'OWNED_NATIVE_INITIAL_RETENTION_V1',family:'solana',cwd,processGeneration,initialPrivateRecord});});
      ownedSolanaRuntimes.add(runtime);
      ownedSolanaLiveness.set(runtime, () => {
        requireCondition(!closed && !shuttingDown && !recoveryCapturing, 'SOLANA_RUNTIME_CLOSED');
        if (isolationFailure) throw isolationFailure;
        if (nativePersistenceFailure) throw nativePersistenceFailure;
        handle.assertAlive();
      });
      ownedSolanaAuditStates.set(runtime, () => {
        const complete = allRecords();
        return frozenInput({ profile: 'OWNED_NATIVE_RUNTIME_AUDIT_STATE_V1', family: '2',
          lifetimeId, facade: custody ? 'custody' : 'graph', genesis,
          readGeneration: readGeneration.toString(), mutationGeneration: mutationGeneration.toString(),
          activeReads: activeNativeReads + activeNativeReadOperations, activeMutations: activeNativeMutations,
          readsIdle: activeNativeReads === 0 && activeNativeReadOperations === 0 && !observationBusy && !inventoryBusy,
          operationBusy: busy, observationBusy, inventoryBusy, signingUnresolved,
          persistenceFailed: Boolean(nativePersistenceFailure), isolationFailed: Boolean(isolationFailure),
          adverseHistory: complete.some(record => Boolean(record.adverseReason) || record.phase === 'OBSERVED_ADVERSE'),
          activeRoute: activeRoute?.name ?? null, activePrepared: activePrepared ? cloneInput(activePrepared) : null,
          transfers: cloneInput([...namespace.values()]),
          custodyTransfers: cloneInput(complete.filter(record => record.route !== undefined)),
          graphTransfers: cloneInput(complete.filter(record => record.route === undefined)) });
      });
      if (custody) readPayoutAuditState = () => readOwnedSolanaRuntimeAuditState(runtime);
      return runtime;
    }
    if(jupiterSpl){
      const sol=createFacade(true),graph=createFacade(false),instance=digest(Buffer.from(lifetimeId)),addresses=deriveNativeSplConfigurationV1({payer:keys.splFeePayer.address,instance});
      const splAsset=nativeSplAssetCommitmentV1({genesis:base58Decode(genesis,32).toString('hex'),config:addresses.config.address,vault:addresses.vault.address}),token=Object.freeze({profile:'ORIGINAL_OWNED_SOLANA_SPL_INTERNAL_CONTEXT_V1'});
      const assertLive=()=>ownedSolanaLiveness.get(sol)();
      const context={genesis,genesisHex:base58Decode(genesis,32).toString('hex'),instance,addresses,splAsset,material:splMaterial,rows:jupiterGenesisRows,close,graph,sol,assertLive,read,healthy,
        publicKeys:{sourceOwner:keys.graphRecipient1.address,source:keys.splSource.address,refund:keys.splRefund.address,recipient:keys.splRecipient.address,feePayer:keys.splFeePayer.address},
        get originalState(){assertLive();return readOwnedSolanaRuntimeAuditState(sol);},
        beginOperation(route){assertLive();requireCondition(!busy&&!observationBusy&&!inventoryBusy&&!signingUnresolved&&activeNativeReads===0,'SOLANA_SPL_ORIGINAL_OPERATION_FENCE');busy=true;activeRoute=route;mutationGeneration++;},
        finishOperation(){busy=false;activeRoute=null;activePrepared=null;preSignReadWindow=false;},
        setPrepared(value){requireCondition(busy,'SOLANA_SPL_PREPARATION_WITHOUT_WRITER');activePrepared=value;},
        setReadWindow(value){requireCondition(busy&&typeof value==='boolean','SOLANA_SPL_ORIGINAL_READ_WINDOW');preSignReadWindow=value;},
        beginInventory(){assertLive();requireCondition(!inventoryBusy&&!observationBusy&&(!busy||preSignReadWindow||reservationReads.active),'SOLANA_SPL_INVENTORY_BUSY');inventoryBusy=true;readGeneration++;},
        finishInventory(){inventoryBusy=false;readGeneration++;},
        get signingUnresolved(){return signingUnresolved;},
        setSigningUnresolved(value){requireCondition(typeof value==='boolean','SOLANA_SPL_SIGNING_FENCE');signingUnresolved=value;mutationGeneration++;},
        async persistState(value){if(nativePersistenceFailure)throw nativePersistenceFailure;try{const path=join(cwd,'spl-state.json'),tmp=path+'.next',file=await open(tmp,'wx',0o600);try{await file.writeFile(JSON.stringify(value));await file.sync();}finally{await file.close();}await rename(tmp,path);const d=await open(cwd,'r');try{await d.sync();}finally{await d.close();}}catch(cause){nativePersistenceFailure=new Error('SOLANA_NATIVE_JOURNAL_UNCERTAIN',{cause});throw nativePersistenceFailure;}},
        async persistTransfer(record){return persistNative(record,journalDirectory);},
        signFixed(kind,message){assertLive();requireCondition(busy&&signingUnresolved&&!preSignReadWindow,'SOLANA_SPL_ORIGINAL_KEY_FENCE');requireCondition(kind==='source'||kind==='fee','SOLANA_SPL_FIXED_KEY');const key=kind==='source'?keys.graphRecipient1:keys.splFeePayer;return sign(null,message,createPrivateKey({key:Buffer.concat([PKCS8_ED25519,key.seed]),type:'pkcs8',format:'der'}));},
        sendOnce(nativeWire){assertLive();requireCondition(busy&&!preSignReadWindow&&!nativePersistenceFailure,'SOLANA_SPL_ORIGINAL_SEND_FENCE');return sendOwnedSolanaTransaction(endpoint,nativeWire);},
        reservationWindow:(work)=>reservationReads.run(work,()=>requireCondition(activeNativeReads===0&&!inventoryBusy&&!observationBusy,'SOLANA_SPL_READS_NOT_IDLE')),
        register(runtime,records){requireCondition(!splFacade,'SOLANA_SPL_FACADE_ALREADY_MINTED');splFacade=runtime;ownedSolanaRuntimes.add(runtime);ownedSolanaLiveness.set(runtime,assertLive);ownedSolanaAuditStates.set(runtime,()=>{const state=readOwnedSolanaRuntimeAuditState(sol);return frozenInput({...cloneInput(state),transfers:cloneInput(records()),custodyTransfers:[...state.custodyTransfers,...cloneInput(records())],adverseHistory:state.adverseHistory||records().some(row=>row.phase==='OBSERVED_ADVERSE'||row.adverseReason!==undefined)});});}
      };
      originalSplContextsV1.set(token,context);const {createOwnedSolanaSplCustodyFromOriginalV1}=await import('./owned-solana-spl-custody-v1.mjs');
      const spl=await createOwnedSolanaSplCustodyFromOriginalV1(token),group=Object.freeze({spl,sol,graph,close,genesis,splAsset,solAsset:deriveOwnedNativeCurrencyAsset({family:'2',genesis:context.genesisHex})});
      originalSplFacadesV1.set(spl,group);originalSplGraphsV1.set(graph,group);assertOwnedSolanaSplClaimCohortV1([spl,sol]);return Object.freeze({custody:sol,graph,spl});
    }
    return combined ? Object.freeze({ custody: createFacade(true), graph: createFacade(false) }) : createFacade(custody);
  } catch (error) {
    if (custody) error.nonceBootstrapByAuthority = cloneInput(bootstrapRecordsByAuthority);
    if (metadata?.nonceBootstrapPreparationByAuthority)
      error.nonceBootstrapPreparationByAuthority = cloneInput(metadata.nonceBootstrapPreparationByAuthority);
    try { error.cleanup = await close(); }
    catch (cleanupError) { error.cleanup = { ownedProcessStopped: false, syntheticKeysAndLedgerRemoved: false, error: cleanupError.message }; }
    throw error;
  }
}
