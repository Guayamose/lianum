/** Fixed public composition API. Signer orchestration owns the keyless RPC;
 * no lower module imports this wrapper or receives a caller callback. */
import {createOriginalPagedPublicSepoliaReceiverV4,dispatchOriginalPagedPublicSepoliaBootstrapV4,runOriginalPagedPublicSepoliaPlanV4} from '../../providers/paged-public-testnet-runtimes-v1.mjs';
export {isOriginalPagedSepoliaReceiverRuntimeV4,assertOriginalPagedSepoliaReceiverRuntimeV4} from './sepolia-receiver-rpc-v4.mjs';
export {assertSepoliaReceiverBootstrapReadyV4,readOriginalPagedSepoliaReceiverSigningV4} from './key-store-v1.mjs';
export async function createOriginalPagedSepoliaReceiverRuntimeV4(input){if(arguments.length!==1||!input||Object.getPrototypeOf(input)!==Object.prototype||Reflect.ownKeys(input).length!==1||!Object.hasOwn(Object.getOwnPropertyDescriptor(input,'nativeRuntime')??{},'value'))throw Error('SEPOLIA_RECEIVER_FACTORY_INPUT');return createOriginalPagedPublicSepoliaReceiverV4(input.nativeRuntime);}
export const preflightOriginalPagedSepoliaDeploymentConstructorV4=(runtime,token)=>dispatchOriginalPagedPublicSepoliaBootstrapV4(runtime,'PREFLIGHT',[token]);
export const executeOriginalPagedSepoliaDeploymentConstructorV4=(runtime,token,limits)=>dispatchOriginalPagedPublicSepoliaBootstrapV4(runtime,'EXECUTE',[token,limits]);
export const finalizeOriginalPagedSepoliaDeploymentV4=(runtime,completion)=>dispatchOriginalPagedPublicSepoliaBootstrapV4(runtime,'FINALIZE',[completion]);
export const readOriginalPagedSepoliaBootstrapStartNonceV4=runtime=>dispatchOriginalPagedPublicSepoliaBootstrapV4(runtime,'START_NONCE',[]);
export const preflightOriginalFundedPagedGraphSepoliaWalletV4=(runtime,input)=>runOriginalPagedPublicSepoliaPlanV4(runtime,input);
export const deployOriginalFundedPagedGraphSepoliaWalletV4=(runtime,input,limits)=>runOriginalPagedPublicSepoliaPlanV4(runtime,input,limits);
export {configureOriginalPagedPublicSepoliaSourceV4,preflightOriginalPagedPublicSepoliaSourceV4,readOriginalPagedPublicSepoliaSourceV4} from '../../providers/paged-public-testnet-runtimes-v1.mjs';

export {reopenOriginalPagedPublicSepoliaReceiverV4} from '../../providers/paged-public-testnet-runtimes-v1.mjs';
export {retainOriginalFundedPagedGraphSepoliaDeploymentV4} from '../../operations/local/funded-graph-paged-public-kernel-v4.mjs';
export {reopenOriginalPagedPublicSepoliaSourceObserverV4} from '../../providers/paged-public-testnet-runtimes-v1.mjs';
