export type DevicePagedBudgetAssetDataV4=Readonly<{networkId:'ethereum-sepolia';genesis:string;assetIdentity:string;symbol:'ETH';decimals:18;unit:'wei'}>;
export type DevicePagedPublicFundingMetadataDataV4=Readonly<{budgetAsset:DevicePagedBudgetAssetDataV4;fundingOrigin:'OPERATOR_TESTNET'}>;
export function normalizeDevicePagedBudgetAssetDataV4(raw:unknown,descriptor:unknown):DevicePagedBudgetAssetDataV4;
export function normalizeDevicePagedPublicFundingMetadataDataV4(raw:unknown,descriptor:unknown):DevicePagedPublicFundingMetadataDataV4;
export function assertDevicePagedPublicNetworkIdDataV4(networkId:unknown,family:unknown):'ethereum-sepolia'|'bitcoin-testnet'|'solana-devnet';
export function devicePagedBudgetAmountPresentationDataV4(amount:string,descriptor:unknown,metadata?:DevicePagedPublicFundingMetadataDataV4|null):Readonly<{amount:string;unit:string;asset:'ETH'|null;decimals:18|null;network:string;funding:string|null;known:boolean}>;
