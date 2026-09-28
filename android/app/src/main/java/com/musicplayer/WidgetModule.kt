package com.musicplayer

import android.graphics.Color
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** The app's side of the home-screen widget: see src/widget.ts. */
class WidgetModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "Widget"

    /** `tint` is a "#rrggbb" colour for the card; anything unreadable falls
     *  back to the app's dark surface. */
    @ReactMethod
    fun update(title: String, artist: String, artwork: String?, playing: Boolean, tint: String?) {
        val color = try {
            if (tint.isNullOrEmpty()) 0xFF1A1A1F.toInt() else Color.parseColor(tint)
        } catch (e: IllegalArgumentException) {
            0xFF1A1A1F.toInt()
        }
        NowPlayingWidget.push(ctx, title, artist, artwork, playing, color)
    }
}
