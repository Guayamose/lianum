/** Explicit PRIVATE installation in an already-created original DeFi realm.
 * Never reachable through JSON/environment/account IDs or the SQL platform.
 * Close this READ listener before capturing/closing the retained wallet. */
import {types} from 'node:util';
import {retainedExternalVaultWalletContextV1} from './external-defi-retained-vault-wallet-v1.mjs';
import {createPairedOriginalDefiPositionReaderV1} from '../../api/mobile/paired-original-defi-position-reader-v1.mjs';
import {createPairedOriginalDefiPositionTlsServerV1} from '../../api/mobile/paired-original-defi-position-http-v1.mjs';
const installed=new WeakSet();
export async function installRetainedVaultDevicePositionServiceV1(wallet,input){
 if(arguments.length!==2||types.isProxy(wallet)||!input||types.isProxy(input)||Object.getPrototypeOf(input)!==Object.prototype||Reflect.ownKeys(input).length!==3||!['origin','devicePublicKey','tls'].every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(input,k)??{},'value')))throw Error('DEVICE_DEFI_PRIVATE_INSTALLATION');
 const original=retainedExternalVaultWalletContextV1(wallet);if(installed.has(wallet))throw Error('DEVICE_DEFI_ALREADY_INSTALLED');
 const reader=createPairedOriginalDefiPositionReaderV1({runtime:original.runtime,catalogue:original.catalogue,session:original.session,service:wallet.exit,origin:input.origin,devicePublicKey:input.devicePublicKey});
 installed.add(wallet);try{return await createPairedOriginalDefiPositionTlsServerV1({reader,tls:input.tls});}catch(error){reader.close();throw error;}
}
