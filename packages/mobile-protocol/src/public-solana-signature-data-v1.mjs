/** Canonical public wire ID DATA only; no signature verification or finality. */
export function normalizePublicSolanaSignatureDataV1(value){
 const need=ok=>{if(!ok)throw Error('MOBILE_PUBLIC_SOLANA_SIGNATURE_DATA');};
 const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
 need(typeof value==='string'&&value.length>=64&&value.length<=88);let n=0n;
 for(const ch of value){const digit=alphabet.indexOf(ch);need(digit>=0);n=n*58n+BigInt(digit);need(n<(1n<<512n));}
 let bytes=0;for(let x=n;x>0n;x>>=8n)bytes++;let zeroes=0;while(value[zeroes]==='1')zeroes++;
 need(n>0n&&bytes+zeroes===64);return value;
}
