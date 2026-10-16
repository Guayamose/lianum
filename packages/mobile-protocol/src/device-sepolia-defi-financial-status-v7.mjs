/** Public observation DATA. A financial receipt is not a spendable private
 * note; the original note observer must independently reconcile that state. */
import {externalFlatExactV1 as exact,externalFlatHexV1 as hex} from './device-external-flat-note-v1.mjs';
const need=value=>{if(!value)throw Error('DEVICE_SEPOLIA_DEFI_FINANCIAL_STATUS_DATA');};
export function normalizeDeviceSepoliaDefiFinancialStatusV7(raw) {
  const value=exact(raw,['jobId','reference','phase','transactionHash','canonical','protocol','kind']);
  hex(value.jobId);hex(value.reference);
  need(['AAVE_STATIC','MORPHO_V2'].includes(value.protocol)&&['INVEST','WITHDRAW','REDEEM'].includes(value.kind));
  need(['PREPARED','SUBMITTED','CONFIRMED','UNKNOWN'].includes(value.phase)&&typeof value.canonical==='boolean');
  need(value.transactionHash===null||typeof value.transactionHash==='string'&&/^0x[0-9a-f]{64}$/.test(value.transactionHash)&&value.transactionHash!=='0x'+'0'.repeat(64));
  need(value.canonical===(value.phase==='CONFIRMED'));
  if(['SUBMITTED','CONFIRMED'].includes(value.phase))need(value.transactionHash!==null);
  if(value.phase==='PREPARED')need(value.transactionHash===null);
  return Object.freeze({...value});
}
