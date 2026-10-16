import test from 'node:test';
import assert from 'node:assert/strict';
import * as SDK from '@lianum/sdk';
import * as Mobile from '../src/api/device-paged-agent-api-v4.mjs';
import * as MobileOperation from '../src/api/device-paged-agent-public-operation-v4.mjs';
test('mobile compatibility exports and SDK share the same original observation brands',()=>{
 assert.strictEqual(SDK.createDevicePagedAgentApiV4,Mobile.createDevicePagedAgentApiV4);
 assert.strictEqual(SDK.readDevicePagedAgentObservationV4,Mobile.readDevicePagedAgentObservationV4);
 assert.strictEqual(SDK.createDevicePagedAgentProposalLinkV4,MobileOperation.createDevicePagedAgentProposalLinkV4);
});
