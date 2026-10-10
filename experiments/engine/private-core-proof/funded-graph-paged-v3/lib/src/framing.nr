use graph_support::sha256::{sha256,u32_bytes,u64_bytes};
fn part<let N:u32,let M:u32>(buffer:[u8;N],offset:u32,value:[u8;M])->[u8;N]{let mut result=buffer;let size=u32_bytes(M);for i in 0..4{result[offset+i]=size[i];}for i in 0..M{result[offset+4+i]=value[i];}result}
pub fn domain(scope:[u8;32], policy:[u8;32], asset:[u8;32], hub_domain:[u8;32], registry_commitment:[u8;32])->[u8;32]{
 let mut message:[u8;241]=[0;241];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,100,111,109,97,105,110,47,51]);
 message=part(message,30,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,61,scope);
 message=part(message,97,policy);
 message=part(message,133,asset);
 message=part(message,169,hub_domain);
 message=part(message,205,registry_commitment);
 sha256::<241,256>(message)
}

pub fn context(scope:[u8;32], policy:[u8;32], asset:[u8;32], hub_domain:[u8;32], registry_commitment:[u8;32], operation_id:[u8;32], graph_salt:[u8;32])->[u8;32]{
 let mut message:[u8;314]=[0;314];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,99,111,110,116,101,120,116,47,51]);
 message=part(message,31,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,62,scope);
 message=part(message,98,policy);
 message=part(message,134,asset);
 message=part(message,170,hub_domain);
 message=part(message,206,registry_commitment);
 message=part(message,242,operation_id);
 message=part(message,278,graph_salt);
 sha256::<314,384>(message)
}

pub fn empty_pages(context:[u8;32])->[u8;32]{
 let mut message:[u8;102]=[0;102];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,101,109,112,116,121,45,112,97,103,101,115,47,51]);
 message=part(message,35,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,66,context);
 sha256::<102,128>(message)
}

pub fn pages_empty()->[u8;32]{
 let mut message:[u8;66]=[0;66];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,112,97,103,101,115,45,101,109,112,116,121,47,51]);
 message=part(message,35,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 sha256::<66,128>(message)
}

pub fn pages_branch(left:[u8;32], right:[u8;32])->[u8;32]{
 let mut message:[u8;139]=[0;139];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,112,97,103,101,115,45,98,114,97,110,99,104,47,51]);
 message=part(message,36,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,67,left);
 message=part(message,103,right);
 sha256::<139,192>(message)
}

pub fn empty_nodes(context:[u8;32])->[u8;32]{
 let mut message:[u8;102]=[0;102];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,101,109,112,116,121,45,110,111,100,101,115,47,51]);
 message=part(message,35,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,66,context);
 sha256::<102,128>(message)
}

pub fn nodes_empty()->[u8;32]{
 let mut message:[u8;66]=[0;66];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,110,111,100,101,115,45,101,109,112,116,121,47,51]);
 message=part(message,35,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 sha256::<66,128>(message)
}

pub fn nodes_branch(left:[u8;32], right:[u8;32])->[u8;32]{
 let mut message:[u8;139]=[0;139];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,110,111,100,101,115,45,98,114,97,110,99,104,47,51]);
 message=part(message,36,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,67,left);
 message=part(message,103,right);
 sha256::<139,192>(message)
}

pub fn empty_outputs(context:[u8;32])->[u8;32]{
 let mut message:[u8;104]=[0;104];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,101,109,112,116,121,45,111,117,116,112,117,116,115,47,51]);
 message=part(message,37,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,68,context);
 sha256::<104,128>(message)
}

pub fn outputs_empty()->[u8;32]{
 let mut message:[u8;68]=[0;68];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,111,117,116,112,117,116,115,45,101,109,112,116,121,47,51]);
 message=part(message,37,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 sha256::<68,128>(message)
}

