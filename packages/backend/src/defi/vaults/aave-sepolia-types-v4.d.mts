/** Public DATA and opaque Original handles. Types confer no runtime authority. */
export type Hex = `0x${string}`;
export type Atomic = string;
export type BlockTag = 'latest' | 'finalized' | Hex;
export interface OriginalReadonlyRuntime { readonly metadata: Readonly<Record<string, unknown>> }
declare const venueBrand: unique symbol;
declare const planBrand: unique symbol;
declare const initializationBrand: unique symbol;
declare const targetBrand: unique symbol;
export interface OriginalAaveVenue { readonly [venueBrand]: true; readonly profile: 'ORIGINAL_AAVE_SEPOLIA_READONLY_V4' }
export interface OriginalAaveTargetPlan { readonly [planBrand]: true }
export interface OriginalAaveInitialization { readonly [initializationBrand]: true }
export interface OriginalAaveTarget { readonly [targetBrand]: true; readonly profile: 'ORIGINAL_AAVE_SEPOLIA_TARGET_SYSTEM_V4'; readonly account: Hex; readonly chainId: '11155111'; readonly financialAcceptance: false; readonly privateProofAcceptance: false; readonly [key: string]: unknown }
export interface AaveReadonlyView {
 readonly profile:'ORIGINAL_AAVE_SEPOLIA_READONLY_SNAPSHOT_V4'; readonly networkId:'ethereum-sepolia'; readonly chainId:'11155111'; readonly shares:Atomic;
 readonly maximumInputAtomic:Atomic; readonly estimatedUnderlyingAtomic:Atomic; readonly underlyingLiquidityAtomic:Atomic; readonly shareDecimals:6; readonly underlyingDecimals:6;
 readonly reserve:Readonly<{active:boolean;frozen:boolean;paused:boolean}>;
 readonly position:Readonly<{holder:Hex;heldShares:Atomic;maximumRedeemableShares:Atomic}>|null;
 readonly financialAuthority:false; readonly privateBalanceCredited:false; readonly trust:'RPC_PROVIDER'; readonly independentConsensus:false; readonly [key:string]:unknown;
}
export interface AaveShareQuote { readonly profile:'ORIGINAL_AAVE_SEPOLIA_SHARE_QUOTE_V4'; readonly view:AaveReadonlyView; readonly quoteIsAuthorization:false; readonly privateOutputPrepared:false }
export interface AavePreparedOperation { readonly reference:string; readonly kind:'INVEST'|'REDEEM'; readonly phase:'PREPARED'|'UNKNOWN'|'PENDING_FINALITY'|'CONFIRMED'; readonly to:Hex; readonly calldata:Hex; readonly nativeId:Hex|null; readonly financialAuthority:false; readonly walletBalanceCredited:false; readonly [key:string]:unknown }
export interface AaveInvestmentRequest { reference:string;receiptCommitment:string;proof:string;ownerPublicInputs:string[];maximumInputAtomic:Atomic;validFrom:Atomic;validUntil:Atomic }
export interface AaveRedemptionRequest { reference:string;withdrawalTransactionHash:Hex;shares:Atomic;minimumAssets:Atomic;deadline:Atomic;receiver:Hex }
export interface OriginalAaveRetainedAdapter {
 prepareInvestment(request:AaveInvestmentRequest):Promise<AavePreparedOperation>;
 recordSubmission(request:{reference:string;nativeId:Hex}):Promise<AavePreparedOperation>;
 observe(reference:string):Promise<AavePreparedOperation>;
 position(shares:Atomic):Promise<Readonly<{profile:'ORIGINAL_AAVE_SEPOLIA_PRIVATE_POOL_BACKING_VIEW_V4';publicPosition:AaveReadonlyView;privateOwnerBalance:null;availableUnderlying:null;underlyingSpendable:false;walletBalanceCredited:false;[key:string]:unknown}>>;
 prepareRedemption(request:AaveRedemptionRequest):Promise<AavePreparedOperation>;
 read():Promise<Readonly<{profile:'ORIGINAL_AAVE_SEPOLIA_ACTION_TRACKING_V4';revision:number;operations:readonly AavePreparedOperation[];financialAuthority:false;walletBalanceCredited:false;[key:string]:unknown}>>;
 close():Promise<void>;
}
