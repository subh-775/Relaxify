package com.musicplayer

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.provider.MediaStore
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Two small things the app asks Android for:
 *
 *  - whether the phone is on mobile data (the data saver) or on no network at
 *    all (src/offline.ts), watched with a network callback so a change is
 *    heard at once;
 *  - the music already on the phone (src/localMusic.ts);
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

    private fun emit(value: Boolean, event: String = "mp.network") {
        if (!ctx.hasActiveReactInstance()) return
        try {
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(event, value)
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
                    override fun onAvailable(n: Network) {
                        emit(true, "mp.online")
                    }

                    // The default network's own capabilities: activeNetwork can
                    // still name the old one while this runs.
                    override fun onCapabilitiesChanged(n: Network, caps: NetworkCapabilities) {
                        emit(cellular(caps))
                    }

                    override fun onLost(n: Network) {
                        emit(cellular(cm))
                        // Only called with no default network left: a handover
                        // is onAvailable for the new one.
                        emit(false, "mp.online")
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

    /** Whether the phone has any network at all right now. */
    @ReactMethod
    fun hasNetwork(promise: Promise) {
        val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        promise.resolve(cm.activeNetwork != null)
    }

    /** Every song in Android's media library. Empty without the permission. */
    @ReactMethod
    fun localMusic(promise: Promise) {
        Thread {
            val songs = Arguments.createArray()
            try {
                ctx.contentResolver.query(
                    MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                    arrayOf(
                        MediaStore.Audio.Media.TITLE,
                        MediaStore.Audio.Media.ARTIST,
                        MediaStore.Audio.Media.ALBUM,
                        MediaStore.Audio.Media.ALBUM_ID,
                        MediaStore.Audio.Media.DURATION,
                        MediaStore.Audio.Media.DATA,
                        MediaStore.Audio.Media.SIZE,
                    ),
                    "${MediaStore.Audio.Media.IS_MUSIC} != 0",
                    null,
                    "${MediaStore.Audio.Media.TITLE} COLLATE NOCASE",
                )?.use { c ->
                    while (c.moveToNext()) {
                        val artist = c.getString(1).orEmpty()
                        songs.pushMap(Arguments.createMap().apply {
                            putString("title", c.getString(0).orEmpty())
                            putString("artist", if (artist == "<unknown>") "" else artist)
                            putString("album", c.getString(2).orEmpty())
                            putString("artwork_url", "content://media/external/audio/albumart/${c.getLong(3)}")
                            putDouble("duration_ms", c.getLong(4).toDouble())
                            putString("file_path", c.getString(5).orEmpty())
                            putDouble("file_size", c.getLong(6).toDouble())
                        })
                    }
                }
            } catch (e: Exception) {
                // No permission yet, or a media library that is busy: no songs.
            }
            promise.resolve(songs)
        }.start()
    }

    // RN's NativeEventEmitter wants these two on Android.
    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    /** What Sunday's notification says (its title is picked natively). An
     *  empty body means a quiet week: no notification. */
    @ReactMethod
    fun setRecapReminder(enabled: Boolean, body: String) {
        RecapReminder.save(ctx, enabled, body)
        RecapReminder.schedule(ctx)
    }
}
