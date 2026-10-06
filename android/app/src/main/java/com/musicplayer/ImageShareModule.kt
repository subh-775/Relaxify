package com.musicplayer

import android.content.ClipData
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.UIBlock
import com.facebook.react.uimanager.UIManagerModule
import java.io.File
import java.io.FileOutputStream

/**
 * Share a picture of a view: the Recap's last card, with the invite text.
 *
 * React Native's own Share sends text only on Android, and a screenshot
 * library would be a new dependency for one button. This draws the view
 * into a bitmap on the UI thread (a UIBlock, where the view lives), writes it
 * to the cache folder the FileProvider already serves for the updater, and
 * opens the system share sheet with the image and the text together.
 *
 * Named ImageShare, not Share: RN already registers a "ShareModule".
 */
class ImageShareModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName() = "ImageShare"

    @ReactMethod
    fun shareView(tag: Int, text: String, promise: Promise) {
        val ui = ctx.getNativeModule(UIManagerModule::class.java)
            ?: return promise.reject("no_ui", "The screen is not ready")
        ui.addUIBlock(UIBlock { views ->
            try {
                val view = views.resolveView(tag)
                if (view.width <= 0 || view.height <= 0) {
                    promise.reject("no_size", "Nothing to capture yet")
                    return@UIBlock
                }
                val bmp = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
                view.draw(Canvas(bmp))
                val file = File(ctx.cacheDir, "relaxify-recap.png")
                FileOutputStream(file).use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
                bmp.recycle()

                val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.fileprovider", file)
                val send = Intent(Intent.ACTION_SEND).apply {
                    type = "image/png"
                    putExtra(Intent.EXTRA_STREAM, uri)
                    putExtra(Intent.EXTRA_TEXT, text)
                    // The read grant reaches the app picked in the chooser
                    // through ClipData; EXTRA_STREAM alone does not carry it.
                    clipData = ClipData.newRawUri(null, uri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                val chooser = Intent.createChooser(send, null)
                val activity = currentActivity
                if (activity != null) {
                    activity.startActivity(chooser)
                } else {
                    ctx.startActivity(chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("share_failed", e.message ?: "Could not share", e)
            }
        })
    }
}
