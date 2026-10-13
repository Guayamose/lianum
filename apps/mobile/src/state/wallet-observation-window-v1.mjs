/** Fixed display lifetime only. This DATA has no signing/custody authority.
 * Capture it only after the original SDK verified the observation. */
export function walletObservationWindowV1({issuedAt,expiresAt,deadlineMs=expiresAt}){
 const wall=Date.now(),elapsed=performance.now(),cutoff=Math.min(expiresAt,deadlineMs);
 if(![issuedAt,expiresAt,deadlineMs,wall].every(Number.isSafeInteger)||issuedAt>wall||expiresAt<=issuedAt||expiresAt-issuedAt>15000||cutoff<=wall||!Number.isFinite(elapsed))throw Error('MOBILE_WALLET_OBSERVATION_WINDOW');
 let expired=false;const remaining=cutoff-wall;
 return Object.freeze({issuedAt,expiresAt:cutoff,fresh(){const now=Date.now(),tick=performance.now();if(!Number.isSafeInteger(now)||!Number.isFinite(tick)||now<issuedAt||now>=cutoff||tick<elapsed||tick-elapsed>=remaining)expired=true;return!expired;}});
}
