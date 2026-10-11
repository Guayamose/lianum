/** Fixed consumers of private SOURCE section tokens. No caller factory, role,
 * path, callback, serialized capability or CAPTURED fallback is accepted. */
import assert from 'node:assert/strict';
import {exactRecord} from '@lianum/components/encoding/commitments';
import {nativeSourceRecoveryOriginalReferenceV1} from './native-original-source-lifecycle-v1.mjs';
import {createOwnedNativeDurableSourceRuntimeV1} from './native-original-source-lifecycle-v1.mjs';
import {retainOriginalNativeSourceBootstrapV1,reopenOriginalNativeSourceBootstrapV1} from '../operators/native-value/native-value-local-operator-bootstrap-v4.mjs';
import {retainOriginalNativeSystemSourceV1,reopenOriginalNativeSystemSourceV1} from '../deployments/native-value/native-value-system-v2.mjs';
import {retainOriginalNativeSourceProviderV1,reopenOriginalNativeSourceProviderV1} from '../../chains/shared/dispatch/native-value-dispatch-owner-v2.mjs';
import {retainOriginalNativeSourceOwnerV1,reopenOriginalNativeSourceOwnerV1} from '../../custody/processes/native-value-owner-process-v2.mjs';
import {retainOriginalNativeExecutorSourceV1,reopenOriginalNativeExecutorSourceV1} from '../../execution/native-value/execution/native-value-execution-v2.mjs';
import {reopenOriginalNativeAccountSourceV1} from '../../accounts/authority/native-value-account-authority-v2.mjs';
import {reopenOriginalNativeSessionSourceV1} from '../../api/accounts/flat-manual-graph-session.mjs';
import {retainOriginalNativeActorSourceV1,reopenOriginalNativeActorSourceV1} from '../../api/mobile/paired-original-account-actor-v2.mjs';
export async function retainFixedOriginalNativeSourcePartV1(token,section,resource){assert.equal(arguments.length,3);
 switch(section){case 'bootstrap':await retainOriginalNativeSourceBootstrapV1(token,resource);break;case 'system':await retainOriginalNativeSystemSourceV1(token,resource);break;case 'provider':await retainOriginalNativeSourceProviderV1(token,resource);break;case 'owner':await retainOriginalNativeSourceOwnerV1(token,resource);break;case 'executor':await retainOriginalNativeExecutorSourceV1(token,resource);break;case 'actor':return retainOriginalNativeActorSourceV1(token,resource);default:assert.fail('NATIVE_SOURCE_FIXED_PART_PRODUCER');}return resource;
}
function refs(token,section,contexts,keys){exactRecord(contexts,keys);const names={runtime:'receiver',nativeRuntime:'graphNative',nativeExecution:'executor',providerCustody:'provider'};for(const key of keys)if(!['clock','dispatchLease'].includes(key))assert.equal(contexts[key],nativeSourceRecoveryOriginalReferenceV1(token,section,names[key]??key),'NATIVE_SOURCE_ORIGINAL_CONTEXT_REFERENCE');}
export async function reopenFixedOriginalNativeSourcePartV1(token,section,contexts){assert.equal(arguments.length,3);
 switch(section){case 'receiver':case 'graphNative':exactRecord(contexts,[]);return createOwnedNativeDurableSourceRuntimeV1(token);
 case 'bootstrap':refs(token,section,contexts,['runtime','nativeRuntime']);return reopenOriginalNativeSourceBootstrapV1(token,contexts);
 case 'system':refs(token,section,contexts,['runtime','bootstrap']);return reopenOriginalNativeSystemSourceV1(token,contexts);
 case 'provider':refs(token,section,contexts,['runtime','system','nativeRuntime','bootstrap']);return reopenOriginalNativeSourceProviderV1(token,contexts);
 case 'owner':refs(token,section,contexts,['runtime','system']);return reopenOriginalNativeSourceOwnerV1(token,contexts);
 case 'executor':refs(token,section,contexts,['runtime','system','nativeRuntime','bootstrap','providerCustody','dispatchLease']);return reopenOriginalNativeExecutorSourceV1(token,contexts);
 case 'account':refs(token,section,contexts,['runtime','system','owner','nativeExecution','providerCustody','clock','nativeRuntime']);return reopenOriginalNativeAccountSourceV1(token,contexts);
 case 'session':{refs(token,section,contexts,['runtime','system','account','owner']);const joined=await reopenOriginalNativeSessionSourceV1(token,contexts);return joined.session;}
 case 'actor':refs(token,section,contexts,['session','account','owner']);return reopenOriginalNativeActorSourceV1(token,contexts);
 default:assert.fail('NATIVE_SOURCE_FIXED_PART_CONSUMER');}
}
