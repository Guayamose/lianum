import {createDevicePagedAgentApiV4} from '@lianum/sdk/agent';
import type {NativeWalletRouteData,DefiFinancialRouteData,FiatRouteData} from '@lianum/sdk/contracts';
type NativeResult=NativeWalletRouteData['/v1/native/status']['response'];
type DefiResult=DefiFinancialRouteData['/v1/mobile/sepolia-defi-shares/financial-observe']['response'];
type FiatResult=FiatRouteData['/v1/fiat/orders/read']['response'];
declare const native:NativeResult,defi:DefiResult,fiat:FiatResult;
declare const reader:ReturnType<typeof createDevicePagedAgentApiV4>;
const nativeStatus:NativeResult['status']='UNKNOWN';
const financialPhase:DefiResult['phase']='PREPARED';
const providerOnly:FiatResult['chainConfirmation']='UNVERIFIED';
// @ts-expect-error A proof is not a financial outcome.
const wrong:DefiResult['phase']='PROVED';
// @ts-expect-error A provider receipt cannot claim chain confirmation.
const wrongFiat:FiatResult['chainConfirmation']='CONFIRMED';
// @ts-expect-error External reader cannot submit or authorize payments.
reader.submit({});
void [native,defi,fiat,nativeStatus,financialPhase,providerOnly,wrong,wrongFiat];
