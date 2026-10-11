import test from 'node:test';
import assert from 'node:assert/strict';
import {startWalletApplication} from '../../../src/api/wallet/http-service.mjs';

test('headless wallet service exposes its authenticated API without application assets',async()=>{
 const service=await startWalletApplication();
 try{
  assert.equal((await fetch(service.origin+'/')).status,404);
  assert.equal((await fetch(service.origin+'/api/wallet/state')).status,403);
  const response=await fetch(service.origin+'/api/wallet/state',{headers:{Origin:service.origin,'x-wallet-owner-token':service.ownerAccess.token}});
  assert.equal(response.status,200);
  assert.equal((await response.json()).connection,'DISCONNECTED');
 }finally{await service.close();}
});

test('application static files cannot override API routes or use resource callbacks',async()=>{
 await assert.rejects(startWalletApplication({}, {'/api/wallet/state':[new URL(import.meta.url),'text/javascript; charset=utf-8']}),/WALLET_STATIC_ROUTE/);
 await assert.rejects(startWalletApplication({}, {'/':()=>''}),/WALLET_STATIC_ENTRY/);
 let read=false;const assets={};Object.defineProperty(assets,'/',{get(){read=true;return [];}});
 await assert.rejects(startWalletApplication({},assets),/WALLET_STATIC_ENTRY/);
 assert.equal(read,false);
});
