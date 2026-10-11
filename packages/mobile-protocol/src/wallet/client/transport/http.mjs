/** HTTP transport only: no wallet state, action policy, persistence or retries. */
export function createWalletRequest(fetchImpl) {
  if (typeof fetchImpl !== 'function') throw new Error('WALLET_FETCH_REQUIRED');
  return async function request(path, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(path, { ...options, cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal });
      const value = await response.json();
      return { ok: response.ok, status: response.status, value };
    }
    finally { clearTimeout(timer); }
  };
}
