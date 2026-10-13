export const NATIVE_WALLET_AUTH_ROUTES_V1:readonly string[];
export function nativeWalletBodyHashV1(raw:string):string;
export function nativeWalletAuthMessageV1(value:unknown,expected:{origin:string;path:string;bodySHA256:string;devicePublicKey:string},now?:number):Uint8Array;
export function verifyNativeWalletAuthV1(challenge:unknown,signature:string,expected:{origin:string;path:string;bodySHA256:string;devicePublicKey:string},now?:number):boolean;