pub fn outputs_branch(left:[u8;32], right:[u8;32])->[u8;32]{
 let mut message:[u8;141]=[0;141];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,111,117,116,112,117,116,115,45,98,114,97,110,99,104,47,51]);
 message=part(message,38,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,69,left);
 message=part(message,105,right);
 sha256::<141,192>(message)
}

pub fn frontier_empty()->[u8;32]{
 let mut message:[u8;69]=[0;69];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,102,114,111,110,116,105,101,114,45,101,109,112,116,121,47,51]);
 message=part(message,38,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 sha256::<69,128>(message)
}

pub fn frontier_branch(left:[u8;32], right:[u8;32])->[u8;32]{
 let mut message:[u8;142]=[0;142];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,102,114,111,110,116,105,101,114,45,98,114,97,110,99,104,47,51]);
 message=part(message,39,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,70,left);
 message=part(message,106,right);
 sha256::<142,192>(message)
}

pub fn pages(previous:[u8;32], index:u64, digest:[u8;32])->[u8;32]{
 let mut message:[u8;144]=[0;144];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,112,97,103,101,115,47,51]);
 message=part(message,29,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,60,previous);
 message=part(message,96,u64_bytes(index));
 message=part(message,108,digest);
 sha256::<144,192>(message)
}

pub fn nodes(previous:[u8;32], index:u64, digest:[u8;32])->[u8;32]{
 let mut message:[u8;144]=[0;144];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,110,111,100,101,115,47,51]);
 message=part(message,29,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,60,previous);
 message=part(message,96,u64_bytes(index));
 message=part(message,108,digest);
 sha256::<144,192>(message)
}

pub fn outputs(previous:[u8;32], index:u64, digest:[u8;32])->[u8;32]{
 let mut message:[u8;146]=[0;146];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,111,117,116,112,117,116,115,47,51]);
 message=part(message,31,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,62,previous);
 message=part(message,98,u64_bytes(index));
 message=part(message,110,digest);
 sha256::<146,192>(message)
}

pub fn dependency(previous:[u8;32], index:u64, digest:[u8;32])->[u8;32]{
 let mut message:[u8;149]=[0;149];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,100,101,112,101,110,100,101,110,99,121,47,51]);
 message=part(message,34,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,65,previous);
 message=part(message,101,u64_bytes(index));
 message=part(message,113,digest);
 sha256::<149,192>(message)
}

pub fn spent(previous:[u8;32], index:u64, digest:[u8;32])->[u8;32]{
 let mut message:[u8;144]=[0;144];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,115,112,101,110,116,47,51]);
 message=part(message,29,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,60,previous);
 message=part(message,96,u64_bytes(index));
 message=part(message,108,digest);
 sha256::<144,192>(message)
}

pub fn effects(previous:[u8;32], index:u64, digest:[u8;32])->[u8;32]{
 let mut message:[u8;146]=[0;146];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,101,102,102,101,99,116,115,47,51]);
 message=part(message,31,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,62,previous);
 message=part(message,98,u64_bytes(index));
 message=part(message,110,digest);
 sha256::<146,192>(message)
}

pub fn empty_dependencies(context:[u8;32], ordinal:u64)->[u8;32]{
 let mut message:[u8;121]=[0;121];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,101,109,112,116,121,45,100,101,112,101,110,100,101,110,99,105,101,115,47,51]);
 message=part(message,42,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,73,context);
 message=part(message,109,u64_bytes(ordinal));
 sha256::<121,192>(message)
}

pub fn dependency_item(ordinal:u64, node_digest:[u8;32])->[u8;32]{
 let mut message:[u8;118]=[0;118];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,100,101,112,101,110,100,101,110,99,121,45,105,116,101,109,47,51]);
 message=part(message,39,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,70,u64_bytes(ordinal));
 message=part(message,82,node_digest);
 sha256::<118,128>(message)
}

