import {exact,need} from '../../native-wallet/common-v1.mjs';
export const PUBLIC_PAGED_TESTNET_IDS_V1=Object.freeze(['ethereum-sepolia','bitcoin-testnet','solana-devnet']);
export function assertPublicPagedProviderAccountV1(account){
 exact(account,['networkId','chain','address','publicKey','keyGeneration']);
 need(PUBLIC_PAGED_TESTNET_IDS_V1.includes(account.networkId)&&account.keyGeneration==='SERVER_RANDOM_SINGLE_KEY','PUBLIC_TESTNET_ACCOUNT');
 need(account.chain===({'ethereum-sepolia':'ethereum','bitcoin-testnet':'bitcoin','solana-devnet':'solana'})[account.networkId],'PUBLIC_TESTNET_ACCOUNT');
 return account;
}
