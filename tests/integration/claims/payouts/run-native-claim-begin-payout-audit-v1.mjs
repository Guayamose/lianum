/** Fixed closed one-shot boundary diagnostic. No caller-selected stop mode. */
import { assertBeginPayoutAuditReleaseV1 } from '@lianum/proofs/jobs/begin-payout-audit-policy-v1';
assertBeginPayoutAuditReleaseV1();
const { runNativeClaimBeginPayoutAuditSupervisorV1 } = await import('../../native/native-flow-supervisor.mjs');
await runNativeClaimBeginPayoutAuditSupervisorV1();