pub fn payout_origin(scope:[u8;32], policy:[u8;32], asset:[u8;32], hub_domain:[u8;32], registry_commitment:[u8;32], operation_id:[u8;32], ordinal:u64, randomness:[u8;32])->[u8;32]{
 let mut message:[u8;332]=[0;332];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,112,97,121,111,117,116,45,111,114,105,103,105,110,47,51]);
 message=part(message,37,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,68,scope);
 message=part(message,104,policy);
 message=part(message,140,asset);
 message=part(message,176,hub_domain);
 message=part(message,212,registry_commitment);
 message=part(message,248,operation_id);
 message=part(message,284,u64_bytes(ordinal));
 message=part(message,296,randomness);
 sha256::<332,384>(message)
}

pub fn empty_change(scope:[u8;32], policy:[u8;32], asset:[u8;32], hub_domain:[u8;32], registry_commitment:[u8;32], input_nullifier:[u8;32], operation_id:[u8;32], reservation_nonce:[u8;32])->[u8;32]{
 let mut message:[u8;355]=[0;355];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,101,109,112,116,121,45,99,104,97,110,103,101,47,51]);
 message=part(message,36,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,67,scope);
 message=part(message,103,policy);
 message=part(message,139,asset);
 message=part(message,175,hub_domain);
 message=part(message,211,registry_commitment);
 message=part(message,247,input_nullifier);
 message=part(message,283,operation_id);
 message=part(message,319,reservation_nonce);
 sha256::<355,384>(message)
}

pub fn node(ordinal:u64, id_digest:[u8;32], chain_domain:[u8;32], evidence_policy:[u8;32], action_commitment:[u8;32], local_commitment:[u8;32], dispatch_id:[u8;32], receipt_key_commitment:[u8;32], receipt_rho:[u8;32], dependencies:[u8;32], payout_commitment:[u8;32], dependency_count:u64)->[u8;32]{
 let mut message:[u8;443]=[0;443];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,110,111,100,101,47,51]);
 message=part(message,28,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,59,u64_bytes(ordinal));
 message=part(message,71,id_digest);
 message=part(message,107,chain_domain);
 message=part(message,143,evidence_policy);
 message=part(message,179,action_commitment);
 message=part(message,215,local_commitment);
 message=part(message,251,dispatch_id);
 message=part(message,287,receipt_key_commitment);
 message=part(message,323,receipt_rho);
 message=part(message,359,dependencies);
 message=part(message,395,payout_commitment);
 message=part(message,431,u64_bytes(dependency_count));
 sha256::<443,512>(message)
}

pub fn page(context:[u8;32], page_index:u64, first_node:u64, count:u8, salt:[u8;32], previous_nodes:[u8;32], next_nodes:[u8;32], previous_outputs:[u8;32], next_outputs:[u8;32])->[u8;32]{
 let mut message:[u8;304]=[0;304];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,112,97,103,101,47,51]);
 message=part(message,28,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,59,context);
 message=part(message,95,u64_bytes(page_index));
 message=part(message,107,u64_bytes(first_node));
 message=part(message,119,[count]);
 message=part(message,124,salt);
 message=part(message,160,previous_nodes);
 message=part(message,196,next_nodes);
 message=part(message,232,previous_outputs);
 message=part(message,268,next_outputs);
 sha256::<304,320>(message)
}

pub fn reserve(scope:[u8;32], policy:[u8;32], asset:[u8;32], hub_domain:[u8;32], registry_commitment:[u8;32], operation_id:[u8;32], reservation_nonce:[u8;32], pages_root:[u8;32], nodes_root:[u8;32], outputs_root:[u8;32], budget:u64, recovery_commitment:[u8;32], reserve_secret:[u8;32])->[u8;32]{
 let mut message:[u8;506]=[0;506];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,114,101,115,101,114,118,101,47,51]);
 message=part(message,31,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,62,scope);
 message=part(message,98,policy);
 message=part(message,134,asset);
 message=part(message,170,hub_domain);
 message=part(message,206,registry_commitment);
 message=part(message,242,operation_id);
 message=part(message,278,reservation_nonce);
 message=part(message,314,pages_root);
 message=part(message,350,nodes_root);
 message=part(message,386,outputs_root);
 message=part(message,422,u64_bytes(budget));
 message=part(message,434,recovery_commitment);
 message=part(message,470,reserve_secret);
 sha256::<506,576>(message)
}

