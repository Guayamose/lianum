/** Final external-note signing order. The runtime supplies its closed custody
 * methods; this mechanism owns no keys, token registry or runtime capability. */
export async function signExternalNoteAfterGuardV1(expected,scope,custody,assertAlive,{prepare,consume,revoke}){
  const prepared=Object.freeze({transaction:Object.freeze(expected)});
  const lease=await prepare(custody,prepared);
  try{await scope.beforeKey(expected);scope.assertBeforeKey(expected);assertAlive();
    return consume(custody,lease,prepared);
  }finally{revoke(lease);}
}
