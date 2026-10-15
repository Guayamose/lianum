import * as Store from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import {createDevicePagedAgentPublicOperationStoreV4} from '../api/device-paged-agent-public-operation-v4.mjs';
/** Public signed records only. No mobile identity, ROOT or opening is stored. */
export function createNativeDevicePagedAgentPublicStoreV4(descriptor:unknown){
 const options={keychainService:'org.lianum.wallet.agent.public.v4',keychainAccessible:Store.WHEN_UNLOCKED_THIS_DEVICE_ONLY};
 return createDevicePagedAgentPublicOperationStoreV4(descriptor,{get:key=>Store.getItemAsync(key,options),set:(key,value)=>Store.setItemAsync(key,value,options),digest:async text=>Array.from(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256,new TextEncoder().encode(text))),v=>v.toString(16).padStart(2,'0')).join('')});
}
