package org.lianum.wallet.pagedtls

import android.content.ClipboardManager
import android.content.Context
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactMethod
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.EOFException
import java.io.InterruptedIOException
import java.net.SocketException
import java.net.SocketTimeoutException
import java.net.URI
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.security.KeyStore
import java.security.MessageDigest
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLException
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager
import okhttp3.Call
import okhttp3.Callback
import okhttp3.ConnectionPool
import okhttp3.ConnectionSpec
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.TlsVersion
import org.json.JSONObject

/** No keys, signing, arbitrary URLs, RPC, global trust changes or persistence. */
class PagedPinnedTlsModule(context: ReactApplicationContext) : NativeLianumPagedPinnedTlsSpec(context), LifecycleEventListener {
  private data class Session(val group: String, val origin: String, val deadline: Long, val client: OkHttpClient, val routes: Map<String, Int>, val replyLimit: Int, val pairingId: String) {
    val closed = AtomicBoolean(false)
    val active = AtomicReference<Pair<String, Call>?>(null)
    val cancelledRequest = AtomicReference<String?>(null)
    var expiry: ScheduledFuture<*>? = null
  }
  private val sessions = ConcurrentHashMap<String, Session>()
  private val expiryTimer = Executors.newSingleThreadScheduledExecutor()
  private val limit = 4 * 1024 * 1024
  private fun routeLimits(group: String): Map<String, Int> = when (group) {
    "PAGED" -> listOf("/v1/mobile/paged-owner/challenges", "/v1/mobile/paged-owner/operations", "/v1/mobile/paged-owner/graph/pairing", "/v1/mobile/paged-owner/graph/challenges", "/v1/mobile/paged-owner/graph/operations").associateWith { limit }
    "PAGED_SOURCE_RENEWAL_V4" -> listOf("/v1/mobile/paged-owner/source-renewal/challenges", "/v1/mobile/paged-owner/source-renewal/renewals").associateWith { 8192 }
    "POSITIONS" -> listOf("/v1/mobile/defi-positions/challenges", "/v1/mobile/defi-positions/reviews", "/v1/mobile/defi-positions/observations").associateWith { 8192 }
    "SEPOLIA_DEFI_V7" -> listOf("challenges", "defi-proposals", "defi-reviews", "defi-read-review", "defi-authorizations", "reviews", "private-operations", "operations", "status", "financial-submit", "financial-observe", "withdrawal-review", "withdrawal-arm", "redeem-submit").associate { "/v1/mobile/sepolia-defi-shares/$it" to if (it == "private-operations") 16384 else 8192 }
    "EXTERNAL_FLAT" -> buildMap {
      for (family in listOf("external-flat", "external-flat-share")) for (route in listOf("challenges", "reviews", "operations", "private-operations", "status")) put("/v1/mobile/$family/$route", if (route == "private-operations") 16384 else 8192)
      for (route in listOf("challenges", "preparations", "reviews", "operations", "private-operations", "status", "output-quotes", "output-reviews", "output-operations", "private-output-operations")) put("/v1/mobile/external-flat/source-graph/$route", 65536)
      for (relationship in listOf("morpho-blue", "aave-static", "metamorpho")) for (route in listOf("challenges", "reviews", "operations", "status")) put("/v1/mobile/external-flat/$relationship/$route", 8192)
    }
    else -> error("GROUP")
  }
  init { context.addLifecycleEventListener(this) }
  override fun getName() = "LianumPagedPinnedTls"
  private fun deny(promise: Promise, code: String) = promise.reject(code, code)
  private enum class FailureStage { REQUEST, TRANSPORT, REPLY }
  private enum class FailureCode { CANCELLED, TIMEOUT, SOCKET_FAILURE, TLS, OTHER_IO, INVALID_REQUEST, INVALID_REPLY }
  private fun retainFailure(stage: FailureStage, code: FailureCode) {
    Log.w("LIANUM_PAGED_TLS_FAILURE", "stage=${stage.name} code=${code.name}")
  }
  private fun transportFailure(call: Call, error: IOException): FailureCode =
    if (call.isCanceled()) FailureCode.CANCELLED else when (error) {
      is SocketTimeoutException -> FailureCode.TIMEOUT
      is InterruptedIOException -> FailureCode.TIMEOUT
      is SSLException -> FailureCode.TLS
      is SocketException, is EOFException -> FailureCode.SOCKET_FAILURE
      else -> FailureCode.OTHER_IO
    }
  private fun live(session: Session) = !session.closed.get() && System.currentTimeMillis() < session.deadline
  private fun closeSession(id: String) {
    val session = sessions.remove(id) ?: return
    session.closed.set(true)
    session.expiry?.cancel(false)
    session.active.getAndSet(null)?.second?.cancel()
    session.client.dispatcher.cancelAll()
    session.client.connectionPool.evictAll()
    session.client.dispatcher.executorService.shutdown()
  }

