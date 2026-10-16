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
    title: investing ? 'Revisar inversión en ' + protocol : 'Revisar retirada de ' + protocol,
    confirmLabel: investing ? 'Confirmar inversión' : 'Confirmar retirada',
    shares,
    amountLabel: investing ? 'Máximo que se utilizará' : 'Mínimo que recibirás',
    amount: formatDeviceSepoliaDefiAtomicV7(investing ? review.maximumInputAtomic : review.minimumAssetsAtomic, 6) + ' USDC',
    destinationLabel: investing ? 'Participaciones privadas' : 'Dirección que recibirá USDC',
    destination: investing ? 'Se recibirán en tu wallet, bajo la custodia de este dispositivo.' : review.underlyingReceiver,
    detail: investing
      ? 'La operación se confirmará cuando la red acepte el ingreso y puedas consultar las participaciones recibidas.'
      : 'Se retirarán estas participaciones y se enviará USDC a la dirección revisada. El envío público es visible en la red.',
    validFrom: review.validFrom,
    validUntil: review.validUntil,
    live,
    timeNotice: live ? 'La autorización incluye los importes, el destino y este plazo.'
      : BigInt(now) < start ? 'La ventana de esta operación todavía no ha empezado.' : 'Esta propuesta ha caducado. Actualiza antes de autorizar.',
  });
}
