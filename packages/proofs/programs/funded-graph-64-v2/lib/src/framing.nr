// Separate V2 H4 domains. SHA and PC23 commitments remain original exports.
use graph_support::sha256::{sha256,u32_bytes,u64_bytes};
fn u8_bytes(v:u8)->[u8;1]{[v]}
fn part<let N:u32,let M:u32>(buffer:[u8;N],offset:u32,value:[u8;M])->[u8;N]{let mut result=buffer;let length=u32_bytes(M);for i in 0..4{result[offset+i]=length[i];}for i in 0..M{result[offset+4+i]=value[i];}result}
pub fn domain(scope: [u8; 32],policy: [u8; 32],asset: [u8; 32],hub_domain: [u8; 32],registry_commitment: [u8; 32]) -> [u8; 32] {
 let mut message: [u8; 235] = [0; 235];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,54,52,47,100,111,109,97,105,110,47,50]);
 message=part(message,27,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,54,52,95,86,50]);
 message=part(message,55,scope);
 message=part(message,91,policy);
 message=part(message,127,asset);
 message=part(message,163,hub_domain);
 message=part(message,199,registry_commitment);
 sha256::<235,256>(message)
}

pub fn graph_tree(left: [u8; 32],right: [u8; 32]) -> [u8; 32] {
 let mut message: [u8; 131] = [0; 131];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,54,52,47,103,114,97,112,104,45,116,114,101,101,47,50]);
 message=part(message,31,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,54,52,95,86,50]);
 message=part(message,59,left);
 message=part(message,95,right);
 sha256::<131,192>(message)
}

pub fn output_tree(left: [u8; 32],right: [u8; 32]) -> [u8; 32] {
 let mut message: [u8; 132] = [0; 132];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,54,52,47,111,117,116,112,117,116,45,116,114,101,101,47,50]);
 message=part(message,32,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,54,52,95,86,50]);
 message=part(message,60,left);
 message=part(message,96,right);
 sha256::<132,192>(message)
}

pub fn padding(operation_id: [u8; 32],slot: u8,salt: [u8; 32]) -> [u8; 32] {
 let mut message: [u8; 133] = [0; 133];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,54,52,47,112,97,100,100,105,110,103,47,50]);
 message=part(message,28,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,54,52,95,86,50]);
 message=part(message,56,operation_id);
 message=part(message,92,u8_bytes(slot));
 message=part(message,97,salt);
 sha256::<133,192>(message)
}

pub fn empty_payout(scope: [u8; 32],policy: [u8; 32],asset: [u8; 32],hub_domain: [u8; 32],registry_commitment: [u8; 32],operation_id: [u8; 32],slot: u8,salt: [u8; 32]) -> [u8; 32] {
 let mut message: [u8; 318] = [0; 318];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,54,52,47,101,109,112,116,121,45,112,97,121,111,117,116,47,50]);
 message=part(message,33,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,54,52,95,86,50]);
 message=part(message,61,scope);
 message=part(message,97,policy);
 message=part(message,133,asset);
 message=part(message,169,hub_domain);
 message=part(message,205,registry_commitment);
 message=part(message,241,operation_id);
 message=part(message,277,u8_bytes(slot));
 message=part(message,282,salt);
 sha256::<318,384>(message)
}

pub fn payout_origin(scope: [u8; 32],policy: [u8; 32],asset: [u8; 32],hub_domain: [u8; 32],registry_commitment: [u8; 32],operation_id: [u8; 32],slot: u8,randomness: [u8; 32]) -> [u8; 32] {
 let mut message: [u8; 319] = [0; 319];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,54,52,47,112,97,121,111,117,116,45,111,114,105,103,105,110,47,50]);
 message=part(message,34,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,54,52,95,86,50]);
 message=part(message,62,scope);
 message=part(message,98,policy);
 message=part(message,134,asset);
 message=part(message,170,hub_domain);
 message=part(message,206,registry_commitment);
 message=part(message,242,operation_id);
 message=part(message,278,u8_bytes(slot));
 message=part(message,283,randomness);
 sha256::<319,384>(message)
}

pub fn node(slot: u8,id_digest: [u8; 32],chain_domain: [u8; 32],evidence_policy: [u8; 32],action_commitment: [u8; 32],payout_commitment: [u8; 32],local_commitment: [u8; 32],dispatch_id: [u8; 32],receipt_key_commitment: [u8; 32],receipt_rho: [u8; 32],salt: [u8; 32],dependency_mask: u64) -> [u8; 32] {
 let mut message: [u8; 430] = [0; 430];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,54,52,47,110,111,100,101,47,50]);
 message=part(message,25,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,54,52,95,86,50]);
 message=part(message,53,u8_bytes(slot));
 message=part(message,58,id_digest);
 message=part(message,94,chain_domain);
 message=part(message,130,evidence_policy);
 message=part(message,166,action_commitment);
 message=part(message,202,payout_commitment);
 message=part(message,238,local_commitment);
 message=part(message,274,dispatch_id);
 message=part(message,310,receipt_key_commitment);
 message=part(message,346,receipt_rho);
 message=part(message,382,salt);
 message=part(message,418,u64_bytes(dependency_mask));
 sha256::<430,448>(message)
}

