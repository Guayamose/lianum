import assert from 'node:assert/strict';
import {test} from 'node:test';
import {walletNavigationDuringWorkV1,walletNavigationPushV1,walletBackTargetV1,createWalletBackActionsV1} from '../src/state/wallet-navigation-v1.mjs';

test('a running payment permits passive sections and its own screen without entering another custody',()=>{
  for(const group of ['paged','pagedNote','external','positions','agent','investment']){
    for(const target of ['native','state','activity','operations','agent','approvals','settings'])assert.equal(walletNavigationDuringWorkV1(target,group),true);
  }
  for(const [group,target] of [['paged','pagedGraph'],['pagedNote','paged'],['external','external'],['positions','defi'],['agent','agentReview'],['investment','investment']])assert.equal(walletNavigationDuringWorkV1(target,group),true);
  assert.equal(walletNavigationDuringWorkV1('external','paged'),false);
  assert.equal(walletNavigationDuringWorkV1('pagedGraph','agent'),false);
  assert.equal(walletNavigationDuringWorkV1('agentReview','paged'),false);
  assert.equal(walletNavigationDuringWorkV1('pagedGraph','external'),false);
  assert.equal(walletNavigationDuringWorkV1('recovery','paged'),false);
  assert.equal(walletNavigationDuringWorkV1('custody','external'),false);
  assert.equal(walletNavigationDuringWorkV1('deposit','paged'),false);
  assert.equal(walletNavigationDuringWorkV1('pagedGraph',null),false);
  assert.equal(walletNavigationDuringWorkV1('unknown','paged'),false);
  assert.equal(walletNavigationDuringWorkV1('pagedGraph','investment'),false);
  assert.equal(walletNavigationDuringWorkV1('external','investment'),false);
});


test('back history unwinds tabs and nested routes without navigation loops',()=>{
 let history=['native'];for(const route of ['agent','settings','recovery'])history=walletNavigationPushV1(history,route);
 assert.equal(walletBackTargetV1(history),'settings');history=walletNavigationPushV1(history,'settings');assert.deepEqual(history,['native','agent','settings']);assert.equal(walletBackTargetV1(history),'agent');
 history=walletNavigationPushV1(history,'native');assert.deepEqual(history,['native']);assert.equal(walletBackTargetV1(history),null);assert.deepEqual(walletNavigationPushV1(history,'native'),history);
 assert.equal(walletBackTargetV1(['native','external','agent'],true,'paged'),'native');assert.equal(walletBackTargetV1(['native','operations','agent'],true,'paged'),'operations');
});
test('visible child back actions take priority and unregister without swallowing root navigation',()=>{
 const actions=createWalletBackActionsV1(),seen=[];const removeLow=actions.register(()=>{seen.push('child');return true;},1);const removeHigh=actions.register(()=>{seen.push('panel');return true;},2);
 assert.equal(actions.dispatch(),true);assert.deepEqual(seen,['panel']);removeHigh();assert.equal(actions.dispatch(),true);assert.deepEqual(seen,['panel','child']);removeLow();assert.equal(actions.dispatch(),false);
});
