import assert from 'node:assert/strict';
import {test} from 'node:test';
import {walletNavigationDuringWorkV1} from '../src/state/wallet-navigation-v1.mjs';

test('a running payment permits passive sections and its own screen without entering another custody',()=>{
  for(const group of ['paged','pagedNote','external','positions']){
    for(const target of ['state','activity','settings'])assert.equal(walletNavigationDuringWorkV1(target,group),true);
  }
  for(const [group,target] of [['paged','pagedGraph'],['pagedNote','paged'],['external','external'],['positions','defi']])assert.equal(walletNavigationDuringWorkV1(target,group),true);
  assert.equal(walletNavigationDuringWorkV1('external','paged'),false);
  assert.equal(walletNavigationDuringWorkV1('pagedGraph','external'),false);
  assert.equal(walletNavigationDuringWorkV1('recovery','paged'),false);
  assert.equal(walletNavigationDuringWorkV1('custody','external'),false);
  assert.equal(walletNavigationDuringWorkV1('deposit','paged'),false);
  assert.equal(walletNavigationDuringWorkV1('pagedGraph',null),false);
  assert.equal(walletNavigationDuringWorkV1('unknown','paged'),false);
});
