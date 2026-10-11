/** Generic same-host coordinator. Durable SOURCE and wrapped lifetime
 * composition belongs to @lianum/backend/accounts/durable-keeper. */
import {startGenericAccountKeeper} from './generic-account-keeper-core.mjs';
export {assertOriginalGenericAccountKeeperV1} from './generic-account-keeper-core.mjs';
export async function createGenericAccountKeeper(input, options = {}) {
  return (await startGenericAccountKeeper(input, options)).keeper;
}
