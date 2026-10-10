use crate::framing;
use graph_support::sha256::{sha256,words_to_bytes};
use funding_support::framing as legacy;
pub struct Statement {pub scope: [u8;32],pub policy: [u8;32],pub asset: [u8;32],pub hub_domain: [u8;32],pub registry_commitment: [u8;32],pub operation_id: [u8;32],pub input_commitment: [u8;32],pub input_nullifier: [u8;32],pub reservation_intent: [u8;32],pub graph_root: [u8;32],pub output_root: [u8;32],pub reserve_commitment: [u8;32],pub reserve_nullifier: [u8;32],pub change_commitment: [u8;32],pub recovery_commitment: [u8;32],pub authorization_root: [u8;32],pub funding_not_before:u64,pub funding_valid_until:u64,pub settle_before:u64,}
pub struct Note {pub rho:[u8;32],pub key_x:[u8;32],pub key_y:[u8;32],pub value:u64,pub secret:[u8;32]}
pub struct Node {pub id_digest:[u8;32],pub chain_domain:[u8;32],pub evidence_policy:[u8;32],pub action_commitment:[u8;32],pub payout_commitment:[u8;32],pub local_commitment:[u8;32],pub dispatch_id:[u8;32],pub receipt_key_commitment:[u8;32],pub receipt_rho:[u8;32],pub salt:[u8;32],
 pub dependency_mask:u64,
}
pub struct Witness {
 pub statement:Statement,pub budget:u64,pub reservation_nonce:[u8;32],pub reserve_secret:[u8;32],pub active_count:u32,
 pub input_note:Note,pub change_note:Note,pub recovery_note:Note,
 pub nodes:[Node;64],pub payouts:[Note;64],pub randomness:[[u8;32];64],pub padding_salts:[[u8;32];64],
 pub owner_signature:[u8;64],pub invoice_signatures:[[u8;64];64],
}
pub fn note_commitment(s:Statement,n:Note)->[u8;32]{assert(n.value>0);legacy::legacy_balance(s.scope,s.policy,n.rho,n.key_x,n.key_y,n.value,n.secret)}
fn empty_note(n:Note){assert(n.rho==[0;32]);assert(n.key_x==[0;32]);assert(n.key_y==[0;32]);assert(n.secret==[0;32]);assert(n.value==0);}
pub fn graph_root(leaves:[[u8;32];64])->[u8;32]{let mut heap:[[u8;32];128]=[[0;32];128];for i in 0..64{heap[64+i]=leaves[i];}for i in 0..63{let j=63-i;heap[j]=framing::graph_tree(heap[2*j],heap[2*j+1]);}heap[1]}
pub fn output_root(leaves:[[u8;32];64])->[u8;32]{let mut heap:[[u8;32];128]=[[0;32];128];for i in 0..64{heap[64+i]=leaves[i];}for i in 0..63{let j=63-i;heap[j]=framing::output_tree(heap[2*j],heap[2*j+1]);}heap[1]}
pub fn domain(s:Statement)->[u8;32]{framing::domain(s.scope,s.policy,s.asset,s.hub_domain,s.registry_commitment)}
pub fn empty_node(n:Node){assert(n.id_digest==[0;32]);assert(n.chain_domain==[0;32]);assert(n.evidence_policy==[0;32]);assert(n.action_commitment==[0;32]);assert(n.payout_commitment==[0;32]);assert(n.local_commitment==[0;32]);assert(n.dispatch_id==[0;32]);assert(n.receipt_key_commitment==[0;32]);assert(n.receipt_rho==[0;32]);assert(n.salt==[0;32]);assert(n.dependency_mask==0);}
pub fn node_hash(n:Node,slot:u8)->[u8;32]{framing::node(slot,n.id_digest,n.chain_domain,n.evidence_policy,n.action_commitment,n.payout_commitment,n.local_commitment,n.dispatch_id,n.receipt_key_commitment,n.receipt_rho,n.salt,n.dependency_mask)}
pub fn member(cm:[u8;32],path:[[u8;32];6],slot:u32,root:[u8;32]){assert(slot<64);let mut value=cm;for d in 0..6{value=if ((slot>>d)&1)==0{framing::graph_tree(value,path[d])}else{framing::graph_tree(path[d],value)};}assert(value==root);}
pub fn assert_authorization(w:Witness)->[[u8;32];64]{let s=w.statement;
 assert(w.active_count>0);assert(w.active_count<=64);assert(w.budget>0);assert(w.reservation_nonce!=[0;32]);assert(w.reserve_secret!=[0;32]);
 assert(s.scope!=[0;32]);assert(s.policy!=[0;32]);assert(s.asset!=[0;32]);assert(s.hub_domain!=[0;32]);assert(s.registry_commitment!=[0;32]);assert(s.operation_id!=[0;32]);
 assert(s.input_commitment!=s.reserve_commitment);assert(s.input_commitment!=s.change_commitment);assert(s.input_commitment!=s.recovery_commitment);assert(s.reserve_commitment!=s.change_commitment);assert(s.reserve_commitment!=s.recovery_commitment);assert(s.change_commitment!=s.recovery_commitment);assert(s.input_nullifier!=s.reserve_nullifier);
 assert(s.funding_not_before<s.funding_valid_until);assert(s.funding_valid_until<=s.settle_before);
 assert(note_commitment(s,w.input_note)==s.input_commitment);assert(legacy::legacy_nullifier(s.scope,s.input_commitment,w.input_note.secret)==s.input_nullifier);
 assert((w.input_note.value as u128)==(w.budget as u128)+(w.change_note.value as u128));assert(w.recovery_note.value==w.budget);assert(note_commitment(s,w.recovery_note)==s.recovery_commitment);
 if w.change_note.value>0{assert(note_commitment(s,w.change_note)==s.change_commitment);}else{empty_note(w.change_note);assert(framing::empty_change(s.scope,s.policy,s.asset,s.hub_domain,s.registry_commitment,s.input_nullifier,s.operation_id,w.reservation_nonce)==s.change_commitment);}
 assert(framing::intent(s.scope,s.policy,s.asset,s.hub_domain,s.registry_commitment,s.operation_id,w.reservation_nonce,w.budget,s.settle_before,s.recovery_commitment,w.reserve_secret)==s.reservation_intent);
 assert(framing::reserve(s.scope,s.policy,s.asset,s.hub_domain,s.registry_commitment,s.reservation_intent,s.graph_root)==s.reserve_commitment);
 assert(legacy::legacy_nullifier(s.scope,s.reserve_commitment,w.reserve_secret)==s.reserve_nullifier);
 let mut leaves:[[u8;32];64]=[[0;32];64];let mut outputs:[[u8;32];64]=[[0;32];64];let mut sum:u128=0;
 for i in 0..64{let n=w.nodes[i];let p=w.payouts[i];
  if i<w.active_count{
   // Canonical topological positions prohibit every future/self dependency.
   if i==0{assert(n.dependency_mask==0);}else{assert(n.dependency_mask < (1 as u64 << i));}
   for j in 0..64{if j<i{assert(n.id_digest!=w.nodes[j].id_digest);assert(n.dispatch_id!=w.nodes[j].dispatch_id);assert(n.local_commitment!=w.nodes[j].local_commitment);assert(n.receipt_rho!=w.nodes[j].receipt_rho);}}
   assert(n.id_digest!=[0;32]);
   assert(n.chain_domain!=[0;32]);
   assert(n.evidence_policy!=[0;32]);
   assert(n.action_commitment!=[0;32]);
   assert(n.payout_commitment!=[0;32]);
   assert(n.local_commitment!=[0;32]);
   assert(n.dispatch_id!=[0;32]);
   assert(n.receipt_key_commitment!=[0;32]);
   assert(n.receipt_rho!=[0;32]);
   assert(n.salt!=[0;32]);

   assert(p.rho==framing::payout_origin(s.scope,s.policy,s.asset,s.hub_domain,s.registry_commitment,s.operation_id,i as u8,w.randomness[i]));
   outputs[i]=note_commitment(s,p);assert(outputs[i]==n.payout_commitment);sum=sum+p.value as u128;
   let invoice=framing::invoice(s.scope,s.policy,s.asset,s.hub_domain,s.registry_commitment,s.operation_id,i as u8,n.chain_domain,n.evidence_policy,n.action_commitment,n.payout_commitment,s.settle_before);
   crate::native_statement::assert_signature(p.key_x,p.key_y,w.invoice_signatures[i],invoice);
   leaves[i]=framing::node(i as u8,n.id_digest,n.chain_domain,n.evidence_policy,n.action_commitment,n.payout_commitment,n.local_commitment,n.dispatch_id,n.receipt_key_commitment,n.receipt_rho,n.salt,n.dependency_mask);
  }else{
   assert(n.id_digest==[0;32]);
   assert(n.chain_domain==[0;32]);
   assert(n.evidence_policy==[0;32]);
   assert(n.action_commitment==[0;32]);
   assert(n.payout_commitment==[0;32]);
   assert(n.local_commitment==[0;32]);
   assert(n.dispatch_id==[0;32]);
   assert(n.receipt_key_commitment==[0;32]);
   assert(n.receipt_rho==[0;32]);
   assert(n.salt==[0;32]);

   assert(n.dependency_mask==0);empty_note(p);assert(w.randomness[i]==[0;32]);assert(w.invoice_signatures[i]==[0;64]);assert(w.padding_salts[i]!=[0;32]);
   leaves[i]=framing::padding(s.operation_id,i as u8,w.padding_salts[i]);outputs[i]=framing::empty_payout(s.scope,s.policy,s.asset,s.hub_domain,s.registry_commitment,s.operation_id,i as u8,w.padding_salts[i]);
  }
  assert(outputs[i]!=[0;32]);for j in 0..64{if j<i{assert(outputs[i]!=outputs[j]);}}
  assert(outputs[i]!=s.input_commitment);assert(outputs[i]!=s.change_commitment);assert(outputs[i]!=s.recovery_commitment);assert(outputs[i]!=s.reserve_commitment);
 }
 assert(sum==w.budget as u128);assert(graph_root(leaves)==s.graph_root);assert(output_root(outputs)==s.output_root);
 assert(framing::authorization(s.scope,s.policy,s.asset,s.hub_domain,s.registry_commitment,s.operation_id,s.input_commitment,s.input_nullifier,s.reservation_intent,s.graph_root,s.output_root,s.reserve_commitment,s.reserve_nullifier,s.change_commitment,s.recovery_commitment,s.funding_not_before,s.funding_valid_until,s.settle_before)==s.authorization_root);
 crate::native_statement::assert_signature(w.input_note.key_x,w.input_note.key_y,w.owner_signature,framing::owner(s.authorization_root));
 outputs
}
pub fn note_membership(cm:[u8;32],siblings:[[u8;32];8],index:u32,root:[u8;32]){assert(index<256);let mut value=cm;for d in 0..8{let mut message:[u8;65]=[0;65];message[0]=1;let left=if ((index>>d)&1)==0{value}else{siblings[d]};let right=if ((index>>d)&1)==0{siblings[d]}else{value};for j in 0..32{message[1+j]=left[j];message[33+j]=right[j];}value=sha256::<65,128>(message);}assert(value==root);}
