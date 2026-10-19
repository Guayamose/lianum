import {openAgentStore} from '@lianum/agent/store';
import {createAgentRuntime} from '@lianum/agent/runtime';
import {createOpenAIAgentProvider} from './openai-provider.mjs';
import {createAgentHttpServer} from './http.mjs';
import {createAgentBackendClient} from './backend-client.mjs';
import {createAgentOperationObserver} from './operation-observer.mjs';
import {createFcmPushSender} from './fcm-push.mjs';
import {createOpenAILiveProvider} from './live-provider.mjs';

const directory=process.env.LIANUM_AGENT_DIRECTORY,token=process.env.LIANUM_AGENT_GATEWAY_TOKEN;
if(!directory||!token)throw Error('Set LIANUM_AGENT_DIRECTORY and LIANUM_AGENT_GATEWAY_TOKEN.');
const store=openAgentStore({directory});
const provider=createOpenAIAgentProvider({apiKey:process.env.OPENAI_API_KEY,model:process.env.LIANUM_AGENT_MODEL??'gpt-6-luna',budgetMode:process.env.LIANUM_AGENT_BUDGET_MODE??'session',sessionBudgetCents:Number(process.env.LIANUM_AGENT_SESSION_BUDGET_CENTS??25),webSearch:process.env.LIANUM_AGENT_WEB_SEARCH==='true',allowOtherModels:process.env.LIANUM_AGENT_ALLOW_OTHER_MODELS==='true'});
const allowedDevicePublicKeys=process.env.LIANUM_AGENT_ALLOWED_DEVICE_KEYS?JSON.parse(process.env.LIANUM_AGENT_ALLOWED_DEVICE_KEYS):null;
const backend=createAgentBackendClient({url:process.env.LIANUM_AGENT_BACKEND_URL,token:process.env.LIANUM_AGENT_BACKEND_TOKEN});
const operationOrigin=process.env.LIANUM_AGENT_OPERATION_ORIGIN??null,operationObserver=createAgentOperationObserver({origin:operationOrigin}),pushSender=await createFcmPushSender({credentialsPath:process.env.LIANUM_AGENT_FCM_CREDENTIALS,serviceAccount:process.env.LIANUM_AGENT_FCM_SERVICE_ACCOUNT,projectId:process.env.LIANUM_AGENT_FCM_PROJECT});
const liveProvider=createOpenAILiveProvider({apiKey:process.env.OPENAI_API_KEY,enabled:process.env.LIANUM_AGENT_VOICE==='true'});
const runtime=createAgentRuntime({store,provider,backend,operationObserver,operationOrigin,pushSender,liveProvider,voiceBudgetMicros:Number(process.env.LIANUM_AGENT_VOICE_BUDGET_MICROS??5000000),allowedDevicePublicKeys}),http=createAgentHttpServer({runtime,token});
try{await http.listen({port:Number(process.env.PORT??8790)});runtime.start();}catch(error){await runtime.close();store.close();throw error;}
process.stdout.write(JSON.stringify({service:'lianum-agent',configured:Boolean(provider),persistent:true,financialExecution:false})+'\n');
let stopping=false;
async function stop(){if(stopping)return;stopping=true;await http.close();await runtime.close();store.close();}
process.once('SIGTERM',()=>void stop());process.once('SIGINT',()=>void stop());
