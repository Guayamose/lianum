import OpenAI from 'openai';
import {agentInstructions,agentTools} from '@lianum/agent/tools';

/** All external calls use the official pinned SDK. Its default retries are
 * disabled: input submission is retried only with its durable message key. */
export function createOpenAIAgentProvider({apiKey,model='gpt-6-luna',budgetMode='session',sessionBudgetCents=25,webSearch=false,allowOtherModels=false,client}={}){
 if(!client&&!apiKey)return null;
 if(typeof model!=='string'||!/^[-a-zA-Z0-9._]{1,100}$/.test(model)||!Number.isInteger(sessionBudgetCents)||sessionBudgetCents<1||sessionBudgetCents>10000)throw Error('NATIVE_AGENT_CONFIGURATION');
 if(!['session','account'].includes(budgetMode))throw Error('NATIVE_AGENT_CONFIGURATION');
 if(model!=='gpt-6-luna'&&!allowOtherModels)throw Error('NATIVE_AGENT_MODEL_NOT_ALLOWED');
 const sdk=client??new OpenAI({apiKey,maxRetries:0,timeout:20000});const sessions=sdk.beta.agents.sessions;
 const options=(signal,key)=>({signal,...(key?{headers:{'Idempotency-Key':key}}:{})});
 return Object.freeze({
  model,webSearch,budgetMode,
  watch(id,signal){return sessions.events.stream(id,options(signal));},
  async create(state,message,signal){
   try{return await sessions.create({agent:{model,service_tier:'default',reasoning:{effort:'low'},text:{verbosity:'low'},instructions:agentInstructions,tools:[...agentTools,...(webSearch?[{type:'web_search'}]:[])]},environment:{type:'none'},input:message.modelInput??message.text,metadata:{lianum_conversation:state.conversationId},...(budgetMode==='session'?{spend_control:{limit:sessionBudgetCents}}:{})},options(signal,state.sessionKey));}
   catch(error){
    // Never remove the requested cap to work around an API/SDK mismatch.
    if(error.status===400&&error.param==='spend_control')error.lianumCode='NATIVE_AGENT_COST_LIMIT_UNSUPPORTED';
    throw error;
   }
  },
  retrieve(id,signal){return sessions.retrieve(id,options(signal));},
  async items(id,signal){const page=await sessions.items.list(id,{limit:100,order:'desc'},options(signal));return page.data;},
  async turns(id,signal){const page=await sessions.turns.list(id,{limit:10,order:'desc'},options(signal));return page.data.filter(row=>row.subagent_id===null);},
  send(id,message,signal){return sessions.events.create(id,{'Idempotency-Key':message.id,events:[{type:'agent.session.input.message',input:[{role:'user',content:[{type:'input_text',text:message.modelInput??message.text}]}]}]},options(signal));},
  result(id,call,result,signal){return sessions.events.create(id,{'Idempotency-Key':'lianum-tool-'+call.turn_id+'-'+call.call_id,events:[{type:'agent.session.input.tool_result',turn_id:call.turn_id,call_id:call.call_id,...(result.success?{success:true,output:JSON.stringify(result.output)}:{success:false,error:result.error})}]},options(signal));},
  cancel(id,requestId,signal){return sessions.events.create(id,{'Idempotency-Key':requestId,events:[{type:'agent.session.input.cancel'}]},options(signal));},
 });
}
