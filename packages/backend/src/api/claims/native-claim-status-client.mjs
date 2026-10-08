/** Read-only Node/local-bridge client for the existing native-claim GET API.
 * No session bootstrap, mutation, signing, polling, retry or credential storage.
 * Journal status is not a balance, current custody audit or settlement proof. */
import { readNativeClaimSnapshotWire, readNativeClaimOwnerWire, OWNER_READ_RESPONSE_LIMIT, OWNER_READ_TIMEOUT_MS }
  from '../transport/fixed-owner-read-transport.mjs';
import { types } from 'node:util';

export const NATIVE_CLAIM_STATUS_RESPONSE_LIMIT = OWNER_READ_RESPONSE_LIMIT;
export const NATIVE_CLAIM_STATUS_TIMEOUT_MS = OWNER_READ_TIMEOUT_MS;
const PROFILE = 'OWNED_LOCAL_DURABLE_NATIVE_CLAIM_ACCOUNT_V1';
const ERROR = /^(?:NATIVE_CLAIM|CLAIM|VAULT|SOLANA|BITCOIN|LOCAL_EVM|ROLE_CLIENT|FLAT_OPERATOR|COMBINED_OPERATOR)_[A-Z0-9_]{1,100}$/;
const actions = ['deposit', 'redeem', 'refund', 'restartKeeper'];
const requestStates = ['ADMITTED', 'RUNNING', 'CONFIRMED', 'RECONCILIATION_REQUIRED'];
const depositStates = ['PREPARED', 'PREPOSITIONED', 'UNKNOWN', 'HELD_UNISSUED', 'ISSUED', 'REFUND_PENDING', 'REFUNDED'];
const ticketStates = ['BURN_UNKNOWN', 'REDEMPTION_READY_TO_RETRY', 'DISCHARGED', 'OBSERVED_AWAITING_DISCHARGE',
  'NATIVE_ADVERSE', 'AWAITING_FIRST_BROADCAST', 'UNKNOWN', 'REFUND_PENDING', 'REDEMPTION_PENDING'];
const limits = Object.freeze({ observation: 'DURABLE_JOURNAL_ONLY', balancesProvided: false,
  custodyObservation: 'NOT_PROVIDED_BY_THIS_API', nativeSettlementEstablished: false });
const frozen = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
};
function fail(code) { throw Object.assign(new Error(code), { code }); }
function need(value, code = 'NATIVE_CLAIM_STATUS_RESPONSE_INVALID') { if (!value) fail(code); }
function record(value, required, optional = [], code) {
  need(value !== null && typeof value === 'object' && !types.isProxy(value)
    && Object.getPrototypeOf(value) === Object.prototype, code);
  const keys = Reflect.ownKeys(value);
  need(required.every(key => Object.hasOwn(value, key))
    && keys.every(key => required.includes(key) || optional.includes(key)), code);
  for (const key of keys) need(Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'), code);
  return value;
}
const oneOf = (value, choices) => { need(choices.includes(value)); return value; };
const bool = value => { need(typeof value === 'boolean'); return value; };
const integer = value => { need(Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0)); return value; };
const isCode = value => typeof value === 'string' && ERROR.exec(value)?.[0] === value;
const code = value => { need(value === null || isCode(value)); return value; };
const digest = value => { need(typeof value === 'string' && value.length === 64 && /^[0-9a-f]{64}$/.test(value)); return value; };
const amount = value => { need(typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value)
  && BigInt(value).toString() === value && BigInt(value) <= (1n << 64n) - 1n); return value; };