  @ReactMethod @Synchronized
  override fun open(group: String, origin: String, certificatePEM: String, certificateSHA256: String, deadlineMs: Double, pairingId: String, promise: Promise) {
    try {
      require(sessions.isEmpty() && certificatePEM.length <= 32768)
      require(if (group == "PAGED" || group == "PAGED_SOURCE_RENEWAL_V4") pairingId.matches(Regex("[a-z0-9-]{8,100}")) else if (group == "SEPOLIA_DEFI_V7") pairingId.matches(Regex("[0-9a-f]{64}")) else pairingId.isEmpty())
      val uri = URI(origin)
      require(uri.scheme == "https" && uri.host != null && (uri.port == -1 || uri.port in 1..65535) && uri.rawPath.isNullOrEmpty() && uri.rawQuery == null && uri.rawFragment == null && uri.rawUserInfo == null)
      require(certificateSHA256.matches(Regex("[a-f0-9]{64}")))
      val now = System.currentTimeMillis()
      require(deadlineMs.isFinite() && deadlineMs == deadlineMs.toLong().toDouble())
      val deadline = deadlineMs.toLong()
      require(deadline > now && deadline - now <= if (group == "PAGED_SOURCE_RENEWAL_V4") 60000L else 9L * 60 * 60 * 1000)
      val certificates = CertificateFactory.getInstance("X.509").generateCertificates(ByteArrayInputStream(certificatePEM.toByteArray(Charsets.UTF_8)))
      require(certificates.size == 1)
      val certificate = certificates.single() as X509Certificate
      certificate.checkValidity()
      require(certificate.basicConstraints == -1)
      val expected = ByteArray(32) { certificateSHA256.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
      require(MessageDigest.isEqual(expected, MessageDigest.getInstance("SHA-256").digest(certificate.encoded)))
      val store = KeyStore.getInstance(KeyStore.getDefaultType()).apply { load(null); setCertificateEntry("exact-paged-leaf", certificate) }
      val factory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply { init(store) }
      val original = factory.trustManagers.filterIsInstance<X509TrustManager>().single()
      val pinned = object : X509TrustManager {
        override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf(certificate)
        override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) = throw java.security.cert.CertificateException("PAGED_TLS_CLIENT_CERTIFICATE_UNSUPPORTED")
        override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
          require(chain.isNotEmpty() && MessageDigest.isEqual(expected, MessageDigest.getInstance("SHA-256").digest(chain[0].encoded)))
          certificate.checkValidity()
          original.checkServerTrusted(chain, authType)
        }
      }
      val ssl = SSLContext.getInstance("TLSv1.3").apply { init(null, arrayOf(pinned), null) }
      val client = OkHttpClient.Builder()
        .sslSocketFactory(ssl.socketFactory, pinned)
        // Each own POST uses a fresh socket; no stale idle connection is retried.
        .connectionPool(ConnectionPool(0, 1, TimeUnit.MILLISECONDS))
        // OkHttp's original hostname verifier still checks the exact origin.
        .connectionSpecs(listOf(ConnectionSpec.Builder(ConnectionSpec.MODERN_TLS).tlsVersions(TlsVersion.TLS_1_3).build()))
        .followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false)
        .connectTimeout(15, TimeUnit.SECONDS).writeTimeout(15, TimeUnit.SECONDS)
        .readTimeout(900, TimeUnit.SECONDS).callTimeout(900, TimeUnit.SECONDS).build()
      val id = UUID.randomUUID().toString()
      val session = Session(group, origin, minOf(deadline, certificate.notAfter.time), client, routeLimits(group), if (group == "PAGED") limit else 65536, pairingId)
      require(live(session))
      sessions[id] = session
      session.expiry = expiryTimer.schedule({ closeSession(id) }, session.deadline - now, TimeUnit.MILLISECONDS)
      promise.resolve(id)
    } catch (_: Exception) { deny(promise, "MOBILE_PAGED_TLS_PROFILE") }
  }

  @ReactMethod
  override fun post(sessionId: String, requestId: String, path: String, body: String, promise: Promise) {
    var session: Session? = null
    var active: Pair<String, Call>? = null
    var payload: ByteArray? = null
    try {
      session = sessions[sessionId] ?: error("CLOSED")
      require(live(session) && path in session.routes && requestId.matches(Regex("request-[1-9][0-9]{0,8}")))
      require(session.cancelledRequest.getAndSet(null) != requestId)
      val bytes = body.toByteArray(Charsets.UTF_8)
      payload = bytes
      require(bytes.size <= session.routes.getValue(path))
      val request = Request.Builder().url(session.origin + path)
        .header("Content-Type", "application/json").header("Accept", "application/json")
        .header("Connection", "close")
        .header("Cache-Control", "no-store").apply {
          if (session.group == "PAGED" || session.group == "PAGED_SOURCE_RENEWAL_V4") header("x-lianum-paged-pairing-id", session.pairingId) else header("Origin", session.origin)
          if (session.group == "SEPOLIA_DEFI_V7") {
            header("x-lianum-defi-pairing-id", session.pairingId)
            if (path == "/v1/mobile/sepolia-defi-shares/reviews") {
              val reference = JSONObject(body).getString("reference")
              require(reference.matches(Regex("[0-9a-f]{64}")))
              header("x-lianum-defi-review-reference", reference)
            }
          }
        }
        .post(bytes.toRequestBody("application/json".toMediaType())).build()
      val call = session.client.newCall(request)
      active = Pair(requestId, call)
      require(session.active.compareAndSet(null, active))
      require(live(session) && session.cancelledRequest.get() != requestId)
      val ownSession = session
      val ownActive = active
      call.enqueue(object : Callback {
        override fun onFailure(call: Call, error: IOException) {
          bytes.fill(0)
          ownSession.active.compareAndSet(ownActive, null)
          retainFailure(FailureStage.TRANSPORT, transportFailure(call, error))
          deny(promise, if (call.isCanceled()) "MOBILE_PAGED_TLS_CANCELLED" else "MOBILE_PAGED_TLS_UNAVAILABLE")
        }
        override fun onResponse(call: Call, response: Response) {
          val buffer = ByteArray(16384)
          var received: ByteArray? = null
          try {
            val result = response.use {
              require(live(ownSession) && !call.isCanceled() && response.handshake?.tlsVersion == TlsVersion.TLS_1_3)
              val source = response.body ?: error("BODY")
              require(source.contentLength() <= ownSession.replyLimit)
              val output = ByteArrayOutputStream()
              source.byteStream().use { input ->
                while (true) {
                  val count = input.read(buffer)
                  if (count < 0) break
                  require(live(ownSession) && !call.isCanceled() && output.size() + count <= ownSession.replyLimit)
                  output.write(buffer, 0, count)
                }
              }
              received = output.toByteArray()
              val text = Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(received!!)).toString()
              val result = Arguments.createMap().apply { putInt("status", response.code); putString("body", text); putString("contentType", response.header("Content-Type")); putString("contentLength", response.header("Content-Length")) }
              require(live(ownSession) && !call.isCanceled())
              result
            }
            ownSession.active.compareAndSet(ownActive, null)
            promise.resolve(result)
          } catch (_: Exception) {
            retainFailure(FailureStage.REPLY, FailureCode.INVALID_REPLY)
            deny(promise, if (call.isCanceled()) "MOBILE_PAGED_TLS_CANCELLED" else "MOBILE_PAGED_TLS_UNAVAILABLE")
          }
          finally { bytes.fill(0); buffer.fill(0); received?.fill(0); ownSession.active.compareAndSet(ownActive, null) }
        }
      })
    } catch (_: Exception) {
      payload?.fill(0)
      if (active != null) { active.second.cancel(); session?.active?.compareAndSet(active, null) }
      retainFailure(FailureStage.REQUEST, FailureCode.INVALID_REQUEST)
      deny(promise, "MOBILE_PAGED_TLS_REQUEST")
    }
  }

  @ReactMethod override fun cancel(sessionId: String, requestId: String) {
    if (!requestId.matches(Regex("request-[1-9][0-9]{0,8}"))) return
    sessions[sessionId]?.let { session -> session.cancelledRequest.set(requestId); session.active.get()?.let { if (it.first == requestId) it.second.cancel() } }
  }
  @ReactMethod override fun close(sessionId: String, promise: Promise) { closeSession(sessionId); promise.resolve(null) }
  @ReactMethod override fun readConnectionProfile(group: String, promise: Promise) {
    try {
      require(reactApplicationContext.currentActivity?.hasWindowFocus() == true)
      val clipboard = reactApplicationContext.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      val text = clipboard.primaryClip?.getItemAt(0)?.text?.toString() ?: error("EMPTY")
      require(text.length <= 65536 && text.count { it == '{' || it == '[' } <= 128)
      val format = when (group) { "PAGED" -> "DEVICE_PAGED_PRIVATE_GRAPH_CONNECTION_V3"; "EXTERNAL_FLAT" -> "DEVICE_EXTERNAL_FLAT_CONNECTION_V1"; "POSITIONS" -> "DEVICE_DEFI_POSITIONS_CONNECTION_V1"; "SEPOLIA_DEFI_V7" -> "DEVICE_SEPOLIA_DEFI_SHARES_CONNECTION_V7"; else -> error("GROUP") }
      require(JSONObject(text).getString("format") == format)
      promise.resolve(text)
    } catch (_: Exception) { deny(promise, "MOBILE_PAGED_TLS_CLIPBOARD") }
  }
  override fun onHostResume() {}
  override fun onHostPause() {} // JS closes on background; biometric dialogs may temporarily pause the host.
  override fun onHostDestroy() { sessions.keys.toList().forEach(::closeSession) }
  override fun invalidate() { onHostDestroy(); expiryTimer.shutdownNow(); reactApplicationContext.removeLifecycleEventListener(this); super.invalidate() }
}
