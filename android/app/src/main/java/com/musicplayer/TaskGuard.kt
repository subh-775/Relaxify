package com.musicplayer

import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import kotlin.system.exitProcess

/**
 * Stops the music when Relaxify is swiped away, every time.
 *
 * RNTP does this itself from its service's onTaskRemoved (we ask for
 * StopPlaybackAndRemoveNotification in player.ts), and it exits the process.
 * But Android only sends onTaskRemoved to a service that is STARTED. Leave the
 * app paused in the background for a minute and Android stops RNTP's service
 * as idle; it stays alive only because it is bound. Come back and press play,
 * and it plays again as a merely bound service, so the next swipe-away never
 * reaches it and the music carries on with its notification. That was the
 * rare "it kept playing after I closed it".
 *
 * This service does nothing but exist while music plays: player.ts starts it
 * on every Playing (start() is cheap and idempotent), so it is always started
 * when it matters. On a swipe it waits a moment for RNTP to do its own clean
 * stop; if the process is still alive after that, RNTP never heard the swipe,
 * and this ends the process the same way RNTP would have. Pressing Back does
 * not remove the task, so music still plays on after Back.
 */
class TaskGuard : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int =
        START_NOT_STICKY

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        stopSelf()
        Handler(Looper.getMainLooper()).postDelayed({ exitProcess(0) }, GRACE_MS)
    }

    companion object {
        private const val TAG = "TaskGuard"
        /** RNTP's own handler runs right beside ours; this is plenty for it. */
        private const val GRACE_MS = 1000L

        fun start(ctx: Context) {
            try {
                ctx.startService(Intent(ctx, TaskGuard::class.java))
            } catch (e: Exception) {
                // Refused while the app counts as in the background: the
                // playback service may not have gone foreground yet. Once more,
                // after it has.
                Log.w(TAG, "start refused: ${e.message}")
                Handler(Looper.getMainLooper()).postDelayed({
                    try {
                        ctx.startService(Intent(ctx, TaskGuard::class.java))
                    } catch (_: Exception) {}
                }, 2000)
            }
        }
    }
}
