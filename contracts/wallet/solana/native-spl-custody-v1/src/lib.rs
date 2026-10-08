//! NEW local-development custody program. No recovered ELF or private-credit acceptance.
//! Token principal is an exact USDC amount; lamports are only rent/transaction fees.
use solana_program::{account_info::AccountInfo, clock::Clock, entrypoint, entrypoint::ProgramResult,
 hash::hash, instruction::{AccountMeta, Instruction}, program::{invoke, invoke_signed},
 program_error::ProgramError, program_option::COption, program_pack::Pack, pubkey::Pubkey,
 rent::Rent, secp256k1_recover::secp256k1_recover, system_instruction, system_program,
 sysvar::{self, instructions::{load_current_index_checked, load_instruction_at_checked}, Sysvar}};
use spl_token::state::{Account as TokenAccount, AccountState, Mint};
solana_program::declare_id!("5RnJjhp7NKPgawoXnPJiXJtjJ5ktkMUrRuBtP4YmLSUM");
entrypoint!(process_instruction);
const CONFIG_LEN:usize=610;
const RECEIPT_LEN:usize=128;
const TICKET_LEN:usize=192;
const MAX_SAFE:u64=9_007_199_254_740_991;
const INPUT:u64=10_000_000;
const JUP:Pubkey=solana_program::pubkey!("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");
const ORCA:Pubkey=solana_program::pubkey!("9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP");
const USDC:Pubkey=solana_program::pubkey!("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const WSOL:Pubkey=solana_program::pubkey!("So11111111111111111111111111111111111111112");
const MEMO:Pubkey=solana_program::pubkey!("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const COMPUTE:Pubkey=solana_program::pubkey!("ComputeBudget111111111111111111111111111111");
const POOL:Pubkey=solana_program::pubkey!("EGZ7tiLeH62TPV1gL8WwbXGzEPa9zmcpVnnkPKKnrE2U");
const AUTHORITY:Pubkey=solana_program::pubkey!("JU8kmKzDHF9sXWsnoznaFDFezLsE5uomX2JkRMbmsQP");
const RES_SOL:Pubkey=solana_program::pubkey!("ANP74VNsHwSrq9uUSjiSNyNWvf6ZPrKTmE4gHoNd13Lg");
const RES_USDC:Pubkey=solana_program::pubkey!("75HgnSvXbWKZBpZHveX68ZzAhDqMzNDS29X6BGLtxMo1");
const LP:Pubkey=solana_program::pubkey!("APDFRM3HMr8CAGXwKHiu2f5ePSpaiEJhaURwhsRrUUt9");
const LP_FEE:Pubkey=solana_program::pubkey!("8JnSiuvQq3BVuCU3n4DrSTw9chBSPvEMswrhtifVkr1o");
const EVENT:Pubkey=solana_program::pubkey!("D8cy77BBepLMngZx6ZukaTff5hCt1HrWyKk3Hnd9oitf");
const HALF_ORDER:[u8;32]=[0x7f,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0x5d,0x57,0x6e,0x73,0x57,0xa4,0x50,0x1d,0xdf,0xe9,0x2f,0x46,0x68,0x1b,0x20,0xa0];
fn need(ok:bool)->ProgramResult {if ok {Ok(())} else {Err(ProgramError::InvalidArgument)}}
fn be64(b:&[u8])->Result<u64,ProgramError>{Ok(u64::from_be_bytes(b.try_into().map_err(|_|ProgramError::InvalidInstructionData)?))}
fn take<'a>(data:&'a[u8],at:usize,n:usize)->Result<&'a[u8],ProgramError>{data.get(at..at+n).ok_or(ProgramError::InvalidInstructionData)}
fn nz(b:&[u8])->ProgramResult{need(b.iter().any(|v|*v!=0))}
fn exact_key(a:&AccountInfo,k:&Pubkey)->ProgramResult{need(a.key==k)}
fn framed(tag:&[u8],parts:&[&[u8]])->Vec<u8>{let mut out=Vec::new();for p in std::iter::once(tag).chain(parts.iter().copied()){out.extend_from_slice(&(p.len()as u32).to_be_bytes());out.extend_from_slice(p);}out}
fn digest(tag:&[u8],parts:&[&[u8]])->[u8;32]{hash(&framed(tag,parts)).to_bytes()}
fn token(a:&AccountInfo,mint:&Pubkey,owner:Option<&Pubkey>)->Result<TokenAccount,ProgramError>{
 exact_key_owner(a,&spl_token::id())?;let t=TokenAccount::unpack(&a.try_borrow_data()?)?;
 need(t.state==AccountState::Initialized&&t.mint==*mint&&owner.map_or(true,|o|t.owner==*o)
  &&t.delegate==COption::None&&t.delegated_amount==0&&t.close_authority==COption::None)?;Ok(t)
}
fn exact_key_owner(a:&AccountInfo,k:&Pubkey)->ProgramResult{need(a.owner==k)}
fn config(a:&AccountInfo,vault:&AccountInfo)->Result<Vec<u8>,ProgramError>{
 exact_key_owner(a,&id())?;let c=a.try_borrow_data()?.to_vec();need(c.len()==CONFIG_LEN&&&c[..8]==b"LNSPL001")?;
 let cfg=Pubkey::create_program_address(&[b"spl-config",&c[8..40],&c[40..72],&[c[608]]],&id())?;need(cfg==*a.key)?;
 let v=Pubkey::create_program_address(&[b"spl-vault",a.key.as_ref(),&[c[609]]],&id())?;need(v==*vault.key)?;
 let t=token(vault,&USDC,Some(a.key))?;need(t.amount==be64(&c[592..600])?&&be64(&c[600..608])?<=t.amount)?;Ok(c)
}
fn create_pda<'a>(payer:&AccountInfo<'a>,out:&AccountInfo<'a>,system:&AccountInfo<'a>,owner:&Pubkey,space:usize,seeds:&[&[u8]])->ProgramResult{
 need(payer.is_signer&&payer.is_writable&&out.is_writable&&out.data_is_empty()&&out.lamports()==0)?;exact_key(system,&system_program::id())?;
 invoke_signed(&system_instruction::create_account(payer.key,out.key,Rent::get()?.minimum_balance(space),space as u64,owner),&[payer.clone(),out.clone(),system.clone()],&[seeds])
}
fn memo_binding(sys:&AccountInfo,key:&[u8])->ProgramResult{
 need(key.len()==32)?;nz(key)?;exact_key(sys,&sysvar::instructions::id())?;need(load_current_index_checked(sys)?==0)?;
 let m=load_instruction_at_checked(1,sys)?;need(m.program_id==MEMO&&m.accounts.is_empty())?;
 let alphabet=b"0123456789abcdef";let mut expected=b"LNRB1:".to_vec();for b in key {expected.push(alphabet[(b>>4)as usize]);expected.push(alphabet[(b&15)as usize]);}
 need(m.data==expected)?;let b=load_instruction_at_checked(2,sys)?;need(b.program_id==COMPUTE&&b.accounts.is_empty()&&b.data==[2,128,26,6,0])?;
 need(load_instruction_at_checked(3,sys).is_err())
}
fn time_window(from:u64,until:u64)->ProgramResult{let now=Clock::get()?.unix_timestamp;need(now>=0&&from<until&&until-from<=30&&from<=now as u64&&(now as u64)<until)}
fn transfer<'a>(vault:&AccountInfo<'a>,mint:&AccountInfo<'a>,dest:&AccountInfo<'a>,cfg:&AccountInfo<'a>,tp:&AccountInfo<'a>,c:&[u8],amount:u64)->ProgramResult{
 exact_key(tp,&spl_token::id())?;exact_key(mint,&USDC)?;
 let bump=[c[608]];let seeds:&[&[u8]]=&[b"spl-config",&c[8..40],&c[40..72],&bump];
 invoke_signed(&spl_token::instruction::transfer_checked(tp.key,vault.key,mint.key,dest.key,cfg.key,&[],amount,6)?,&[vault.clone(),mint.clone(),dest.clone(),cfg.clone(),tp.clone()],&[seeds])
}
fn initialize(a:&[AccountInfo],d:&[u8])->ProgramResult{
 need(a.len()==6&&d.len()==552)?;let[payer,cfg,vault,mint,tp,system]=a else{return Err(ProgramError::NotEnoughAccountKeys)};
 need(payer.is_signer&&payer.owner==&system_program::id())?;exact_key(mint,&USDC)?;exact_key(tp,&spl_token::id())?;exact_key_owner(mint,tp.key)?;
 let m=Mint::unpack(&mint.try_borrow_data()?)?;need(m.is_initialized&&m.decimals==6)?;
 for at in [0,32,64,96,128,160,192,224,264] {nz(&d[at..at+32])?;}
 let (cfg_key,cb)=Pubkey::find_program_address(&[b"spl-config",payer.key.as_ref(),&d[..32]],&id());need(cfg_key==*cfg.key)?;
 let (vault_key,vb)=Pubkey::find_program_address(&[b"spl-vault",cfg.key.as_ref()],&id());need(vault_key==*vault.key)?;
 let asset=digest(b"LIANUM/PAEG/native-spl-asset/1",&[&d[32..64],USDC.as_ref(),tp.key.as_ref(),id().as_ref(),cfg.key.as_ref(),vault.key.as_ref()]);need(asset==d[64..96])?;
 let mut parts:Vec<&[u8]>=vec![b"LIANUM_NATIVE_QUORUM_3_OF_4_SECP256K1_V2",&d[224..256],&d[256..264],&d[264..296]];
 for i in 0..4 {let k=&d[296+i*64..360+i*64];nz(k)?;for j in 0..i {need(k[..32]!=d[296+j*64..328+j*64])?;}parts.push(&k[..32]);parts.push(&k[32..]);}
 need(digest(b"LIANUM/native-registry/secp256k1/2",&parts)==d[192..224])?;
 create_pda(payer,cfg,system,&id(),CONFIG_LEN,&[b"spl-config",payer.key.as_ref(),&d[..32],&[cb]])?;
 create_pda(payer,vault,system,tp.key,TokenAccount::LEN,&[b"spl-vault",cfg.key.as_ref(),&[vb]])?;
 invoke(&spl_token::instruction::initialize_account3(tp.key,vault.key,mint.key,cfg.key)?,&[vault.clone(),mint.clone(),tp.clone()])?;
 let mut out=cfg.try_borrow_mut_data()?;out[..8].copy_from_slice(b"LNSPL001");out[8..40].copy_from_slice(payer.key.as_ref());out[40..592].copy_from_slice(d);out[608]=cb;out[609]=vb;Ok(())
}
fn swap_deposit(a:&[AccountInfo],d:&[u8])->ProgramResult{
 need(a.len()==19&&d.len()==48)?;let[payer,cfg,vault,receipt,source,refund,mint,tp,system,ix,jup,event,dex,pool,authority,res_sol,res_usdc,lp,lp_fee]=a else{return Err(ProgramError::NotEnoughAccountKeys)};
 need(payer.is_signer&&payer.is_writable&&cfg.is_writable&&vault.is_writable&&receipt.is_writable&&source.is_writable&&refund.is_writable)?;
 let c=config(cfg,vault)?;let q=be64(&d[32..40])?;let quote=be64(&d[40..48])?;need(q>0&&q<=MAX_SAFE&&quote>=q)?;memo_binding(ix,&d[..32])?;
 for (info,key) in [(jup,&JUP),(event,&EVENT),(dex,&ORCA),(pool,&POOL),(authority,&AUTHORITY),(res_sol,&RES_SOL),(res_usdc,&RES_USDC),(lp,&LP),(lp_fee,&LP_FEE),(mint,&USDC),(tp,&spl_token::id())]{exact_key(info,key)?;}
 need(jup.executable&&dex.executable&&tp.executable&&source.key!=vault.key&&source.key!=refund.key&&refund.key!=vault.key)?;
 let source_before=token(source,&WSOL,Some(payer.key))?.amount;need(source_before>=INPUT)?;let refund_before=token(refund,&USDC,Some(payer.key))?.amount;let before=token(vault,&USDC,Some(cfg.key))?.amount;
 let (receipt_key,bump)=Pubkey::find_program_address(&[b"spl-deposit",cfg.key.as_ref(),&d[..32]],&id());need(receipt_key==*receipt.key)?;
 create_pda(payer,receipt,system,&id(),RECEIPT_LEN,&[b"spl-deposit",cfg.key.as_ref(),&d[..32],&[bump]])?;
 let ro=|info:&AccountInfo|AccountMeta::new_readonly(*info.key,false);let wr=|info:&AccountInfo|AccountMeta::new(*info.key,false);
 let mut route=vec![229,23,203,151,122,227,173,42];route.extend_from_slice(&1u32.to_le_bytes());route.extend_from_slice(&[3,100,0,1]);route.extend_from_slice(&INPUT.to_le_bytes());route.extend_from_slice(&quote.to_le_bytes());route.extend_from_slice(&50u16.to_le_bytes());route.push(0);
 let instruction=Instruction{program_id:JUP,data:route,accounts:vec![ro(tp),AccountMeta::new_readonly(*payer.key,true),wr(source),wr(vault),ro(jup),ro(mint),ro(jup),ro(event),ro(jup),ro(dex),ro(tp),wr(pool),ro(authority),AccountMeta::new_readonly(*payer.key,true),wr(source),wr(res_sol),wr(res_usdc),wr(vault),wr(lp),wr(lp_fee)]};
 invoke(&instruction,a)?;
 let received=token(vault,&USDC,Some(cfg.key))?.amount.checked_sub(before).ok_or(ProgramError::InvalidAccountData)?;let spent=source_before.checked_sub(token(source,&WSOL,Some(payer.key))?.amount).ok_or(ProgramError::InvalidAccountData)?;need(received>=q&&spent>0&&spent<=INPUT)?;
 let surplus=received-q;if surplus>0 {transfer(vault,mint,refund,cfg,tp,&c,surplus)?;}
 need(token(vault,&USDC,Some(cfg.key))?.amount==before.checked_add(q).ok_or(ProgramError::ArithmeticOverflow)?&&token(refund,&USDC,Some(payer.key))?.amount==refund_before.checked_add(surplus).ok_or(ProgramError::ArithmeticOverflow)?)?;
 let principal=be64(&c[592..600])?.checked_add(q).ok_or(ProgramError::ArithmeticOverflow)?;need(principal<=MAX_SAFE)?;
 cfg.try_borrow_mut_data()?[592..600].copy_from_slice(&principal.to_be_bytes());let mut r=receipt.try_borrow_mut_data()?;r[..8].copy_from_slice(b"LNSPD001");r[8..40].copy_from_slice(cfg.key.as_ref());r[40..72].copy_from_slice(&d[..32]);r[72..104].copy_from_slice(payer.key.as_ref());r[104..112].copy_from_slice(&q.to_be_bytes());r[112..120].copy_from_slice(&Clock::get()?.slot.to_be_bytes());r[120]=1;Ok(())
}
const ACTION_WIDTHS:[usize;11]=[1,32,8,8,32,8,32,32,32,8,8];
const BACKING_WIDTHS:[usize;18]=[32,32,32,8,8,32,32,32,32,32,32,32,32,32,32,32,8,8];
fn fields<'a>(raw:&'a[u8],widths:&[usize])->Result<Vec<&'a[u8]>,ProgramError>{let mut result=Vec::new();let mut at=0;for n in widths {result.push(take(raw,at,*n)?);at+=n;}need(at==raw.len())?;Ok(result)}
fn bounded_u256(raw:&[u8])->Result<u64,ProgramError>{need(raw.len()==32&&raw[..24].iter().all(|v|*v==0))?;be64(&raw[24..])}
fn action_digest(c:&[u8],raw:&[u8])->Result<[u8;32],ProgramError>{let parts=fields(raw,&ACTION_WIDTHS)?;let mut all=vec![&c[136..168]];all.extend(parts);Ok(digest(b"LIANUM/PAEG/native-claim-action/1",&all))}
// Principal committed to every still-live authorization is never reusable.
fn reserve_principal(principal:u64,reserved:u64,amount:u64,pending:u64)->Result<u64,ProgramError>{
 need(reserved<=principal&&amount>0)?;let next=reserved.checked_add(amount).ok_or(ProgramError::ArithmeticOverflow)?;
 need(next<=principal&&next<=pending)?;Ok(next)
}
fn consume_principal(principal:u64,reserved:u64,amount:u64)->Result<(u64,u64),ProgramError>{
 need(amount>0&&amount<=reserved&&reserved<=principal)?;Ok((principal-amount,reserved-amount))
}
fn authorize(a:&[AccountInfo],d:&[u8])->ProgramResult{
 need(a.len()==5&&d.len()==876)?;let[payer,cfg,vault,ticket,system]=a else{return Err(ProgramError::NotEnoughAccountKeys)};let c=config(cfg,vault)?;need(cfg.is_writable)?;
 let action=&d[..201];let act=fields(action,&ACTION_WIDTHS)?;need(act[0]==[6]&&be64(act[2])?>0&&be64(act[3])?>0&&be64(act[3])?<=MAX_SAFE)?;nz(act[1])?;
 let backing=&d[201..681];let b=fields(backing,&BACKING_WIDTHS)?;let h=action_digest(&c,action)?;
 need(b[0]==&c[136..168]&&b[1]==&c[168..200]&&b[2]==h&&b[3]==act[9]&&b[4]==act[10])?;
 let principal=bounded_u256(b[11])?;need(principal==be64(&c[592..600])?&&bounded_u256(b[10])?==0)?;
 let liabilities=(6..10).try_fold(0u64,|sum,i|sum.checked_add(bounded_u256(b[i])?).ok_or(ProgramError::ArithmeticOverflow))?;need(liabilities<=principal&&bounded_u256(b[13])?<=bounded_u256(b[12])?)?;
 let pending=bounded_u256(b[7])?.checked_add(bounded_u256(b[8])?).ok_or(ProgramError::ArithmeticOverflow)?;
 let reserved=reserve_principal(principal,be64(&c[600..608])?,be64(act[3])?,pending)?;
 let from=be64(b[16])?;let until=be64(b[17])?;time_window(from,until)?;let dh=digest(b"LIANUM/PAEG/native-claim-backing-permit/1",&b);
 let indexes=&d[681..684];need(indexes[0]<indexes[1]&&indexes[1]<indexes[2]&&indexes[2]<4)?;
 for n in 0..3 {let sig=&d[684+n*64..748+n*64];nz(&sig[..32])?;nz(&sig[32..])?;need(&sig[32..]<=HALF_ORDER.as_slice())?;
  let expected=&c[336+indexes[n]as usize*64..400+indexes[n]as usize*64];let accepted=(0..2).any(|v|secp256k1_recover(&dh,v,sig).map(|p|p.to_bytes().as_slice()==expected).unwrap_or(false));need(accepted)?;}
 let (key,bump)=Pubkey::find_program_address(&[b"spl-payout",cfg.key.as_ref(),act[1]],&id());need(key==*ticket.key)?;
 create_pda(payer,ticket,system,&id(),TICKET_LEN,&[b"spl-payout",cfg.key.as_ref(),act[1],&[bump]])?;
 let mut t=ticket.try_borrow_mut_data()?;t[..8].copy_from_slice(b"LNSPT001");t[8..40].copy_from_slice(cfg.key.as_ref());t[40..72].copy_from_slice(act[1]);t[72..104].copy_from_slice(&h);t[104..112].copy_from_slice(&from.to_be_bytes());t[112..120].copy_from_slice(&until.to_be_bytes());t[120..128].copy_from_slice(act[3]);t[128..160].copy_from_slice(&dh);t[160]=0;cfg.try_borrow_mut_data()?[600..608].copy_from_slice(&reserved.to_be_bytes());Ok(())
}
fn deliver(a:&[AccountInfo],d:&[u8])->ProgramResult{
 need(a.len()==8&&d.len()==233)?;let[payer,cfg,vault,ticket,dest,tp,mint,ix]=a else{return Err(ProgramError::NotEnoughAccountKeys)};need(payer.is_signer&&cfg.is_writable&&vault.is_writable&&ticket.is_writable&&dest.is_writable)?;
 let c=config(cfg,vault)?;let action=&d[..201];let act=fields(action,&ACTION_WIDTHS)?;need(act[0]==[6]&&dest.key!=vault.key)?;memo_binding(ix,act[7])?;
 exact_key_owner(ticket,&id())?;let t=ticket.try_borrow_data()?.to_vec();need(t.len()==TICKET_LEN&&&t[..8]==b"LNSPT001"&&t[8..40]==*cfg.key.as_ref()&&t[40..72]==*act[1]&&t[72..104]==action_digest(&c,action)?&&t[160]==0)?;
 let(key,_)=Pubkey::find_program_address(&[b"spl-payout",cfg.key.as_ref(),act[1]],&id());need(key==*ticket.key)?;time_window(be64(&t[104..112])?,be64(&t[112..120])?)?;
 let amount=be64(act[3])?;need(amount>0&&amount==be64(&t[120..128])?&&amount<=be64(&c[592..600])?)?;
 let endpoint=digest(b"LIANUM/PAEG/native-endpoint/2",&[b"LIANUM_PAEG_NATIVE_4_V2",b"SOL",&c[72..104],&c[104..136],b"SOL_PUBLIC_KEY",dest.key.as_ref()]);
 let destination=digest(b"LIANUM/PAEG/native-claim-destination/1",&[&c[136..168],&c[200..232],&endpoint,act[3],act[5],&d[201..233]]);need(destination==act[4])?;
 let before=token(dest,&USDC,None)?.amount;let principal=be64(&c[592..600])?;let(next_principal,next_reserved)=consume_principal(principal,be64(&c[600..608])?,amount)?;ticket.try_borrow_mut_data()?[160]=1;
 transfer(vault,mint,dest,cfg,tp,&c,amount)?;need(token(dest,&USDC,None)?.amount==before.checked_add(amount).ok_or(ProgramError::ArithmeticOverflow)?&&token(vault,&USDC,Some(cfg.key))?.amount==principal-amount)?;
 {let mut updated=cfg.try_borrow_mut_data()?;updated[592..600].copy_from_slice(&next_principal.to_be_bytes());updated[600..608].copy_from_slice(&next_reserved.to_be_bytes());}ticket.try_borrow_mut_data()?[161..169].copy_from_slice(&Clock::get()?.slot.to_be_bytes());Ok(())
}
pub fn process_instruction(program:&Pubkey,accounts:&[AccountInfo],data:&[u8])->ProgramResult{
 need(program==&id()&&data.len()>=2&&data[0]==1)?;match data[1] {0=>initialize(accounts,&data[2..]),1=>swap_deposit(accounts,&data[2..]),2=>authorize(accounts,&data[2..]),3=>deliver(accounts,&data[2..]),_=>Err(ProgramError::InvalidInstructionData)}
}

#[cfg(test)] mod reservation_tests {
 use super::*;
 #[test] fn cannot_count_the_same_principal_for_two_tickets(){
  let first=reserve_principal(100,0,80,100).unwrap();assert_eq!(first,80);
  assert!(reserve_principal(100,first,30,100).is_err());assert_eq!(reserve_principal(100,first,20,100).unwrap(),100);
  assert!(reserve_principal(100,0,80,79).is_err());
 }
 #[test] fn consume_only_the_original_reserved_principal(){
  assert_eq!(consume_principal(100,100,80).unwrap(),(20,20));assert!(consume_principal(20,20,21).is_err());
  assert!(consume_principal(100,0,80).is_err());assert!(consume_principal(100,101,1).is_err());
 }
}
