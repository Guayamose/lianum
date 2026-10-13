const assets={ethereum:{symbol:'ETH',decimals:18,name:'Ethereum'},bitcoin:{symbol:'BTC',decimals:8,name:'Bitcoin'},solana:{symbol:'SOL',decimals:9,name:'Solana'}};
const fail=()=>{throw Error('MOBILE_NATIVE_WALLET_REVIEW');};
export function nativeWalletAssetV1(chain){const value=assets[chain];if(!value)fail();return {...value};}
export function nativeWalletAmountAtomicV1(text,decimals){
 if(typeof text!=='string'||!Number.isSafeInteger(decimals)||decimals<0||decimals>18)fail();
 const value=text.trim().replace(',','.');if(!/^(0|[1-9][0-9]{0,39})(\.[0-9]+)?$/.test(value))fail();
 const [whole,fraction='']=value.split('.');if(fraction.length>decimals)fail();
 const atomic=BigInt(whole)*10n**BigInt(decimals)+BigInt(fraction.padEnd(decimals,'0')||'0');if(atomic<=0n)fail();return atomic.toString();
}
export function nativeWalletAmountTextV1(atomic,decimals){
 if(typeof atomic!=='string'||!/^(0|[1-9][0-9]{0,59})$/.test(atomic)||!Number.isSafeInteger(decimals)||decimals<0||decimals>18)fail();
 if(decimals===0)return atomic;const padded=atomic.padStart(decimals+1,'0'),fraction=padded.slice(-decimals).replace(/0+$/,'');return padded.slice(0,-decimals)+(fraction?'.'+fraction:'');
}
export function nativeWalletQuoteReviewV1(quote,account,input,now=Date.now()){
 const asset=nativeWalletAssetV1(account.chain);
 if(!quote||quote.profile!=='NATIVE_WALLET_SEND_QUOTE_V1'||quote.networkId!==account.networkId||quote.network?.id!==account.networkId||quote.network?.chain!==account.chain||quote.network?.network!==account.network||quote.network?.symbol!==asset.symbol||quote.network?.decimals!==asset.decimals||quote.account?.networkId!==account.networkId||quote.account?.path!==account.path||quote.account?.chain!==account.chain||quote.account?.network!==account.network||quote.account?.address!==account.address||quote.account?.publicKey!==account.publicKey||quote.recipient!==input.recipient||quote.amountAtomic!==input.amountAtomic||quote.fee?.assetSymbol!==asset.symbol||!Number.isSafeInteger(quote.issuedAt)||!Number.isSafeInteger(quote.expiresAt)||quote.issuedAt>now||quote.expiresAt<=now||typeof quote.id!=='string'||!quote.id||typeof quote.quoteSHA256!=='string'||!/^[a-f0-9]{64}$/.test(quote.quoteSHA256))fail();
 const amount=nativeWalletAmountTextV1(quote.amountAtomic,asset.decimals),fee=nativeWalletAmountTextV1(quote.fee.maximumAtomic,asset.decimals);
 if(BigInt(quote.amountAtomic)<=0n)fail();return {symbol:asset.symbol,network:asset.name+(account.network==='testnet'?' · red de prueba':' · red principal'),recipient:quote.recipient,amount,maximumFee:fee,maximumTotal:nativeWalletAmountTextV1((BigInt(quote.amountAtomic)+BigInt(quote.fee.maximumAtomic)).toString(),asset.decimals),expiresAt:quote.expiresAt};
}
export function nativeWalletFiatEnabledV1(capabilities,account,flow){
 if(!capabilities?.configured||!capabilities[flow==='BUY'?'buy':'sell'])return false;
 if(capabilities.environment!==(account.network==='mainnet'?'PRODUCTION':'SANDBOX'))return false;
 const asset=nativeWalletAssetV1(account.chain);return capabilities.assets.some(value=>value.asset===asset.symbol&&value.network===account.chain&&value.decimals===asset.decimals);
}
export function nativeWalletGatewayUrlV1(order){
 if(order?.profile!=='LIANUM_MOONPAY_CHECKOUT_V1'||typeof order.checkoutUrl!=='string')fail();
 const url=new URL(order.checkoutUrl),flow=order.flow==='BUY'?'buy':order.flow==='SELL'?'sell':null,expected=flow+(order.environment==='SANDBOX'?'-sandbox':order.environment==='PRODUCTION'?'':'!')+'.moonpay.com';
 if(!flow||url.protocol!=='https:'||url.hostname!==expected||url.port||url.username||url.password||url.hash)fail();return url.href;
}
