import {normalizeDeviceSepoliaDefiReviewV4} from '@lianum/mobile-protocol/device/sepolia-defi-review-v4';

// Reviews allow a u128 input maximum. The note amount formatter is u64,
// so formatting a normalized review must retain its wider exact amount.
export function formatDeviceSepoliaDefiAtomicV7(amount,decimals) {
  if(typeof amount!=='string'||!/^(0|[1-9][0-9]{0,38})$/.test(amount)||BigInt(amount)>=1n<<128n||!Number.isSafeInteger(decimals)||decimals<0||decimals>36)throw Error('MOBILE_SEPOLIA_DEFI_AMOUNT');
  if(decimals===0)return amount;
  const digits=amount.padStart(decimals+1,'0');
  const fraction=digits.slice(-decimals).replace(/0+$/,'');
  return digits.slice(0,-decimals)+(fraction?'.'+fraction:'');
}

/** Display only. The signed review remains the sole source of amounts,
 * destinations and deadlines; a proof is never described as an investment. */
export function presentDeviceSepoliaDefiReviewV7(raw, now = Date.now()) {
  const review = normalizeDeviceSepoliaDefiReviewV4(raw);
  if (!Number.isSafeInteger(now) || now < 0) throw Error('MOBILE_SEPOLIA_DEFI_REVIEW_TIME');
  const protocol = review.protocol === 'AAVE_STATIC' ? 'Aave' : 'Morpho';
  const investing = review.action === 'INVEST';
  const shares = formatDeviceSepoliaDefiAtomicV7(review.shares, review.descriptor.assetMetadata.decimals)
    + ' ' + review.descriptor.assetMetadata.symbol;
  const start = BigInt(review.validFrom) * 1000n, end = BigInt(review.validUntil) * 1000n;
  const live = start <= BigInt(now) && BigInt(now) < end;
  return Object.freeze({
    protocol,
    title: investing ? "Review investment in " + protocol : "Review withdrawal of " + protocol,
    confirmLabel: investing ? "Confirm investment" : "Confirm withdrawal",
    shares,
    amountLabel: investing ? "Maximum to be used" : "Minimum you will receive",
    amount: formatDeviceSepoliaDefiAtomicV7(investing ? review.maximumInputAtomic : review.minimumAssetsAtomic, 6) + ' USDC',
    destinationLabel: investing ? "Private shares" : "Address receiving USDC",
    destination: investing ? "They will be received in your wallet, in the custody of this device." : review.underlyingReceiver,
    detail: investing
      ? "The investment is confirmed when the network accepts the deposit and the received shares can be verified."
      : "These shares will be redeemed and USDC sent to the reviewed address. The transfer is visible on the public network.",
    validFrom: review.validFrom,
    validUntil: review.validUntil,
    live,
    timeNotice: live ? "The authorization includes the amounts, destination and time limit."
      : BigInt(now) < start ? "The window of this operation hasn't started yet." : "This proposal has expired. Refresh it before authorizing.",
  });
}
