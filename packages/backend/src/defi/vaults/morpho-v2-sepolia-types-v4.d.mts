/** Public DATA and opaque Original handles. Types confer no runtime authority. */
export type Hex = `0x${string}`;
export type Atomic = string;
export type BlockTag = 'latest' | 'finalized' | Hex;
export interface OriginalReadonlyRuntime { readonly metadata: Readonly<Record<string, unknown>> }
declare const venueBrand: unique symbol;
declare const planBrand: unique symbol;
declare const initializationBrand: unique symbol;
declare const targetBrand: unique symbol;
export interface OriginalMorphoV2Venue { readonly [venueBrand]: true; readonly profile: 'ORIGINAL_MORPHO_V2_SEPOLIA_READONLY_V4' }
export interface OriginalMorphoV2TargetPlan { readonly [planBrand]: true }
export interface OriginalMorphoV2Initialization { readonly [initializationBrand]: true }
export interface OriginalMorphoV2Target { readonly [targetBrand]: true; readonly profile: 'ORIGINAL_MORPHO_V2_SEPOLIA_TARGET_SYSTEM_V4'; readonly account: Hex; readonly chainId: '11155111'; readonly financialAcceptance: false; readonly privateProofAcceptance: false; readonly [key: string]: unknown }
export interface MorphoV2ReadonlyView {
 readonly profile:'ORIGINAL_MORPHO_V2_SEPOLIA_READONLY_SNAPSHOT_V4'; readonly networkId:'ethereum-sepolia'; readonly chainId:'11155111'; readonly shares:Atomic;
 readonly maximumInputAtomic:Atomic; readonly estimatedUnderlyingAtomic:Atomic; readonly underlyingLiquidityAtomic:Atomic; readonly shareDecimals:18; readonly underlyingDecimals:6;
 readonly reserve:Readonly<{active:boolean;frozen:null;paused:null;availability:'VENUE_BACKING_ONLY'}>;
 readonly position:Readonly<{holder:Hex;heldShares:Atomic;maximumRedeemableShares:Atomic;requestedAmountOnly:true;gates:Readonly<{canReceiveShares:boolean;canSendAssets:boolean;canSendShares:boolean;canReceiveAssets:boolean}>}>|null;
 readonly financialAuthority:false; readonly privateBalanceCredited:false; readonly trust:'RPC_PROVIDER'; readonly independentConsensus:false; readonly [key:string]:unknown;
}
export interface MorphoV2ShareQuote { readonly profile:'ORIGINAL_MORPHO_V2_SEPOLIA_SHARE_QUOTE_V4'; readonly view:MorphoV2ReadonlyView; readonly quoteIsAuthorization:false; readonly privateOutputPrepared:false }
export interface MorphoV2PreparedOperation { readonly reference:string; readonly kind:'INVEST'|'REDEEM'; readonly phase:'PREPARED'|'UNKNOWN'|'PENDING_FINALITY'|'CONFIRMED'; readonly to:Hex; readonly calldata:Hex; readonly nativeId:Hex|null; readonly financialAuthority:false; readonly walletBalanceCredited:false; readonly [key:string]:unknown }
export interface MorphoV2InvestmentRequest { reference:string;receiptCommitment:string;proof:string;ownerPublicInputs:string[];maximumInputAtomic:Atomic;validFrom:Atomic;validUntil:Atomic }
export interface MorphoV2RedemptionRequest { reference:string;withdrawalTransactionHash:Hex;shares:Atomic;minimumAssets:Atomic;deadline:Atomic;receiver:Hex }
export interface OriginalMorphoV2RetainedAdapter {
 prepareInvestment(request:MorphoV2InvestmentRequest):Promise<MorphoV2PreparedOperation>;
 recordSubmission(request:{reference:string;nativeId:Hex}):Promise<MorphoV2PreparedOperation>;
 observe(reference:string):Promise<MorphoV2PreparedOperation>;
 position(shares:Atomic):Promise<Readonly<{profile:'ORIGINAL_MORPHO_V2_SEPOLIA_PRIVATE_POOL_BACKING_VIEW_V4';publicPosition:MorphoV2ReadonlyView;privateOwnerBalance:null;availableUnderlying:null;underlyingSpendable:false;walletBalanceCredited:false;[key:string]:unknown}>>;
 prepareRedemption(request:MorphoV2RedemptionRequest):Promise<MorphoV2PreparedOperation>;
 read():Promise<Readonly<{profile:'ORIGINAL_MORPHO_V2_SEPOLIA_ACTION_TRACKING_V4';revision:number;operations:readonly MorphoV2PreparedOperation[];financialAuthority:false;walletBalanceCredited:false;[key:string]:unknown}>>;
 close():Promise<void>;
}
