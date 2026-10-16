/** Public DATA types for existing routes. No DTO grants custody or spending
 * authority; use the real wallet approval and scoped agent-read SDK. */
import type {
  DevicePagedAgentProposalV4,
  DevicePagedSignedAgentProposalV4,
  DevicePagedAgentProgressAnyV5 as DevicePagedAgentProgressV4,
} from '@lianum/mobile-protocol/device/paged-agent-v4';
import type {
  DevicePagedSignedAgentReadGrantAnyV5,
} from '@lianum/mobile-protocol/device/paged-agent-read-lifetime-v5';
import type {
  DeviceSepoliaDefiReviewV4,
  DeviceSepoliaDefiReviewChallengeV4,
} from '@lianum/mobile-protocol/device/sepolia-defi-review-v4';
import type {
  DeviceSepoliaDefiFinancialStatusV7,
} from '@lianum/mobile-protocol/device/sepolia-defi-financial-status-v7';
import type {
  ExternalFlatAccess,
  ExternalFlatConsent,
} from '@lianum/mobile-protocol/device/source-note-v1';
/** Uniswap already travels through its original graph; no new swap endpoint. */
export type {
  DevicePagedUniswapIntentV3,
} from '@lianum/mobile-protocol/device/paged-uniswap-v3';
export type {
  DevicePagedPublicUniswapPreparationV4,
} from '@lianum/mobile-protocol/device/paged-uniswap-public-v4';

export type AtomicAmount = string; // Existing validators require canonical decimal integers.
export type Hex32 = string; // bare 64 lowercase hex unless a field explicitly uses 0x.
export type Uuid = string;
export type NativeChain = 'ethereum' | 'bitcoin' | 'solana';
export type Native3TestNetwork = 'ethereum-sepolia' | 'bitcoin-testnet' | 'solana-devnet';
export type NativeAccountData = Readonly<{
  chain: NativeChain;
  network: 'mainnet' | 'testnet';
  networkId: string;
  address: string;
  path: string;
  publicKey: string;
}>;
export type NativeNetworkData = Readonly<{
  id: string;
  chain: NativeChain;
  network: 'mainnet' | 'testnet';
  genesisHash: string;
  symbol: string;
  decimals: number;
  trust: 'RPC_PROVIDER';
}>;
export type NativeBalanceData = Readonly<{
  networkId: string;
  network: NativeNetworkData;
  address: string;
  balanceAtomic: AtomicAmount;
  spendableAtomic: AtomicAmount;
  reservedAtomic: AtomicAmount;
  hasPendingTransfer: boolean;
  observed: Readonly<{ blockHash: string; blockNumber: string }>;
}>;
export type NativeSendQuoteData = Readonly<{
  profile: 'NATIVE_WALLET_SEND_QUOTE_V1';
  id: Uuid;
  networkId: string;
  network: NativeNetworkData;
  account: NativeAccountData;
  recipient: string;
  amountAtomic: AtomicAmount;
  fee: Readonly<{ assetSymbol: string; maximumAtomic: AtomicAmount }>;
  transaction: unknown; // Network-specific existing validateNativeSendReviewV1.
  issuedAt: number;
  expiresAt: number; // issuedAt + 120000.
  quoteSHA256: Hex32;
}>;
export type NativeTransferResultData = Readonly<{
  operationId: Uuid;
  quoteId: Uuid;
  id: string | null; // Network transaction identifier, never a new operation ID.
  networkId: string;
  status: 'PREPARED' | 'EXPIRED' | 'SUBMITTED' | 'UNKNOWN' | 'CONFIRMED' | 'FINALIZED' | 'FAILED';
  terminal: boolean;
  confirmations: string | null;
  blockHash: string | null;
  blockNumber: string | null;
  feeAtomic: AtomicAmount | null;
  errorCode: string | null;
}>;
export type NativePrepareRequestData = Readonly<{
  operationId?: Uuid; // Integrators SHOULD persist and supply their existing ID.
  account: NativeAccountData;
  networkId?: string;
  recipient: string;
  amountAtomic: AtomicAmount;
}>;

