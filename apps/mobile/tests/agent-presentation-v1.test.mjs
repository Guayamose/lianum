import test from 'node:test';
import assert from 'node:assert/strict';
import {agentDisplayLabelV1,agentDisplayValueV1} from '../src/agent/agent-presentation-v1.ts';

test('saved server cards use English labels without translating arbitrary conversation',()=>{
 assert.equal(agentDisplayLabelV1('Consultando tu cartera'),'Checking your wallet');
 assert.equal(agentDisplayLabelV1('Última observación de la cartera'),'Latest wallet observation');
 const prose='Mi conversación y mis instrucciones siguen siendo las mismas.';
 assert.equal(agentDisplayLabelV1(prose),prose);
 assert.equal(agentDisplayValueV1('2 de 7'),'2 of 7');
 assert.equal(agentDisplayValueV1('Por confirmar'),'Unconfirmed');
});

test('legacy currency display keeps exact large amounts and rejects ambiguous formats',()=>{
 assert.equal(agentDisplayValueV1('9.007.199.254.740.993,01 €'),'€9,007,199,254,740,993.01');
 assert.equal(agentDisplayValueV1('-1.234,50 US$'),'-$1,234.50');
 assert.equal(agentDisplayValueV1('0,01 €'),'€0.01');
 for(const value of ['$1,234.50','€1,234.50','1.23,45 €','1,234 €','UNKNOWN','12.34 ETH'])assert.equal(agentDisplayValueV1(value),value);
});