pub fn intent(scope: [u8; 32],policy: [u8; 32],asset: [u8; 32],hub_domain: [u8; 32],registry_commitment: [u8; 32],operation_id: [u8; 32],reservation_nonce: [u8; 32],budget: u64,settle_before: u64,recovery_commitment: [u8; 32],reserve_secret: [u8; 32]) -> [u8; 32] {
 let mut message: [u8; 403] = [0; 403];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,54,52,47,105,110,116,101,110,116,47,50]);
 message=part(message,27,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,54,52,95,86,50]);
 message=part(message,55,scope);
 message=part(message,91,policy);
 message=part(message,127,asset);
 message=part(message,163,hub_domain);
 message=part(message,199,registry_commitment);
 message=part(message,235,operation_id);
 message=part(message,271,reservation_nonce);
 message=part(message,307,u64_bytes(budget));
 message=part(message,319,u64_bytes(settle_before));
 message=part(message,331,recovery_commitment);
 message=part(message,367,reserve_secret);
 sha256::<403,448>(message)
}

pub fn reserve(scope: [u8; 32],policy: [u8; 32],asset: [u8; 32],hub_domain: [u8; 32],registry_commitment: [u8; 32],intent: [u8; 32],graph_root: [u8; 32]) -> [u8; 32] {
 let mut message: [u8; 308] = [0; 308];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,54,52,47,114,101,115,101,114,118,101,47,50]);
 message=part(message,28,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,54,52,95,86,50]);
 message=part(message,56,scope);
 message=part(message,92,policy);
 message=part(message,128,asset);
 message=part(message,164,hub_domain);
 message=part(message,200,registry_commitment);
 message=part(message,236,intent);
 message=part(message,272,graph_root);
 sha256::<308,320>(message)
}

pub fn empty_change(scope: [u8; 32],policy: [u8; 32],asset: [u8; 32],hub_domain: [u8; 32],registry_commitment: [u8; 32],input_nullifier: [u8; 32],operation_id: [u8; 32],reservation_nonce: [u8; 32]) -> [u8; 32] {
 let mut message: [u8; 349] = [0; 349];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,54,52,47,101,109,112,116,121,45,99,104,97,110,103,101,47,50]);
 message=part(message,33,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,54,52,95,86,50]);
 message=part(message,61,scope);
 message=part(message,97,policy);
 message=part(message,133,asset);
 message=part(message,169,hub_domain);
 message=part(message,205,registry_commitment);
 message=part(message,241,input_nullifier);
 message=part(message,277,operation_id);
 message=part(message,313,reservation_nonce);
 sha256::<349,384>(message)
}

pub fn authorization(scope: [u8; 32],policy: [u8; 32],asset: [u8; 32],hub_domain: [u8; 32],registry_commitment: [u8; 32],operation_id: [u8; 32],input_commitment: [u8; 32],input_nullifier: [u8; 32],reservation_intent: [u8; 32],graph_root: [u8; 32],output_root: [u8; 32],reserve_commitment: [u8; 32],reserve_nullifier: [u8; 32],change_commitment: [u8; 32],recovery_commitment: [u8; 32],funding_not_before: u64,funding_valid_until: u64,settle_before: u64) -> [u8; 32] {
 let mut message: [u8; 638] = [0; 638];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,54,52,47,97,117,116,104,111,114,105,122,97,116,105,111,110,47,50]);
 message=part(message,34,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,54,52,95,86,50]);
 message=part(message,62,scope);
 message=part(message,98,policy);
 message=part(message,134,asset);
 message=part(message,170,hub_domain);
 message=part(message,206,registry_commitment);
 message=part(message,242,operation_id);
 message=part(message,278,input_commitment);
 message=part(message,314,input_nullifier);
 message=part(message,350,reservation_intent);
 message=part(message,386,graph_root);
 message=part(message,422,output_root);
 message=part(message,458,reserve_commitment);
 message=part(message,494,reserve_nullifier);
 message=part(message,530,change_commitment);
 message=part(message,566,recovery_commitment);
 message=part(message,602,u64_bytes(funding_not_before));
 message=part(message,614,u64_bytes(funding_valid_until));
 message=part(message,626,u64_bytes(settle_before));
 sha256::<638,704>(message)
}

