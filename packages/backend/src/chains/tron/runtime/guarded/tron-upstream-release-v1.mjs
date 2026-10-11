/** Immutable upstream metadata and the original canonical release gate. */
export const TRON_UPSTREAM=Object.freeze({repository:'https://github.com/tronprotocol/java-tron',tag:'GreatVoyage-v4.8.2.3',commit:'5c449a18a2bb995d3b688d1587e664d909b473c7',
  fullNodeSHA256:'faef7f4d89b9f154632bbab2db1712c25f02ee37b356013e098558ea994accec',fullNodeBytes:145750002,requiredJava:'1.8',arch:'x64'});
// This is a release gate, not configuration. Do not populate from environment,
// argument, a caller manifest or the digest of a just-compiled unreviewed binary.
export const OWNED_TRON_RUNTIME_RELEASE=null;
