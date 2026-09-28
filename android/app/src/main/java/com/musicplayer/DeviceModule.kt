package com.musicplayer

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Two small things the app asks Android for:
 *
 *  - whether the phone is on mobile data (the data saver, src/network.ts),
 *    watched with a network callback so a switch from Wi-Fi is heard at once;
 *  - the weekly Recap notification (src/reminder.ts), kept by RecapReminder.
 */
class DeviceModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "Device"

    private var callback: ConnectivityManager.NetworkCallback? = null

    private fun cellular(caps: NetworkCapabilities?): Boolean =
        caps != null &&
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) &&
            !caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)

    private fun cellular(cm: ConnectivityManager): Boolean =
        cellular(cm.getNetworkCapabilities(cm.activeNetwork))

    private fun emit(value: Boolean) {
        if (!ctx.hasActiveReactInstance()) return
        try {
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("mp.network", value)
        } catch (e: Exception) {
        }
    }

    /** Whether the phone is on mobile data now; also starts reporting changes. */
    @ReactMethod
    fun watchNetwork(promise: Promise) {
        try {
            val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            if (callback == null) {
                val cb = object : ConnectivityManager.NetworkCallback() {
                    // The default network's own capabilities: activeNetwork can
                    // still name the old one while this runs.
                    override fun onCapabilitiesChanged(n: Network, caps: NetworkCapabilities) {
                        emit(cellular(caps))
                    }

                    override fun onLost(n: Network) {
                        emit(cellular(cm))
                    }
                }
                cm.registerDefaultNetworkCallback(cb)
                callback = cb
            }
            promise.resolve(cellular(cm))
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    // RN's NativeEventEmitter wants these two on Android.
    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    /** What Sunday's notification says, and whether it is on. An empty body
     *  means a quiet week: no notification. */
    @ReactMethod
    fun setRecapReminder(enabled: Boolean, title: String, body: String) {
        RecapReminder.save(ctx, enabled, title, body)
        RecapReminder.schedule(ctx)
    }
}