pub fn owner(authorization_root: [u8; 32]) -> [u8; 32] {
 let mut message: [u8; 90] = [0; 90];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,54,52,47,111,119,110,101,114,47,50]);
 message=part(message,26,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,54,52,95,86,50]);
 message=part(message,54,authorization_root);
 sha256::<90,128>(message)
}

pub fn invoice(scope: [u8; 32],policy: [u8; 32],asset: [u8; 32],hub_domain: [u8; 32],registry_commitment: [u8; 32],operation_id: [u8; 32],slot: u8,chain_domain: [u8; 32],evidence_policy: [u8; 32],action_commitment: [u8; 32],payout_commitment: [u8; 32],settle_before: u64) -> [u8; 32] {
 let mut message: [u8; 433] = [0; 433];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,54,52,47,105,110,118,111,105,99,101,47,50]);
 message=part(message,28,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,54,52,95,86,50]);
 message=part(message,56,scope);
 message=part(message,92,policy);
 message=part(message,128,asset);
 message=part(message,164,hub_domain);
 message=part(message,200,registry_commitment);
 message=part(message,236,operation_id);
 message=part(message,272,u8_bytes(slot));
 message=part(message,277,chain_domain);
 message=part(message,313,evidence_policy);
 message=part(message,349,action_commitment);
 message=part(message,385,payout_commitment);
 message=part(message,421,u64_bytes(settle_before));
 sha256::<433,448>(message)
}

pub fn padding_terminal(authorization_root: [u8; 32],slot: u8,salt: [u8; 32]) -> [u8; 32] {
 let mut message: [u8; 142] = [0; 142];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,54,52,47,112,97,100,100,105,110,103,45,116,101,114,109,105,110,97,108,47,50]);
 message=part(message,37,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,54,52,95,86,50]);
 message=part(message,65,authorization_root);
 message=part(message,101,u8_bytes(slot));
 message=part(message,106,salt);
 sha256::<142,192>(message)
}

pub fn ready(authorization_root: [u8; 32],leaf_commitment: [u8; 32],evidence_state: [u8; 32],dispatch_id: [u8; 32],valid_from: u64,valid_until: u64) -> [u8; 32] {
 let mut message: [u8; 222] = [0; 222];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,54,52,47,114,101,97,100,121,47,50]);
 message=part(message,26,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,54,52,95,86,50]);
 message=part(message,54,authorization_root);
 message=part(message,90,leaf_commitment);
 message=part(message,126,evidence_state);
 message=part(message,162,dispatch_id);
 message=part(message,198,u64_bytes(valid_from));
 message=part(message,210,u64_bytes(valid_until));
 sha256::<222,256>(message)
}

fn u128_bytes(v:u128)->[u8;16]{let mut a:[u8;16]=[0;16];for i in 0..16{a[i]=(v>>(((15-i)*8) as u128)) as u8;}a}

pub fn admission_nullifier(hub_domain: [u8; 32],global_effect_id: [u8; 32]) -> [u8; 32] {
 let mut message:[u8;140]=[0;140];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,54,52,47,97,100,109,105,115,115,105,111,110,45,110,117,108,108,105,102,105,101,114,47,50]);
 message=part(message,40,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,54,52,95,86,50]);
 message=part(message,68,hub_domain);
 message=part(message,104,global_effect_id);
 sha256::<140,192>(message)
}

pub fn delivery_risk(scope: [u8; 32],policy: [u8; 32],asset: [u8; 32],hub_domain: [u8; 32],registry_commitment: [u8; 32],chain_domain: [u8; 32],source_commitment: [u8; 32],destination_commitment: [u8; 32],amount: u128,payout_commitment: [u8; 32],settle_before: u64,salt: [u8; 32]) -> [u8; 32] {
 let mut message:[u8;492]=[0;492];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,54,52,47,100,101,108,105,118,101,114,121,45,114,105,115,107,47,50]);
 message=part(message,34,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,54,52,95,86,50]);
 message=part(message,62,[70,85,76,76,95,79,87,78,69,82,95,82,69,70,85,78,68,95,80,82,79,86,73,68,69,82,95,76,79,83,83,95,86,49]);
 message=part(message,100,scope);
 message=part(message,136,policy);
 message=part(message,172,asset);
 message=part(message,208,hub_domain);
 message=part(message,244,registry_commitment);
 message=part(message,280,chain_domain);
 message=part(message,316,source_commitment);
 message=part(message,352,destination_commitment);
 message=part(message,388,u128_bytes(amount));
 message=part(message,408,payout_commitment);
 message=part(message,444,u64_bytes(settle_before));
 message=part(message,456,salt);
 sha256::<492,512>(message)
}
