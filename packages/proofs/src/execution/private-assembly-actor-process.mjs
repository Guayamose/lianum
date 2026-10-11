/** PC18 producer/assembler process, trusted fd3 bootstrap.
 * Producer fd4 owner package, fd5 own broker, fd6 assembler leaf delivery.
 * Assembler fd4 owner A, fd5 SOL leaf/readiness, fd6 BTC leaf/readiness.
 * No native handles cross IPC; only random role-specific bridge tokens do.
 */
import { fileURLToPath } from 'node:url';
import { runAssemblyProcess } from '@lianum/engine/assembly/private-assembly-actors';
import { proveAssemblyInWorker, verifyAssemblyInWorker } from './assembly-workers.mjs';
/** bb.js verification hex-decodes public inputs. IPC stays canonical decimal;
 * convert only at the trusted backend boundary, without numerical reduction. */
export function assemblyBackendVerificationPackage(proofPackage) {
  if (!(proofPackage?.proof instanceof Uint8Array) || !Array.isArray(proofPackage.publicInputs)) throw new Error('PC18_VERIFICATION_PACKAGE');
  const modulus = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  const publicInputs = proofPackage.publicInputs.map(value => {
    if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,76})$/.test(value) || BigInt(value) >= modulus) throw new Error('PC18_VERIFICATION_FIELD');
    return `0x${BigInt(value).toString(16).padStart(64, '0')}`;
  });
  return { ...proofPackage, publicInputs };
}
export async function runAssemblyActorProcess(kind, callbacks) {
  if (!['producer', 'assembler'].includes(kind)) throw new Error('PC18_ACTOR_KIND');
  return runAssemblyProcess(kind, callbacks ?? {
    async proveAssembly(mode, input, label) {
      const allowed = kind === 'producer' ? ['sol_local', 'btc_local'] : ['sol_join', 'sol_ready', 'btc_ready', 'fulfill', 'refund'];
      if (!allowed.includes(mode)) throw new Error('PC18_ACTOR_PROOF_MODE');
      return proveAssemblyInWorker(mode, input, label);
    },
    async verifyAssembly(mode, proofPackage) {
      return verifyAssemblyInWorker(mode, assemblyBackendVerificationPackage(proofPackage));
    },
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) runAssemblyActorProcess(process.argv[2]).catch(() => { process.stderr.write('PC18_ACTOR_STARTUP_REJECTED\n'); process.exitCode = 1; });
