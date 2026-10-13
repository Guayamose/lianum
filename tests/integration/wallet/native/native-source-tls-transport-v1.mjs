/** Exact SOURCE TLS transport shared by the financial driver and its HOST
 * regressions. Construction starts no runtime, proof or network operation. */
import assert from 'node:assert/strict';
import { request as httpsRequest } from 'node:https';
/** @typedef {{posts:Record<string,number>,tlsVersion:string|null}} TransportEvidence
 * @typedef {{method:string,headers:Record<string,string>,body?:string,signal?:AbortSignal}} Options */
/** @param {{active():void,origin:string,certificate:string,transport:TransportEvidence,request?:typeof httpsRequest}} ports */
export function createNativeSourceTlsTransportV1(ports) {
    const { active, origin, certificate, transport } = ports;
    const requestOriginal = ports.request ?? httpsRequest;
    /** @param {string|URL} target @param {Options} options @returns {Promise<Response>} */
    return async (target, options) => {
        active();
        const url = new URL(target);
        assert.equal(url.origin, origin);
        assert.ok(url.pathname.startsWith('/v1/mobile/') || url.pathname.startsWith('/v2/mobile/'));
        assert.equal(url.search, '');
        assert.equal(url.hash, '');
        /** @type {import('node:http').OutgoingHttpHeaders} */ const headers = { ...options.headers };
        if (options.body !== undefined)
            headers['Content-Length'] = Buffer.byteLength(options.body, 'utf8');
        return new Promise((resolveDone, rejectDone) => {
            const request = requestOriginal(url, { method: options.method, headers, ca: certificate, family: 4, agent: false, minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3' }, response => {
                transport.tlsVersion = /** @type {import('node:tls').TLSSocket} */ (response.socket).getProtocol();
                /** @type {Buffer[]} */
                const chunks = [];
                let size = 0;
                response.on('data', chunk => { size += chunk.length; if (size > 1048576) {
                    response.destroy(Error('NATIVE_SOURCE_TLS_RESPONSE_BOUND'));
                    return;
                } chunks.push(chunk); });
                response.once('error', rejectDone);
                response.once('end', () => { const r = new Response(Buffer.concat(chunks), { status: response.statusCode, headers: /** @type {Record<string,string>} */ (response.headers) }); Object.defineProperty(r, 'url', { value: url.href }); resolveDone(r); });
            });
            const abort = () => request.destroy(Error('NATIVE_SOURCE_TLS_ABORTED'));
            options.signal?.addEventListener('abort', abort, { once: true });
            request.once('close', () => options.signal?.removeEventListener('abort', abort));
            request.once('error', rejectDone);
            if (options.method === 'POST')
                transport.posts[url.pathname] = (transport.posts[url.pathname] ?? 0) + 1;
            request.end(options.body);
        });
    };
}
