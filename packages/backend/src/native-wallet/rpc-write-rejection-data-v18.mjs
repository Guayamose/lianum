/** Bounded diagnostic categories only; never retain the provider's text/wire. */
const categories=[
 ['ALREADY_KNOWN',/already known|known transaction/i],
 ['REPLACEMENT_UNDERPRICED',/replacement.*underpriced|replacement.*fee too low/i],
 ['NONCE_TOO_LOW',/nonce too low|nonce has already been used/i],
 ['INSUFFICIENT_FUNDS',/insufficient funds/i],
 ['FEE_TOO_LOW',/transaction underpriced|fee cap.*(less|low)|max fee per gas.*(less|low)/i],
 ['RATE_LIMITED',/rate limit|too many requests/i],
 ['METHOD_UNSUPPORTED',/method.*not (found|supported|available)|unsupported method/i],
];
export function classifyNativeRpcWriteRejectionV18(error){
 if(!error||!Number.isInteger(error.code)||typeof error.message!=='string'||error.message.length>512)return null;
 return categories.find(([,pattern])=>pattern.test(error.message))?.[0]??null;
}
