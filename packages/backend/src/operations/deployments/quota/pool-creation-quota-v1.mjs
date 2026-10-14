/** Canonical original quota facade. Its six functions come from the same
 * private ownership composition; isolated mechanical builders cannot register
 * a quota, ticket, lease or spending capability here. */
export {createOriginalPoolCreationQuotaV1,openOriginalPoolCreationQuotaV1,assertOriginalPoolCreationQuotaV1,chargeOriginalPoolCreationV1,consumeOriginalPoolCreationTicketV1,reconcileOriginalPoolCreationV1} from '../../../chains/evm/runtime/local-evm-ownership.mjs';
