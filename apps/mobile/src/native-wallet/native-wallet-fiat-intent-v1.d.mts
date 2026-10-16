import type {NativeWalletFiatRequestV1} from './native-wallet-ui-port';
export function normalizeNativeWalletFiatIntentV1(raw:unknown):NativeWalletFiatRequestV1;
export function selectNativeWalletFiatIntentV1(requests:readonly unknown[],orders:readonly {requestId:string}[],raw:unknown):NativeWalletFiatRequestV1;
