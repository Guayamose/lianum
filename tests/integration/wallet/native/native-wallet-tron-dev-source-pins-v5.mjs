/** Current TRON wallet execution capsule; the retained V5 publication remains
 * separate compiler evidence, never an assertion about current source bytes. */
import assert from 'node:assert/strict';
import {captureNativeValueCurrentFinancialSourcesV6} from '../../../../packages/backend/src/operations/releases/native-value/native-value-dev-financial-source-pins-v5.mjs';
export function nativeWalletTronDevSourcePinsV5(){
 assert.equal(arguments.length,0,'TRON_WALLET_DEV_PINS_NO_OPTIONS');
 const current=captureNativeValueCurrentFinancialSourcesV6();
 return {...current,format:'NATIVE_WALLET_TRON_DEV_ADOPTED_SOURCE_CAPSULE_V6'};
}
