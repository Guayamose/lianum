/** Validate the wallet read payload and its independently verified sections. */
import { record, atomic, copy } from './values.mjs';
import { WALLET_PROFILE, ACTIONS, DEFI_ACTIONS, ACCOUNT_ACTIONS, DEFI_PROFILE } from '../actions/catalog.mjs';
import { validTransferSection } from './transfers.mjs';
import { validAccountSnapshot } from './account.mjs';
import { validGraphReview } from './graph-review.mjs';
import { validNativeNoteReview } from '../../contracts/native-note-review.mjs';
import { validateManualHandoffMetadata } from '../../contracts/manual-action-handoff.mjs';
import { GENERATION_PORTFOLIO_PROFILE, validateFlatOwnerReadPayload, ownerPortfolioAssetRows } from '../../contracts/owner-portfolio-contract.mjs';
import { validateOriginalWalletEconomicStateV1 } from '../../../original-wallet-economic-state-v1.mjs';
import { validatePublicTokenObservations } from '../../contracts/public-token-observations.mjs';
import { validateGenerationDefiRead } from '../../contracts/generation-defi-contract.mjs';
import { validateWrappedWithdrawalRead } from '../../contracts/wrapped-withdrawal-review.mjs';

export function validateWalletState(value) {
  if (!record(value) || value.version !== 1 || value.profile !== WALLET_PROFILE
    || !['CONNECTED', 'DISCONNECTED', 'UNAVAILABLE'].includes(value.connection)
    || !(value.portfolio === null || record(value.portfolio))
    || !(value.nativeClaims === null || record(value.nativeClaims)
      && (value.nativeClaims.snapshot === null || record(value.nativeClaims.snapshot))
      && (value.nativeClaims.owner === null || record(value.nativeClaims.owner)))
    || !record(value.capabilities) || value.capabilities.graphExecution !== false
    || Object.values(ACTIONS).some(action => typeof value.capabilities[action.capability] !== 'boolean')
    || !record(value.errors) || ['portfolio', 'nativeClaims'].some(key => value.errors[key] !== null && typeof value.errors[key] !== 'string'))
    throw new Error('WALLET_STATE_CONTRACT');
  for (const action of [...Object.values(DEFI_ACTIONS), ...Object.values(ACCOUNT_ACTIONS)]) if (value.capabilities[action.capability] !== undefined
    && typeof value.capabilities[action.capability] !== 'boolean') throw new Error('WALLET_DEFI_CONTRACT');
  for (const key of ['networks', 'defi', 'account', 'transfers']) if (value.errors[key] !== undefined && value.errors[key] !== null && typeof value.errors[key] !== 'string')
    throw new Error('WALLET_EXTENSION_CONTRACT');
  if (value.transfers !== undefined && value.transfers !== null && !validTransferSection(value.transfers)) throw new Error('WALLET_TRANSFERS_CONTRACT');
  if (value.account !== undefined && value.account !== null && (!record(value.account)
    || !(value.account.snapshot === null || validAccountSnapshot(value.account.snapshot)))) throw new Error('WALLET_ACCOUNT_CONTRACT');
  if (value.networks !== undefined && value.networks !== null && (!record(value.networks) || value.networks.privateSpendable !== false
    || !Array.isArray(value.networks.chains) || !Array.isArray(value.networks.observations)
    || !['TRUSTED_RPC_NATIVE_HOLDINGS_ONLY','TRUSTED_RPC_PUBLIC_HOLDINGS_ONLY'].includes(value.networks.observation))) throw new Error('WALLET_NETWORKS_CONTRACT');
  if (value.defi !== undefined && value.defi !== null && (!record(value.defi) || !(value.defi.snapshot === null
    || record(value.defi.snapshot) && value.defi.snapshot.version === 1 && value.defi.snapshot.profile === DEFI_PROFILE
      && Array.isArray(value.defi.snapshot.operations)))) throw new Error('WALLET_DEFI_CONTRACT');
  if (value.account?.manualGraphs !== undefined) {
    const graphs = value.account.manualGraphs;
    if (!Array.isArray(graphs) || graphs.length > 8 || !graphs.every(validGraphReview)
      || new Set(graphs.map(g => g.requestId)).size !== graphs.length
      || new Set(graphs.map(g => g.ownerOperationRef)).size !== graphs.length
      || value.capabilities.manualEvmVaultGraph && graphs.length === 0) throw new Error('WALLET_ACCOUNT_GRAPH_CONTRACT');
  } else if (value.capabilities.manualEvmVaultGraph) throw new Error('WALLET_ACCOUNT_GRAPH_CONTRACT');
  if (value.account?.manualNativeNotes !== undefined) {
    const notes = value.account.manualNativeNotes;
    if (!Array.isArray(notes) || notes.length > 4 || !notes.every(validNativeNoteReview)
      || new Set(notes.map(n => n.requestId)).size !== notes.length
      || new Set(notes.map(n => n.ownerOperationRef)).size !== notes.length
      || notes.some(n => value.account.manualGraphs?.some(g => g.requestId === n.requestId || g.ownerOperationRef === n.ownerOperationRef))
      || value.capabilities.manualNativeNotes && notes.length === 0) throw new Error('WALLET_NATIVE_NOTE_CONTRACT');
  } else if (value.capabilities.manualNativeNotes) throw new Error('WALLET_NATIVE_NOTE_CONTRACT');
  if (value.manualActionHandoff !== undefined) validateManualHandoffMetadata(value.manualActionHandoff);
  const p = value.portfolio;
  if (p?.profile === GENERATION_PORTFOLIO_PROFILE) validateFlatOwnerReadPayload(p);
  else if (p && (!['LIVE', 'STALE', 'PARTIAL', 'UNAVAILABLE'].includes(p.status)
    || !(Array.isArray(p.assets) ? ['OWNED_FLAT_PRIVATE_PORTFOLIO_V1', 'OWNED_WRAPPED_WALLET_PORTFOLIO_V1'].includes(p.profile) && typeof p.coherent === 'boolean' : record(p.asset))))
    throw new Error('WALLET_PORTFOLIO_CONTRACT');
  const assets = p?.profile === GENERATION_PORTFOLIO_PROFILE ? [] : ownerPortfolioAssetRows(p);
  if (assets.some(item => !record(item) || !record(item.asset)
    || !['LIVE', 'STALE', 'PARTIAL', 'UNAVAILABLE'].includes(item.status)
    || !Number.isInteger(item.asset.decimals) || item.asset.decimals < 0 || item.asset.decimals > 18
    || !(item.balances === null || record(item.balances)
      && ['available', 'reserved', 'recovery', 'locked'].every(key => atomic(item.balances[key]) !== null))
    || !Array.isArray(item.requests))) throw new Error('WALLET_ASSET_CONTRACT');
  if (value.economicState !== undefined && value.economicState !== null) validateOriginalWalletEconomicStateV1(value.economicState);
  if (value.errors.economicState !== undefined && value.errors.economicState !== null && typeof value.errors.economicState !== 'string') throw Error('WALLET_ECONOMIC_STATE_CONTRACT');
  validatePublicTokenObservations(value.networks);
  for (const row of value.networks?.observations ?? []) {
    if (row.chain !== 'bitcoin') continue;
    const descriptor=value.networks.chains.find(chain=>chain.chain==='bitcoin')?.network;
    if (row.schema!=='flat-portfolio-observation/1'||row.creditEligible!==false||row.privateSpendableAtomic!==null
      ||row.balanceScope!=='MATURE_WATCH_WALLET_UTXOS'||row.coverage!==(descriptor?'BOOTSTRAP_DECLARED':'UNAVAILABLE')
      ||!(row.minimumConfirmations===null&&!descriptor||Number.isInteger(row.minimumConfirmations)
        &&row.minimumConfirmations>=1&&row.minimumConfirmations<=100
        &&descriptor?.finality.minimumConfirmations===row.minimumConfirmations)
      ||(row.status==='fresh'?atomic(row.pendingBalanceAtomic)===null:row.pendingBalanceAtomic!==null))
      throw new Error('WALLET_BITCOIN_OBSERVATION_CONTRACT');
  }
  validateGenerationDefiRead(value.defi, p);
  validateWrappedWithdrawalRead(value.wrappedWithdrawals);
  return copy(value);
}
