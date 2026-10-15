/** Creation DATA framing, with no Original deployment/signing authority.
 * V5 cannot select a fork by itself: the KeyStore's original canonical
 * preflight selects it, and its signed preparation is privately branded. */
import {sepoliaReceiverCreationUnsignedV4 as legacyUnsigned,signSepoliaReceiverCreationWireV4 as legacySign,validateSepoliaReceiverCreationWireV4 as legacyValidate} from '@lianum/crypto/sepolia-receiver-wire-v4';
import {sepoliaReceiverCreationUnsignedV5 as currentUnsigned,signSepoliaReceiverCreationWireV5 as currentSign,validateSepoliaReceiverCreationWireV5 as currentValidate} from '@lianum/crypto/sepolia-receiver-wire-v5';
export function sepoliaReceiverCreationUnsignedV4(raw){return raw?.profile==='ORIGINAL_PAGED_SEPOLIA_CREATE_V5'?currentUnsigned(raw):legacyUnsigned(raw);}
export function signSepoliaReceiverCreationWireV4(raw,key){return raw?.profile==='ORIGINAL_PAGED_SEPOLIA_CREATE_V5'?currentSign(raw,key):legacySign(raw,key);}
export function validateSepoliaReceiverCreationWireV4(raw,address,wire){return raw?.profile==='ORIGINAL_PAGED_SEPOLIA_CREATE_V5'?currentValidate(raw,address,wire):legacyValidate(raw,address,wire);}
