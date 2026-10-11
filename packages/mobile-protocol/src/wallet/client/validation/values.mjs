/** Canonical scalar checks shared by wallet read and action contracts. */


export const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export const copy = value => structuredClone(value);

export const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{8,100}$/.exec(value)?.[0] === value;

export const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.exec(value)?.[0] === value && /[1-9a-f]/.test(value);

export const accountDigest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.exec(value)?.[0] === value;

export const atomic = value => typeof value === 'string' && /^(0|[1-9][0-9]{0,77})$/.exec(value)?.[0] === value
  && BigInt(value) < (1n << 256n) ? value : null;
