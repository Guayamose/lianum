import * as Store from 'expo-secure-store';
import {createPublicConnectionRegistryV1} from './public-connection-registry-v1.mjs';
/** Native protected application storage for public certificates/descriptors.
 * No ROOT/session key, balance, witness or permission is passed to this store. */
export function createNativePublicConnectionRegistryV1(devicePublicKey:string){
 const options={keychainService:'org.lianum.wallet.public.connections.v1',keychainAccessible:Store.WHEN_UNLOCKED_THIS_DEVICE_ONLY};
 return createPublicConnectionRegistryV1({devicePublicKey,storage:{get:key=>Store.getItemAsync(key,options),set:(key,value)=>Store.setItemAsync(key,value,options),remove:key=>Store.deleteItemAsync(key,options)}});
}
