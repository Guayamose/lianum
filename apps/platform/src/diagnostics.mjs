/** Operational metadata only. No caller payload, exception, identity or path is
 * accepted. Counts are bounded-cardinality; stderr events are rate limited. */
const EVENTS = Object.freeze({
  SERVICE_STARTED: 'bootstrap', SERVICE_STOPPED: 'bootstrap',
  SERVICE_START_FAILED: 'bootstrap', SERVICE_CLOSE_FAILED: 'bootstrap',
  SQL_IDLE_CONNECTION_ERROR: 'sql', SQL_ACTIVE_CONNECTION_ERROR: 'sql',
  SQL_READY_FAILED: 'sql', SQL_OPERATION_FAILED: 'sql', SQL_FINALIZE_FAILED: 'sql',
  ADAPTER_FAILED: 'adapter', ADAPTER_TIMEOUT: 'adapter',
  ORIGINAL_GATEWAY_READY_FAILED: 'gateway', ORIGINAL_TRANSPORT_FAILED: 'worker-transport',
});

export function createPlatformDiagnostics({ write = () => {}, now = Date.now, limit = 60 } = {}) {
  if (typeof write !== 'function' || typeof now !== 'function' || !Number.isInteger(limit) || limit < 1 || limit > 600)
    throw Error('PLATFORM_DIAGNOSTICS_CONFIGURATION');
  const counts = Object.fromEntries(Object.keys(EVENTS).map(code => [code, 0]));
  let minute = -1, written = 0, dropped = 0;
  return Object.freeze({
    emit(code) {
      // Reject extra fields even when an accidental caller passes an Error.
      if (arguments.length !== 1 || typeof code !== 'string' || !Object.hasOwn(EVENTS, code)) return false;
      counts[code] = Math.min(Number.MAX_SAFE_INTEGER, counts[code] + 1);
      const current = Math.floor(now() / 60_000);
      if (current !== minute) { minute = current; written = 0; }
      if (written >= limit) { dropped = Math.min(Number.MAX_SAFE_INTEGER, dropped + 1); return false; }
      written++;
      try { write(JSON.stringify({ version: 1, service: 'lianum-platform', component: EVENTS[code], code,
        minute, count: counts[code] }) + '\n'); return true; }
      catch { return false; } // Telemetry can never change an economic outcome.
    },
    snapshot() { return Object.freeze({ counts: Object.freeze({ ...counts }), dropped }); },
  });
}

let diagnostic = createPlatformDiagnostics();
let outputFailed = false, enabled = false;
export function enablePlatformDiagnostics() {
  if (arguments.length !== 0) throw Error('PLATFORM_DIAGNOSTICS_CONFIGURATION');
  if (!enabled) {
    enabled = true;
    process.stderr.on('error', () => { outputFailed = true; });
  }
  diagnostic = createPlatformDiagnostics({ write: value => {
    // Backpressure drops telemetry instead of buffering without bound.
    if (!outputFailed && process.stderr.writableLength < 16_384 && !process.stderr.destroyed) process.stderr.write(value);
  } });
}
export function platformDiagnostic(code) {
  return arguments.length === 1 && diagnostic.emit(code);
}
export function platformDiagnosticSnapshot() { return diagnostic.snapshot(); }