/** Public wallet signing occurs only in the existing wallet session/custody. */
export type PublicWalletChallengeData = Readonly<{
  profile: 'LIANUM_NATIVE_WALLET_REQUEST_V1';
  origin: string;
  method: 'POST';
  path: PublicWalletAuthenticatedRoute;
  bodySHA256: Hex32;
  devicePublicKey: string;
  nonce: Hex32;
  issuedAt: number;
  expiresAt: number; // Exactly issuedAt + 60000, one use.
}>;
export type PublicWalletEnvelopeData = Readonly<{
  challenge: PublicWalletChallengeData;
  signature: string;
  body: string; // Exact JSON text hashed in challenge.bodySHA256.
}>;
export type PublicWalletAuthenticatedRoute =
  | '/v1/wallet/connections'
  | '/v1/native/account' | '/v1/native/prepare' | '/v1/native/submit'
  | '/v1/native/status' | '/v1/native/cancel'
  | '/v1/fiat/sessions' | '/v1/fiat/orders/read' | '/v1/fiat/orders/reconcile';

/** Inner body contract. HTTP requires the signed envelope above. */
export interface NativeWalletRouteData {
  '/v1/native/account': { request: NativeAccountData; response: NativeBalanceData };
  '/v1/native/prepare': { request: NativePrepareRequestData; response: NativeSendQuoteData };
  '/v1/native/submit': { request: Readonly<{ quoteId: Uuid; rawTransaction: string }>; response: NativeTransferResultData };
  '/v1/native/status': { request: Readonly<{ id: string }>; response: NativeTransferResultData };
  '/v1/native/cancel': { request: Readonly<{ id: Uuid }>; response: NativeTransferResultData };
}

/** Existing owner-only DeFi wire contract; wallet executes actual custody flow. */
export type DefiFinancialLookupData = Readonly<{
  access: ExternalFlatAccess;
  signature: string;
  reference: Hex32;
  jobId: Hex32;
}>;
export type DefiProposalRequestData = Readonly<{
  access: ExternalFlatAccess;
  signature: string;
  protocol: 'AAVE_STATIC' | 'MORPHO_V2';
  action: 'INVEST' | 'REDEEM';
  rootId: Hex32; // SHARE-note root; never forced equal to Source7 ETH-budget root.
  noteRevision: number;
  sharesAtomic: AtomicAmount;
  maximumInputAtomic: AtomicAmount | null;
  minimumAssetsAtomic: AtomicAmount | null;
  underlyingReceiver: string; // Explicit nonzero user's EVM address.
  shareWithdrawalRecipient: string; // Fixed Original temporary custodian.
  receiptCommitment: Hex32 | null; // INVEST nonzero, REDEEM null; no receiptSecret.
}>;
export interface DefiFinancialRouteData {
  '/v1/mobile/sepolia-defi-shares/defi-proposals': {
    request: DefiProposalRequestData;
    response: Readonly<{ review: DeviceSepoliaDefiReviewV4 }>;
  };
  '/v1/mobile/sepolia-defi-shares/defi-reviews': {
    request: Readonly<{ review: DeviceSepoliaDefiReviewV4 }>;
    response: DeviceSepoliaDefiReviewChallengeV4;
  };
  '/v1/mobile/sepolia-defi-shares/financial-submit': {
    request: DefiFinancialLookupData & Readonly<{ capitalNodeId: string }>;
    response: DeviceSepoliaDefiFinancialStatusV7;
  };
  '/v1/mobile/sepolia-defi-shares/financial-observe': {
    request: DefiFinancialLookupData;
    response: DeviceSepoliaDefiFinancialStatusV7;
  };
  '/v1/mobile/sepolia-defi-shares/withdrawal-review': {
    request: DefiFinancialLookupData;
    response: Readonly<{ consent: ExternalFlatConsent }>;
  };
  '/v1/mobile/sepolia-defi-shares/withdrawal-arm': {
    request: DefiFinancialLookupData & Readonly<{ consent: ExternalFlatConsent; consentSignature: string }>;
    response: DeviceSepoliaDefiFinancialStatusV7;
  };
  '/v1/mobile/sepolia-defi-shares/redeem-submit': {
    request: DefiFinancialLookupData;
    response: DeviceSepoliaDefiFinancialStatusV7;
  };
}
export type { DeviceSepoliaDefiReviewV4, DeviceSepoliaDefiFinancialStatusV7 };