pub fn authorization(scope:[u8;32], policy:[u8;32], asset:[u8;32], hub_domain:[u8;32], registry_commitment:[u8;32], operation_id:[u8;32], context:[u8;32], pages_root:[u8;32], nodes_root:[u8;32], outputs_root:[u8;32], pages_commitment:[u8;32], nodes_commitment:[u8;32], outputs_commitment:[u8;32], input_commitment:[u8;32], input_nullifier:[u8;32], change_commitment:[u8;32], recovery_commitment:[u8;32], reserve_commitment:[u8;32], reserve_nullifier:[u8;32], pages:u64, nodes:u64, budget:u64, funding_not_before:u64, funding_valid_until:u64, settle_before:u64)->[u8;32]{
 let mut message:[u8;824]=[0;824];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,97,117,116,104,111,114,105,122,97,116,105,111,110,47,51]);
 message=part(message,37,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,68,scope);
 message=part(message,104,policy);
 message=part(message,140,asset);
 message=part(message,176,hub_domain);
 message=part(message,212,registry_commitment);
 message=part(message,248,operation_id);
 message=part(message,284,context);
 message=part(message,320,pages_root);
 message=part(message,356,nodes_root);
 message=part(message,392,outputs_root);
 message=part(message,428,pages_commitment);
 message=part(message,464,nodes_commitment);
 message=part(message,500,outputs_commitment);
 message=part(message,536,input_commitment);
 message=part(message,572,input_nullifier);
 message=part(message,608,change_commitment);
 message=part(message,644,recovery_commitment);
 message=part(message,680,reserve_commitment);
 message=part(message,716,reserve_nullifier);
 message=part(message,752,u64_bytes(pages));
 message=part(message,764,u64_bytes(nodes));
 message=part(message,776,u64_bytes(budget));
 message=part(message,788,u64_bytes(funding_not_before));
 message=part(message,800,u64_bytes(funding_valid_until));
 message=part(message,812,u64_bytes(settle_before));
 sha256::<824,896>(message)
}

pub fn owner(authorization_root:[u8;32])->[u8;32]{
 let mut message:[u8;96]=[0;96];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,111,119,110,101,114,47,51]);
 message=part(message,29,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,60,authorization_root);
 sha256::<96,128>(message)
}

pub fn invoice(scope:[u8;32], policy:[u8;32], asset:[u8;32], hub_domain:[u8;32], registry_commitment:[u8;32], authorization_root:[u8;32], ordinal:u64, node_digest:[u8;32], payout_commitment:[u8;32], settle_before:u64)->[u8;32]{
 let mut message:[u8;374]=[0;374];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,105,110,118,111,105,99,101,47,51]);
 message=part(message,31,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,62,scope);
 message=part(message,98,policy);
 message=part(message,134,asset);
 message=part(message,170,hub_domain);
 message=part(message,206,registry_commitment);
 message=part(message,242,authorization_root);
 message=part(message,278,u64_bytes(ordinal));
 message=part(message,290,node_digest);
 message=part(message,326,payout_commitment);
 message=part(message,362,u64_bytes(settle_before));
 sha256::<374,384>(message)
}

pub fn completed(authorization_root:[u8;32], ordinal:u64, node_digest:[u8;32], receipt_commitment:[u8;32])->[u8;32]{
 let mut message:[u8;184]=[0;184];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,99,111,109,112,108,101,116,101,100,47,51]);
 message=part(message,33,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,64,authorization_root);
 message=part(message,100,u64_bytes(ordinal));
 message=part(message,112,node_digest);
 message=part(message,148,receipt_commitment);
 sha256::<184,256>(message)
}

