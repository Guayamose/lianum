import type {ExternalFlatDescriptor} from '../../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';
import type {ExternalFlatGraphDraft,ExternalFlatGraphConsent,ExternalFlatGraphOutputDraft,ExternalFlatGraphOutputConsent} from '../../../../packages/mobile-protocol/src/device-external-flat-graph-v1.mjs';
export function createDeviceExternalFlatGraphApiV1(input:{descriptor:ExternalFlatDescriptor;fetchImpl?:typeof fetch}):Readonly<{descriptor:ExternalFlatDescriptor;challenge():Promise<any>;preparation(access:any,signature:string,terms:{depositJobId:string;rootId:string;assetAmount:string;shareAmount:string;payoutAmount:string;validFrom:string;settleBefore:string}):Promise<any>;review(access:any,signature:string,draft:ExternalFlatGraphDraft):Promise<ExternalFlatGraphConsent>;submit(consent:ExternalFlatGraphConsent,signature:string,witness:any|null):Promise<any>;outputQuote(access:any,signature:string,input:{noteRole:'change'|'recovery';recipient:string}):Promise<ExternalFlatGraphOutputConsent>;outputReview(access:any,signature:string,draft:ExternalFlatGraphOutputDraft):Promise<ExternalFlatGraphOutputConsent>;outputSubmit(consent:ExternalFlatGraphOutputConsent,signature:string,witness:any|null):Promise<any>;status(access:any,signature:string):Promise<any>;close():{closed:true}}>;
export function readDeviceExternalFlatGraphQuoteV1(value:object):any;
export function readDeviceExternalFlatGraphRowV1(value:object):any;
export function readDeviceExternalFlatGraphStatusV1(value:object):any;

export function readDeviceExternalFlatGraphOutputQuoteV1(value:object):any;
export function readDeviceExternalFlatGraphOutputRowV1(value:object):any;

export function readDeviceExternalFlatGraphPreparationV1(value:object):any;
