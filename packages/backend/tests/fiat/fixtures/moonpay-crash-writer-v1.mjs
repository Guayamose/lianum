import {createMoonPayGatewayV1} from '../../../src/fiat/moonpay-gateway-v1.mjs';
// Inert local credentials and currencies; this process makes no network call.
const configuration={enabled:true,environment:'SANDBOX',publishableKey:'pk_test_CRASH_LOCAL_0123456789',secretKey:'sk_test_CRASH_LOCAL_0123456789',webhookKey:'wk_test_CRASH_LOCAL_0123456789'};
const gateway=await createMoonPayGatewayV1({configuration,directory:process.argv[2],fetchImpl:async()=>new Response(JSON.stringify([{code:'eur',type:'fiat'},{code:'eth',type:'crypto'}]),{headers:{'content-type':'application/json'}})});
const order=await gateway.createSession('a'.repeat(64),{requestId:process.argv[3],flow:'BUY',asset:'ETH',network:'ethereum',fiatCurrency:'EUR',amount:'10',walletAddress:'0x'+'12'.repeat(20)});
process.stdout.write(JSON.stringify({id:order.id,requestId:order.requestId})+'\n');
setInterval(()=>{},1000);
