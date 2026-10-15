import {requestPublicWalletSessionV1,publicWalletSessionOriginV1} from './public-wallet-session-api-v1.ts';
import {walletSessionStatusV1} from '../custody/wallet-session-v1.ts';
import {normalizePublicWalletConnectionV1} from '../state/public-connection-registry-v1.mjs';

/** Discovery returns routing data only. Existing custody and its signed
 * observations remain responsible for balances and financial actions. */
export async function readCloudPagedConnectionV1(signal:AbortSignal):Promise<string>{
 const owner=walletSessionStatusV1().publicKey;
 const result=await requestPublicWalletSessionV1('/v1/wallet/connections',{},signal);
 if(signal.aborted||!walletSessionStatusV1().active||walletSessionStatusV1().publicKey!==owner)throw Error('NATIVE_WALLET_LOCKED');
 if(!result||Object.keys(result).sort().join(',')!=='connections,devicePublicKey,profile'||result.profile!=='LIANUM_CLOUD_CONNECTIONS_V1'||result.devicePublicKey!==owner||!Array.isArray(result.connections)||result.connections.length>1)throw Error('MOBILE_CLOUD_CONNECTION_INVALID');
 if(result.connections.length===0)throw Error('MOBILE_CLOUD_CONNECTION_NOT_ASSIGNED');
 const entry=normalizePublicWalletConnectionV1(JSON.stringify(result.connections[0]),owner!);
 if(entry.kind!=='PAGED'||entry.origin!==publicWalletSessionOriginV1())throw Error('MOBILE_CLOUD_CONNECTION_INVALID');return entry.profile;
}
