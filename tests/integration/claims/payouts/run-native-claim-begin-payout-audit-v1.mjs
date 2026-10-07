/** Fixed closed one-shot boundary diagnostic. No caller-selected stop mode. */
import { assertBeginPayoutAuditReleaseV1 } from '../../../../packages/backend/src/claims/payouts/begin-payout-audit-policy-v1.mjs';
assertBeginPayoutAuditReleaseV1();
const { runNativeClaimBeginPayoutAuditSupervisorV1 } = await import('../../native/native-flow-supervisor.mjs');
await runNativeClaimBeginPayoutAuditSupervisorV1();
