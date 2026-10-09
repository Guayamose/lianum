import type {OriginalPrivateStateObservationV1} from '@lianum/mobile-protocol/original-account-v2';
import type {DeviceDefiPositionObservationV1} from '../../../../packages/mobile-protocol/src/device-defi-position-read-v1.mjs';
import type {ExternalFlatStatus} from '../../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';
export type PrivateWalletRowV1=Readonly<{key:string;route:Readonly<Record<string,string|number>>;label:string;decimals:number|null;
 state:'LIVE'|'STALE'|'UNKNOWN';available:string|null;reserved:string|null;locked:string|null;recovery:string|null;shares:string|null;
 valuation:Readonly<{amount:string;assetId:string|null;token:string;spendable:false}>|null;noteAmount:string|null;
 requests:readonly Readonly<{requestId:string;kind:string;state:string;disposition:string|null}>[];custody:'BACKEND'|'DEVICE';observed:unknown}>;
export type PrivateWalletStateV1=Readonly<{version:1;revision:number;rows:readonly PrivateWalletRowV1[];aggregateBalance:null;completePortfolio:false;readOnly:true}>;
export type PrivateWalletStateActorV1=Readonly<{
 acceptAccount(value:OriginalPrivateStateObservationV1):void;
 acceptPositions(value:DeviceDefiPositionObservationV1):void;
 acceptExternal(value:ExternalFlatStatus):void;
 snapshot():PrivateWalletStateV1;
 clear():void;
}>;
export function createPrivateWalletStateV1():PrivateWalletStateActorV1;