pub fn empty_spent(authorization_root:[u8;32])->[u8;32]{
 let mut message:[u8;102]=[0;102];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,101,109,112,116,121,45,115,112,101,110,116,47,51]);
 message=part(message,35,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,66,authorization_root);
 sha256::<102,128>(message)
}

pub fn empty_effects(authorization_root:[u8;32])->[u8;32]{
 let mut message:[u8;104]=[0;104];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,101,109,112,116,121,45,101,102,102,101,99,116,115,47,51]);
 message=part(message,37,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,68,authorization_root);
 sha256::<104,128>(message)
}

pub fn accumulator(domain:[u8;32], authorization_root:[u8;32], reserve_nullifier:[u8;32], next_page:u64, next_node:u64, payout_sum:u64, next_edge:u64, last_dependency:u64, active_dependency_count:u64, revocation_sequence:u64, min_receipt_until:u64, max_receipt_from:u64, page_chain:[u8;32], node_chain:[u8;32], output_chain:[u8;32], spent_root:[u8;32], effect_root:[u8;32], receipt_frontier:[u8;32], edge_chain:[u8;32], active_node_digest:[u8;32], active_dependency_root:[u8;32])->[u8;32]{
 let mut message:[u8;606]=[0;606];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,97,99,99,117,109,117,108,97,116,111,114,47,51]);
 message=part(message,35,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,66,domain);
 message=part(message,102,authorization_root);
 message=part(message,138,reserve_nullifier);
 message=part(message,174,u64_bytes(next_page));
 message=part(message,186,u64_bytes(next_node));
 message=part(message,198,u64_bytes(payout_sum));
 message=part(message,210,u64_bytes(next_edge));
 message=part(message,222,u64_bytes(last_dependency));
 message=part(message,234,u64_bytes(active_dependency_count));
 message=part(message,246,u64_bytes(revocation_sequence));
 message=part(message,258,u64_bytes(min_receipt_until));
 message=part(message,270,u64_bytes(max_receipt_from));
 message=part(message,282,page_chain);
 message=part(message,318,node_chain);
 message=part(message,354,output_chain);
 message=part(message,390,spent_root);
 message=part(message,426,effect_root);
 message=part(message,462,receipt_frontier);
 message=part(message,498,edge_chain);
 message=part(message,534,active_node_digest);
 message=part(message,570,active_dependency_root);
 sha256::<606,640>(message)
}

pub fn ready(authorization_root:[u8;32], node_digest:[u8;32], dispatch_id:[u8;32], accumulator:[u8;32], valid_from:u64, valid_until:u64)->[u8;32]{
 let mut message:[u8;228]=[0;228];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,114,101,97,100,121,47,51]);
 message=part(message,29,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,60,authorization_root);
 message=part(message,96,node_digest);
 message=part(message,132,dispatch_id);
 message=part(message,168,accumulator);
 message=part(message,204,u64_bytes(valid_from));
 message=part(message,216,u64_bytes(valid_until));
 sha256::<228,256>(message)
}

pub fn native_evidence(domain:[u8;32], hub_domain:[u8;32], registry_commitment:[u8;32], receipt_count:u64, revocation_sequence:u64, state_sequence:u64, halted:u8)->[u8;32]{
 let mut message:[u8;219]=[0;219];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,110,97,116,105,118,101,45,101,118,105,100,101,110,99,101,47,51]);
 message=part(message,39,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,70,domain);
 message=part(message,106,hub_domain);
 message=part(message,142,registry_commitment);
 message=part(message,178,u64_bytes(receipt_count));
 message=part(message,190,u64_bytes(revocation_sequence));
 message=part(message,202,u64_bytes(state_sequence));
 message=part(message,214,[halted]);
 sha256::<219,256>(message)
}

pub fn admission_nullifier(hub_domain:[u8;32], global_effect_id:[u8;32])->[u8;32]{
 let mut message:[u8;146]=[0;146];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,97,100,109,105,115,115,105,111,110,45,110,117,108,108,105,102,105,101,114,47,51]);
 message=part(message,43,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,74,hub_domain);
 message=part(message,110,global_effect_id);
 sha256::<146,192>(message)
}

