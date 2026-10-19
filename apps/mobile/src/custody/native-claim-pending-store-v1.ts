import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import {Platform} from 'react-native';
import {readDevicePublicKey} from './key-store';
import {createNativeClaimPendingRedemptionV1} from './native-claim-pending-v1.mjs';
const options:SecureStore.SecureStoreOptions={requireAuthentication:true,
 keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
 keychainService:'org.lianum.wallet.native-claim.pending.v1',
 authenticationPrompt:"Recover the same BTC/SOL operation from Lianum"};
async function protectedStorage(){if(!['ios','android'].includes(Platform.OS)||!await SecureStore.isAvailableAsync()||!SecureStore.canUseBiometricAuthentication())throw Error('MOBILE_PROTECTED_STORAGE_UNAVAILABLE');}
export const pendingNativeClaimRedemptionV1=createNativeClaimPendingRedemptionV1({
 async get(key){await protectedStorage();return SecureStore.getItemAsync(key,options);},
 async set(key,value){await protectedStorage();await SecureStore.setItemAsync(key,value,options);},
 digest:value=>Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,value),
 devicePublicKey:readDevicePublicKey,
});
