/** Durable opening counter DATA only. It neither limits composition depth nor
 * authorizes another opening. Supervisors retain all their Original guards. */
import assert from 'node:assert/strict';
export function normalizePagedSupervisorGenerationDataV8(value){
 assert.ok(Number.isSafeInteger(value)&&value>=0&&!Object.is(value,-0),'PAGED_SUPERVISOR_GENERATION_INVALID');return value;
}
export function nextPagedSupervisorGenerationDataV8(value){
 normalizePagedSupervisorGenerationDataV8(value);
 assert.ok(value<Number.MAX_SAFE_INTEGER,'PAGED_SUPERVISOR_GENERATION_OVERFLOW');return value+1;
}
