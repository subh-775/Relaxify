package com.musicplayer

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.media.AudioManager
import android.util.Log
import android.view.KeyEvent
import android.widget.RemoteViews
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * The home-screen widget: the song that is playing, its cover, and previous,
 * play/pause and next, on a card tinted with the song's colour.
 *
 * The app pushes every change through [push] (WidgetModule, called from
 * player.ts on each track and play-state change); the widget never polls.
 * The last state is kept in SharedPreferences and the cover in a file, so a
 * widget added later, or redrawn after the launcher restarts, is never blank.
 *
 * The buttons send media keys through AudioManager, which Android hands to the
 * active media session: Track Player's, the same one the lock screen drives.
 * When the app is not running there is no session to hand them to, so a press
 * opens the app instead of doing nothing.
 */
class NowPlayingWidget : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        render(context, manager, ids)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        val code = when (intent.action) {
            ACTION_PLAY -> KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
            ACTION_NEXT -> KeyEvent.KEYCODE_MEDIA_NEXT
            ACTION_PREV -> KeyEvent.KEYCODE_MEDIA_PREVIOUS
            else -> return
        }
        if (!alive) {
            openApp(context)
            return
        }
        try {
            val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            am.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, code))
            am.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, code))
        } catch (e: Exception) {
            Log.w(TAG, "media key not sent: ${e.message}")
            openApp(context)
        }
    }

    companion object {
        private const val TAG = "NowPlayingWidget"
        private const val PREFS = "now_playing_widget"
        private const val ACTION_PLAY = "com.musicplayer.widget.PLAY_PAUSE"
        private const val ACTION_NEXT = "com.musicplayer.widget.NEXT"
        private const val ACTION_PREV = "com.musicplayer.widget.PREV"
        private const val COVER_PX = 256

        /** True once the app has pushed a state in THIS process: a widget
         *  press after the process was killed finds it false and opens the app. */
        @Volatile
        var alive = false

        private val io = Executors.newSingleThreadExecutor()

        /** New state from the app. Cheap to call often; only a new cover URL
         *  triggers a download. */
        fun push(
            context: Context,
            title: String,
            artist: String,
            artwork: String?,
            playing: Boolean,
            tint: Int,
        ) {
            alive = true
            val app = context.applicationContext
            val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val newCover = (artwork ?: "") != prefs.getString("artwork", "")
            prefs.edit()
                .putString("title", title)
                .putString("artist", artist)
                .putString("artwork", artwork ?: "")
                .putBoolean("playing", playing)
                .putInt("tint", tint)
                .apply()
            if (newCover) {
                io.execute {
                    saveCover(app, artwork)
                    renderAll(app)
                }
            } else {
                renderAll(app)
            }
        }

        private fun renderAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, NowPlayingWidget::class.java))
            if (ids.isNotEmpty()) render(context, manager, ids)
        }

        private fun render(context: Context, manager: AppWidgetManager, ids: IntArray) {
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val views = RemoteViews(context.packageName, R.layout.widget_now_playing)
            val title = prefs.getString("title", "").orEmpty()
            if (title.isNotEmpty()) {
                views.setTextViewText(R.id.widget_title, title)
                views.setTextViewText(R.id.widget_artist, prefs.getString("artist", "").orEmpty())
            }
            views.setImageViewResource(
                R.id.widget_play,
                if (prefs.getBoolean("playing", false)) R.drawable.ic_widget_pause
                else R.drawable.ic_widget_play,
            )
            views.setInt(R.id.widget_bg, "setColorFilter", prefs.getInt("tint", DEFAULT_TINT))
            coverFile(context).takeIf { it.exists() }?.let { f ->
                BitmapFactory.decodeFile(f.path)?.let { views.setImageViewBitmap(R.id.widget_cover, it) }
            }
            views.setOnClickPendingIntent(R.id.widget_play, action(context, ACTION_PLAY, 1))
            views.setOnClickPendingIntent(R.id.widget_next, action(context, ACTION_NEXT, 2))
            views.setOnClickPendingIntent(R.id.widget_prev, action(context, ACTION_PREV, 3))
            launchIntent(context)?.let { views.setOnClickPendingIntent(R.id.widget_root, it) }
            ids.forEach { manager.updateAppWidget(it, views) }
        }

        private const val DEFAULT_TINT = 0xFF1A1A1F.toInt()

        private fun action(context: Context, name: String, code: Int): PendingIntent =
            PendingIntent.getBroadcast(
                context,
                code,
                Intent(context, NowPlayingWidget::class.java).setAction(name),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

        private fun launchIntent(context: Context): PendingIntent? {
            val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
                ?: return null
            return PendingIntent.getActivity(
                context,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }

        private fun openApp(context: Context) {
            context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
                it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                try {
                    context.startActivity(it)
                } catch (e: Exception) {
                    Log.w(TAG, "could not open the app: ${e.message}")
                }
            }
        }

        private fun coverFile(context: Context) = File(context.filesDir, "widget_cover.png")

        /** Download (or read) the cover, round its corners, keep it as a file. */
        private fun saveCover(context: Context, artwork: String?) {
            val file = coverFile(context)
            try {
                val raw: Bitmap? = when {
                    artwork.isNullOrEmpty() -> null
                    artwork.startsWith("http") -> {
                        val conn = URL(artwork).openConnection() as HttpURLConnection
                        conn.connectTimeout = 6000
                        conn.readTimeout = 8000
                        try {
                            conn.inputStream.use { BitmapFactory.decodeStream(it) }
                        } finally {
                            conn.disconnect()
                        }
                    }
                    else -> BitmapFactory.decodeFile(artwork.removePrefix("file://"))
                }
                if (raw == null) {
                    file.delete()
                    return
                }
                val scaled = Bitmap.createScaledBitmap(raw, COVER_PX, COVER_PX, true)
                val out = Bitmap.createBitmap(COVER_PX, COVER_PX, Bitmap.Config.ARGB_8888)
                val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    shader = BitmapShader(scaled, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
                }
                val r = COVER_PX * 0.1f
                Canvas(out).drawRoundRect(RectF(0f, 0f, COVER_PX.toFloat(), COVER_PX.toFloat()), r, r, paint)
                file.outputStream().use { out.compress(Bitmap.CompressFormat.PNG, 100, it) }
            } catch (e: Exception) {
                Log.w(TAG, "cover not saved: ${e.message}")
                file.delete()
            }
        }
    }
}
