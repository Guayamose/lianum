// @ts-check
/** Error contract shared by public observation codecs and adapters.
 * No adapter registration, network access, credentials or authority live here. */
export class ObservationError extends Error {
  /** @param {string} code @param {string} [status] */
  constructor(code, status = 'unknown') {
    super(code);
    this.code = code;
    this.status = status;
  }
}

/** @param {unknown} condition @param {string} [code] @param {string} [status]
 * @returns {asserts condition} */
export function need(condition, code = 'MALFORMED_RESPONSE', status = 'unknown') {
  if (!condition) throw new ObservationError(code, status);
}
