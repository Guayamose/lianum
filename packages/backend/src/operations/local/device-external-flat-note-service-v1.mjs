/** Private fixed caller: original runtime/system/token must already be owned.
 * Install this service before funding. HTTP has no constructor/deploy/funder. */
import {externalFlatExactV1} from '../../../../mobile-protocol/src/device-external-flat-note-v1.mjs';
import {createOriginalDeviceExternalFlatNoteAuthorityV1,createOriginalDeviceExternalFlatShareNoteAuthorityV1} from '../../accounts/authority/device-external-flat-note-authority-v1.mjs';
import {createOriginalDeviceExternalFlatTlsServerV1} from '../../api/mobile/device-external-flat-note-http-v1.mjs';
export async function createOriginalDeviceExternalFlatNoteServiceV1(input){
 if(arguments.length!==1)throw Error('DEVICE_EXTERNAL_FLAT_SERVICE_INPUT');
 const v=externalFlatExactV1(input,['runtime','system','poolIndex','origin','devicePublicKey','tls','host']);
 const account=await createOriginalDeviceExternalFlatNoteAuthorityV1(Object.fromEntries(['runtime','system','poolIndex','origin','devicePublicKey'].map(k=>[k,v[k]])));
 let listener;try{listener=await createOriginalDeviceExternalFlatTlsServerV1({account,tls:v.tls,host:v.host});}
 catch(e){await account.close();throw e;}
 let closing;return Object.freeze({account,descriptor:account.descriptor,url:listener.url,
 close(){if(arguments.length!==0)throw Error('DEVICE_EXTERNAL_FLAT_SERVICE_INPUT');
 if(!closing)closing=listener.close();return closing;}});
}

/** A distinct target/share service. The paired device creates its D27 opening;
 * GRAPH receives only the original public proof through the private account. */
export async function createOriginalDeviceExternalFlatShareNoteServiceV1(input){
 if(arguments.length!==1)throw Error('DEVICE_EXTERNAL_FLAT_SERVICE_INPUT');
 const v=externalFlatExactV1(input,['runtime','system','poolIndex','deliveryObserver','origin','devicePublicKey','tls','host']);
 const account=await createOriginalDeviceExternalFlatShareNoteAuthorityV1(Object.fromEntries(['runtime','system','poolIndex','deliveryObserver','origin','devicePublicKey'].map(k=>[k,v[k]])));
 let listener;try{listener=await createOriginalDeviceExternalFlatTlsServerV1({account,tls:v.tls,host:v.host});}catch(error){await account.close();throw error;}
 let closing;return Object.freeze({account,descriptor:account.descriptor,url:listener.url,close(){if(arguments.length!==0)throw Error('DEVICE_EXTERNAL_FLAT_SERVICE_INPUT');return closing??=listener.close();}});
}
