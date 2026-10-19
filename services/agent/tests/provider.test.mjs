import test from 'node:test';
import assert from 'node:assert/strict';
import OpenAI from 'openai';
import {createOpenAIAgentProvider} from '../src/openai-provider.mjs';
test('official SDK sends Agents API configuration and stable keys without giving the model credentials',async()=>{
 const requests=[];const client=new OpenAI({apiKey:'test-key-not-a-live-credential',maxRetries:0,fetch:async(url,init)=>{requests.push({url,headers:new Headers(init.headers),body:init.body?JSON.parse(init.body):null});return new Response(JSON.stringify({id:'sess_fixture',object:'agent.session'}),{headers:{'content-type':'application/json'}});}});
 const provider=createOpenAIAgentProvider({client,sessionBudgetCents:25,webSearch:true}),signal=new AbortController().signal;
 await provider.create({sessionKey:'stable-create-key',conversationId:'conversation-public-id'},{text:'Hola'},signal);
 await provider.send('sess_fixture',{id:'stable-message-key',text:'Continuamos'},signal);
 await provider.result('sess_fixture',{turn_id:'turn1',call_id:'call1'},{success:true,output:{available:false}},signal);
 const [create,send,result]=requests;assert.equal(create.url,'https://api.openai.com/v1/agents/sessions');assert.equal(create.headers.get('openai-beta'),'agents=v1');assert.equal(create.headers.get('idempotency-key'),'stable-create-key');assert.deepEqual(create.body.environment,{type:'none'});assert.equal(create.body.spend_control.limit,25);assert.equal(create.body.agent.model,'gpt-6-luna');assert.equal(create.body.agent.service_tier,'default');assert.ok(create.body.agent.tools.some(tool=>tool.type==='web_search'));assert.ok(create.body.agent.tools.every(tool=>!Object.hasOwn(tool,'strict')));
 assert.equal(send.headers.get('idempotency-key'),'stable-message-key');assert.equal(send.body.events[0].input[0].content[0].text,'Continuamos');assert.equal(result.body.events[0].call_id,'call1');assert.equal(JSON.stringify(create.body).includes('test-key-not-a-live-credential'),false);
 assert.equal(createOpenAIAgentProvider(),null);
 assert.throws(()=>createOpenAIAgentProvider({client,model:'gpt-6-astra'}),/MODEL_NOT_ALLOWED/);
});
test('explicit account budget mode omits the incompatible session limit and preserves the cheap model',async()=>{
 const requests=[];const client=new OpenAI({apiKey:'fixture-key',maxRetries:0,fetch:async(_url,init)=>{requests.push(JSON.parse(init.body));return new Response(JSON.stringify({id:'sess_fixture'}),{headers:{'content-type':'application/json'}});}});
 const provider=createOpenAIAgentProvider({client,budgetMode:'account'});
 await provider.create({sessionKey:'test-key',conversationId:'test-chat'},{text:'Hola'},new AbortController().signal);
 assert.equal(requests.length,1);assert.equal(Object.hasOwn(requests[0],'spend_control'),false);assert.equal(requests[0].agent.model,'gpt-6-luna');assert.equal(provider.budgetMode,'account');assert.equal(provider.webSearch,false);
 assert.throws(()=>createOpenAIAgentProvider({client,budgetMode:'anything'}),/CONFIGURATION/);
});
test('an API rejection of the cost cap never retries without that cap',async()=>{
 const requests=[];const client=new OpenAI({apiKey:'fixture-key',maxRetries:0,fetch:async(_url,init)=>{requests.push(JSON.parse(init.body));return new Response(JSON.stringify({error:{message:"Unknown parameter: 'spend_control'.",type:'invalid_request_error',param:'spend_control',code:'unknown_parameter'}}),{status:400,headers:{'content-type':'application/json'}});}});
 const provider=createOpenAIAgentProvider({client});
 await assert.rejects(provider.create({sessionKey:'test-key',conversationId:'test-chat'},{text:'Hola'},new AbortController().signal),error=>error.status===400&&error.lianumCode==='NATIVE_AGENT_COST_LIMIT_UNSUPPORTED');
 assert.equal(requests.length,1);assert.deepEqual(requests[0].spend_control,{limit:25});assert.equal(requests[0].agent.model,'gpt-6-luna');assert.equal(requests[0].agent.tools.some(tool=>tool.type==='web_search'),false);assert.equal(provider.webSearch,false);
});
