// New scoped admission relation. It does not reinterpret P42/R50/I84.
// The consuming hub requires the SAME already-verified Ready64 record before
// admitting this relation, and pins the registered rules/quorum at deployment.
use profile64::{graph,framing,native_statement as original};
use native_support::{capsule,capsule_framing,receipt,state,quorum};
use graph_support::sha256::words_to_bytes;
fn main(
 domain_commitment:pub [u32;8],authorization_root:pub [u32;8],graph_root:pub [u32;8],ready_commitment:pub [u32;8],local_commitment:pub [u32;8],dispatch_id:pub [u32;8],evidence_state:pub [u32;8],revoked_digest:pub [u32;8],receipt_commitment:pub [u32;8],admission_nullifier:pub [u32;8],revocation_sequence:pub u64,admission_from:pub u64,admission_until:pub u64,
 scope:[u8;32],policy:[u8;32],asset:[u8;32],hub_domain:[u8;32],registry_commitment:[u8;32],slot:u32,node:graph::Node,node_siblings:[[u8;32];6],ready_from:u64,ready_until:u64,
 state_opening:state::EvidenceState,revoked_entries:[[u8;32];64],registry:quorum::Registry,rule:original::Rule,rule_siblings:[[u8;32];3],rule_index:u8,
 action:capsule::Action,effect:receipt::NativeEffect,opening:receipt::ReceiptRead,observation:original::Observation,
 provider_key_x:[u8;32],provider_key_y:[u8;32],dispatch_signed_at:u64,dispatch_signature:[u8;64],delivery_risk_salt:[u8;32],attester_indexes:[u8;3],attester_signatures:[[u8;64];3],
){
 let auth=words_to_bytes(authorization_root);let root=words_to_bytes(graph_root);let ready=words_to_bytes(ready_commitment);
 assert(framing::domain(scope,policy,asset,hub_domain,registry_commitment)==words_to_bytes(domain_commitment));assert(auth!=[0;32]);assert(slot<64);
 graph::member(graph::node_hash(node,slot as u8),node_siblings,slot,root);
 assert(node.local_commitment==words_to_bytes(local_commitment));assert(node.dispatch_id==words_to_bytes(dispatch_id));
 assert(ready_from<ready_until);assert(framing::ready(auth,graph::node_hash(node,slot as u8),words_to_bytes(evidence_state),node.dispatch_id,ready_from,ready_until)==ready);
 assert(state_opening.hub_domain==hub_domain);assert(state_opening.registry_commitment==registry_commitment);assert(state::evidence_state_digest(state_opening)==words_to_bytes(evidence_state));assert(state_opening.revocation_sequence==revocation_sequence);assert(state_opening.revoked_digest==words_to_bytes(revoked_digest));
 assert(registry.hub_domain==hub_domain);assert(quorum::registry_commitment(registry)==registry_commitment);
 original::assert_rule(rule);let rule_cm=original::rule_commitment(rule);assert(rule_index<8);let mut rule_root=rule_cm;for d in 0..3{rule_root=if (((rule_index as u32)>>d)&1)==0{state::node_hash(rule_root,rule_siblings[d])}else{state::node_hash(rule_siblings[d],rule_root)};}assert(rule_root==registry.rules_root);assert(rule_cm==node.evidence_policy);assert(original::chain_domain(rule)==node.chain_domain);
 assert(effect.family==rule.family);assert(effect.genesis==rule.genesis);assert(effect.asset==rule.asset);let gid=receipt::native_global_effect_id(effect);
 state::assert_absent(0x32,hub_domain,revoked_entries,state_opening.revoked_count,state_opening.revoked_digest,gid);
 assert(framing::admission_nullifier(hub_domain,gid)==words_to_bytes(admission_nullifier));
 capsule::assert_action(action);assert(action.chain_domain==node.chain_domain);assert(capsule_framing::native_transfer_action(action)==node.action_commitment);assert(original::provider_identity(provider_key_x,provider_key_y)==action.signer_identity);
 assert(action.receipt_key_commitment==node.receipt_key_commitment);assert(action.receipt_rho==node.receipt_rho);assert(delivery_risk_salt!=[0;32]);
 assert(action.delivery_risk_commitment==framing::delivery_risk(scope,policy,asset,hub_domain,registry_commitment,action.chain_domain,action.source_commitment,action.destination_commitment,action.amount,node.payout_commitment,action.settle_before,delivery_risk_salt));
 assert(observation.source_commitment==action.source_commitment);assert(observation.destination_commitment==action.destination_commitment);assert(observation.amount==action.amount);assert(observation.custody_kind==action.custody_kind);assert(observation.custody_commitment==action.custody_commitment);assert(observation.block_id!=[0;32]);assert(observation.state_commitment!=[0;32]);assert(observation.finality_kind==rule.finality_kind);assert(observation.confirmations>=rule.minimum_confirmations);assert(observation.evidence_from<=observation.observed_at);assert(observation.observed_at<observation.evidence_until);assert(observation.evidence_until-observation.evidence_from<=rule.maximum_evidence_lifetime);assert(observation.evidence_until<=action.settle_before);
 assert(admission_from<admission_until);assert(observation.evidence_from<=admission_from);assert(admission_until<=observation.evidence_until);if admission_from<observation.observed_at{assert(observation.observed_at-admission_from<=rule.maximum_clock_skew);}if observation.observed_at<dispatch_signed_at{assert(dispatch_signed_at-observation.observed_at<=rule.maximum_clock_skew);}
 assert(opening.hub_domain==hub_domain);assert(opening.registry_commitment==registry_commitment);assert(opening.global_effect_id==gid);assert(opening.scope==scope);assert(opening.policy==policy);assert(opening.local_commitment==node.local_commitment);assert(opening.dispatch_id==node.dispatch_id);assert(opening.chain_domain==node.chain_domain);assert(opening.evidence_policy==rule_cm);assert(opening.action_commitment==node.action_commitment);assert(opening.payout_commitment==node.payout_commitment);assert(opening.receipt_key_commitment==node.receipt_key_commitment);assert(opening.receipt_rho==node.receipt_rho);assert(opening.valid_from==observation.evidence_from);assert(opening.valid_until==observation.evidence_until);
 let cm=receipt::receipt_commitment(opening);assert(cm==words_to_bytes(receipt_commitment));
 assert(ready_from<=dispatch_signed_at);assert(dispatch_signed_at<ready_until);assert(action.execution_from<=dispatch_signed_at);assert(dispatch_signed_at<action.execution_until);
 let dispatch=original::dispatch_statement(hub_domain,registry_commitment,ready,opening,action.delivery_risk_commitment,dispatch_signed_at);original::assert_signature(provider_key_x,provider_key_y,dispatch_signature,dispatch);
 let evidence=original::attestation_statement(hub_domain,registry_commitment,rule_cm,ready,dispatch,cm,gid,observation);quorum::assert_quorum(registry,registry_commitment,evidence,attester_indexes,attester_signatures);
}