pub fn revoke(hub_domain:[u8;32], registry_commitment:[u8;32], gid:[u8;32], expected_sequence:u64, reason:[u8;32], expires_at:u64)->[u8;32]{
 let mut message:[u8;229]=[0;229];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,114,101,118,111,107,101,47,51]);
 message=part(message,30,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,61,hub_domain);
 message=part(message,97,registry_commitment);
 message=part(message,133,gid);
 message=part(message,169,u64_bytes(expected_sequence));
 message=part(message,181,reason);
 message=part(message,217,u64_bytes(expires_at));
 sha256::<229,256>(message)
}

pub fn health(domain:[u8;32], hub_domain:[u8;32], registry_commitment:[u8;32], evidence:[u8;32], revocation_sequence:u64, state_sequence:u64, valid_from:u64, valid_until:u64)->[u8;32]{
 let mut message:[u8;253]=[0;253];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,104,101,97,108,116,104,47,51]);
 message=part(message,30,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,61,domain);
 message=part(message,97,hub_domain);
 message=part(message,133,registry_commitment);
 message=part(message,169,evidence);
 message=part(message,205,u64_bytes(revocation_sequence));
 message=part(message,217,u64_bytes(state_sequence));
 message=part(message,229,u64_bytes(valid_from));
 message=part(message,241,u64_bytes(valid_until));
 sha256::<253,320>(message)
}

pub fn private_progress(domain:[u8;32], auth:[u8;32], nf:[u8;32], accumulator:[u8;32], blinding:[u8;32])->[u8;32]{
 let mut message:[u8;251]=[0;251];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,112,114,105,118,97,116,101,45,112,114,111,103,114,101,115,115,47,51]);
 message=part(message,40,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,71,domain);
 message=part(message,107,auth);
 message=part(message,143,nf);
 message=part(message,179,accumulator);
 message=part(message,215,blinding);
 sha256::<251,320>(message)
}

pub fn private_ready(domain:[u8;32], auth:[u8;32], nf:[u8;32], commitment:[u8;32], blinding:[u8;32])->[u8;32]{
 let mut message:[u8;248]=[0;248];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,112,114,105,118,97,116,101,45,114,101,97,100,121,47,51]);
 message=part(message,37,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,68,domain);
 message=part(message,104,auth);
 message=part(message,140,nf);
 message=part(message,176,commitment);
 message=part(message,212,blinding);
 sha256::<248,320>(message)
}

pub fn admitted_empty()->[u8;32]{
 let mut message:[u8;69]=[0;69];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,97,100,109,105,116,116,101,100,45,101,109,112,116,121,47,51]);
 message=part(message,38,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 sha256::<69,128>(message)
}

pub fn admitted_branch(left:[u8;32], right:[u8;32])->[u8;32]{
 let mut message:[u8;142]=[0;142];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,97,100,109,105,116,116,101,100,45,98,114,97,110,99,104,47,51]);
 message=part(message,39,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,70,left);
 message=part(message,106,right);
 sha256::<142,192>(message)
}

pub fn admitted_receipt(auth:[u8;32], cm:[u8;32], gid:[u8;32], valid_from:u64, valid_until:u64)->[u8;32]{
 let mut message:[u8;203]=[0;203];
 message=part(message,0,[76,73,65,78,85,77,47,80,65,69,71,47,112,97,103,101,100,47,97,100,109,105,116,116,101,100,45,114,101,99,101,105,112,116,47,51]);
 message=part(message,40,[76,73,65,78,85,77,95,80,65,69,71,95,70,85,78,68,69,68,95,80,65,71,69,68,95,86,51]);
 message=part(message,71,auth);
 message=part(message,107,cm);
 message=part(message,143,gid);
 message=part(message,179,u64_bytes(valid_from));
 message=part(message,191,u64_bytes(valid_until));
 sha256::<203,256>(message)
}