/** Actual extractable external SDK: same function names and runtime semantics. */
export type DevicePagedAgentObservationV4 = Readonly<{
  grantId: Hex32;
  readsUsed: number;
  progress: DevicePagedAgentProgressV4;
}>;
export interface DevicePagedAgentApiV4 {
  readonly descriptor: unknown;
  readonly readerPublicKey: string;
  readonly grant: DevicePagedSignedAgentReadGrantAnyV5;
  observe(): Promise<DevicePagedAgentObservationV4>;
  snapshot(): null | Readonly<{
    grantId: Hex32;
    readsUsed: number;
    progress: Omit<DevicePagedAgentProgressV4, 'current'> & { readonly current: boolean };
    financialPermission: false;
  }>;
  revoke(): Promise<Readonly<{ profile: 'DEVICE_PAGED_AGENT_READ_REVOKED_V4'; grantId: Hex32; revoked: true }>>;
  close(): void;
}
export declare function createDevicePagedAgentNativeProposalV4(
  agentKey: Uint8Array, // Agent's own key, never the device's key.
  descriptor: unknown,
  terms: DevicePagedAgentProposalV4['terms'],
  nodes: DevicePagedAgentProposalV4['nodes'],
): DevicePagedSignedAgentProposalV4;
export declare function verifyDevicePagedAgentNativeProposalV4(raw: unknown): DevicePagedSignedAgentProposalV4;
export declare function createDevicePagedAgentProposalLinkV4(raw: unknown): string;
export declare function parseDevicePagedAgentProposalLinkV4(text: string, descriptor: unknown): DevicePagedSignedAgentProposalV4;
export declare function verifyDevicePagedAgentReadGrantV4(raw: unknown, descriptor: unknown): DevicePagedSignedAgentReadGrantAnyV5;
export declare function createDevicePagedAgentApiV4(input: Readonly<{
  descriptor: unknown;
  agentKey: Uint8Array;
  grant: unknown;
  fetchImpl: typeof fetch; // Fixed verified transport only; not a financial signer.
}>): Readonly<DevicePagedAgentApiV4>;
export declare function readDevicePagedAgentObservationV4(raw: unknown): DevicePagedAgentObservationV4;

/** Existing MoonPay DATA only. Activation/integration remains future work. */
export type FiatSessionRequestData = Readonly<{
  requestId: Uuid;
  flow: 'BUY' | 'SELL';
  asset: 'BTC' | 'ETH' | 'SOL';
  network: NativeChain;
  fiatCurrency: 'EUR';
  amount: string; // BUY EUR (2 decimals), SELL asset (8/18/9); not atomic integer.
  walletAddress: string;
}>;
export type FiatOrderData = FiatSessionRequestData & Readonly<{
  profile: 'LIANUM_MOONPAY_CHECKOUT_V1' | 'LIANUM_MOONPAY_ORDER_V1';
  id: Uuid;
  externalTransactionId: Uuid;
  environment: 'SANDBOX' | 'PRODUCTION';
  chain: string;
  checkoutUrl?: string;
  status: 'CHECKOUT_READY' | 'PROVIDER_PENDING' | 'PROVIDER_FAILED' | 'PROVIDER_COMPLETED' | 'UNKNOWN';
  createdAt: number;
  expiresAt: null;
  providerStatus: string | null;
  providerTransactionId: Uuid | null;
  providerUpdatedAt: number | null;
  lastQueriedAt: number | null;
  receivedAmount: string | null;
  feeAmount: string | null;
  networkFeeAmount: string | null;
  transactionHash: string | null;
  deposit: null | Readonly<{ address: string; amountAtomic: AtomicAmount; networkId: string; expiresAt: number }>;
  chainConfirmation: 'UNVERIFIED';
  privateBalanceCredited: false;
}>;
export interface FiatRouteData {
  '/v1/fiat/sessions': { request: FiatSessionRequestData; response: FiatOrderData };
  '/v1/fiat/orders/read': { request: Readonly<{ id: Uuid }>; response: FiatOrderData };
  '/v1/fiat/orders/reconcile': { request: Readonly<{ id: Uuid }>; response: FiatOrderData };
}

/** No new API/URL is proposed by these declarations. Missing intentionally:
 * universal execute/recover endpoint; agent DeFi proposal; new wallet authority;
 * arbitrary issuer/signer callback; automatic retry of a financial write;
 * claims that simulation SDK, hosted merchant setup or crash recovery are done.
 */
