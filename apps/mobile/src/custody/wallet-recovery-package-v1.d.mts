export const WALLET_RECOVERY_MAX_BYTES_V1:number;
export type WalletRecoveryCustodyV1=Readonly<{kind:'PAGED_NOTE'|'PAGED_GRAPH'|'EXTERNAL_FLAT';descriptor:any;backup:string}>;
export type WalletRecoveryInventoryV1=Readonly<{devicePublicKey:string;createdAt:number;identityBackup:string;connections:readonly string[];custodies:readonly WalletRecoveryCustodyV1[];backendRequired:readonly Readonly<{kind:'POSITIONS';origin:string;pairingId:string}>[];excluded:readonly string[]}>;
export function createWalletRecoveryPackageV1(input:{devicePublicKey:string;identityBackup:string;connections:readonly string[];custodies:readonly WalletRecoveryCustodyV1[]},passphrase:string,signal?:AbortSignal):Promise<string>;
export function walletRecoveryPackagePublicKeyV1(serialized:string):string;
export function openWalletRecoveryPackageV1(serialized:string,passphrase:string,expectedPublicKey:string,signal?:AbortSignal):Promise<WalletRecoveryInventoryV1>;

export function readWalletRecoveryInventoryV1(raw:unknown,serialized:string,signal:AbortSignal):WalletRecoveryInventoryV1;