function rows(value, maximum, project) { need(Array.isArray(value) && value.length <= maximum); return value.map(project); }
function requests(value, owner) {
  return rows(value, 128, row => {
    record(row, ['requestId', 'action', 'state', 'errorCode', ...(owner ? ['result'] : [])]);
    need(typeof row.requestId === 'string' && /^[A-Za-z0-9_-]{8,100}$/.exec(row.requestId)?.[0] === row.requestId);
    // The session's heterogeneous result object is deliberately not forwarded.
    // Deposits/tickets below provide the bounded current journal projections.
    return { requestId: row.requestId, action: oneOf(row.action, actions),
      state: oneOf(row.state, requestStates), errorCode: code(row.errorCode) };
  });
}
function common(value) {
  need([PROFILE, 'OWNED_LOCAL_DURABLE_WRAPPED_CLAIM_ACCOUNT_V1'].includes(value.profile) && value.observation === 'DURABLE_JOURNAL_ONLY');
}
function snapshot(value) {
  record(value, ['version', 'profile', 'phase', 'storageAvailable', 'busy', 'queued', 'revision', 'observation',
    'errorCode', 'requests', 'requiresExternalEffectReconciliation', 'capabilities']); common(value);
  need(value.version === 1); oneOf(value.phase, ['READY', 'UNAVAILABLE', 'CLOSED']);
  bool(value.storageAvailable); need(value.storageAvailable === (value.phase === 'READY'));
  bool(value.busy); integer(value.queued); integer(value.revision); code(value.errorCode);
  bool(value.requiresExternalEffectReconciliation);
  const c = record(value.capabilities, ['keeperRestart', 'nativeNodeRestart', 'operatorKeyRestart', 'nativeSelfCustody', 'fullWalletAcceptance']);
  bool(c.keeperRestart);
  for (const key of ['nativeNodeRestart', 'operatorKeyRestart', 'nativeSelfCustody', 'fullWalletAcceptance']) need(c[key] === false);
  return { ...value, requests: requests(value.requests, false), capabilities: { ...c } };
}
function deposit(row) {
  record(row, ['intentId', 'claimDomain', 'amount', 'status', 'assetKind', 'nativeSelfCustody', 'spendablePrivateBalance'], ['submission']);
  digest(row.intentId); digest(row.claimDomain); amount(row.amount); oneOf(row.status, depositStates);
  need(row.assetKind === 'CUSTODIAL_NATIVE_CLAIM' && row.nativeSelfCustody === false && row.spendablePrivateBalance === null);
  if (row.submission !== undefined) {
    record(row.submission, ['transactionHash', 'calldataSHA256']); digest(row.submission.transactionHash); digest(row.submission.calldataSHA256);
  }
  return { ...row, ...(row.submission ? { submission: { ...row.submission } } : {}) };
}
function ticket(row) {
  record(row, ['ticketId', 'claimDomain', 'amount', 'kind', 'status', 'nativeSelfCustody']);
  digest(row.ticketId); digest(row.claimDomain); amount(row.amount); oneOf(row.kind, ['REFUND', 'REDEEM']);
  oneOf(row.status, ticketStates); need(row.nativeSelfCustody === false); return { ...row };
}
function ownerStatus(value) {
  record(value, ['profile', 'observation', 'assetKind', 'nativeSelfCustody', 'underlyingSpendable', 'independentOperators',
    'deposits', 'tickets', 'requests']); common(value);
  need(value.assetKind === 'CUSTODIAL_NATIVE_CLAIM');
  for (const key of ['nativeSelfCustody', 'underlyingSpendable', 'independentOperators']) need(value[key] === false);
  return { ...value, deposits: rows(value.deposits, 32, deposit), tickets: rows(value.tickets, 64, ticket),
    requests: requests(value.requests, true) };
}
const outcome = (scope, data, errorCode = null, httpStatus = null) => frozen({
  readStatus: data === null ? 'UNAVAILABLE' : 'RECEIVED', scope, data, errorCode, httpStatus, limitations: limits,
});

async function read(input, owner) {
  const scope = owner ? 'OWNER_PRIVATE_STATUS' : 'OWNER_PRIVATE_SNAPSHOT';
  const result = await (owner ? readNativeClaimOwnerWire(input) : readNativeClaimSnapshotWire(input));
  if (result.errorCode) return outcome(scope, null, result.errorCode, result.httpStatus);
  try { return outcome(scope, owner ? ownerStatus(result.body) : snapshot(result.body), null, result.httpStatus); }
  catch { return outcome(scope, null, 'NATIVE_CLAIM_STATUS_RESPONSE_INVALID', result.httpStatus); }
}

/** Owner-private journal history: accepts the existing { origin, token }
 * ownerAccess. No anonymous health fallback exposes IDs or operation counts. */
export async function readNativeClaimSnapshot(input) {
  need(arguments.length === 1, 'NATIVE_CLAIM_STATUS_ACCESS_INVALID'); return read(input, false);
}
/** Owner journal status: accepts the existing bootstrap ownerAccess object. */
export async function readNativeClaimOwnerStatus(input) {
  need(arguments.length === 1, 'NATIVE_CLAIM_STATUS_ACCESS_INVALID'); return read(input, true);
}
