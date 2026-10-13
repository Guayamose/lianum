package org.lianum.wallet.pagedtls

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/** Registers the generated TurboModule without legacy interop or global flags. */
class PagedPinnedTlsPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    if (name == NativeLianumPagedPinnedTlsSpec.NAME) PagedPinnedTlsModule(reactContext) else null

  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    mapOf(NativeLianumPagedPinnedTlsSpec.NAME to ReactModuleInfo(
      NativeLianumPagedPinnedTlsSpec.NAME, PagedPinnedTlsModule::class.java.name,
      false, false, false, true
    ))
  }
}
