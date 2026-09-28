package com.musicplayer

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import java.util.Calendar

/**
 * The weekly "your week in music" notification, Sunday at 7 pm.
 *
 * The app keeps the words up to date as the week goes (DeviceModule), so the
 * notification can be posted with the app closed. A one-hour window rather
 * than an exact time, so no exact-alarm permission is needed. Each firing
 * schedules the next, and every app start schedules again, which also covers
 * a reboot. Tapping it opens the app on relaxify://recap, which App.tsx turns
 * into the Recap.
 */
object RecapReminder {
    private const val PREFS = "recap_reminder"
    private const val CHANNEL = "recap"
    private const val ID = 7401

    fun save(ctx: Context, enabled: Boolean, title: String, body: String) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean("enabled", enabled)
            .putString("title", title)
            .putString("body", body)
            .apply()
    }

    private fun alarm(ctx: Context): PendingIntent = PendingIntent.getBroadcast(
        ctx,
        ID,
        Intent(ctx, RecapReminderReceiver::class.java),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    /** The next Sunday 19:00 after now, in the phone's own time zone. */
    private fun nextSunday(now: Long = System.currentTimeMillis()): Long {
        val c = Calendar.getInstance().apply {
            timeInMillis = now
            set(Calendar.DAY_OF_WEEK, Calendar.SUNDAY)
            set(Calendar.HOUR_OF_DAY, 19)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        while (c.timeInMillis <= now) c.add(Calendar.DAY_OF_YEAR, 7)
        return c.timeInMillis
    }

    fun schedule(ctx: Context) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pi = alarm(ctx)
        am.cancel(pi)
        val on = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("enabled", true)
        if (on) {
            am.setWindow(AlarmManager.RTC_WAKEUP, nextSunday(), 60 * 60 * 1000L, pi)
        }
    }

    fun post(ctx: Context) {
        val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val body = prefs.getString("body", "").orEmpty()
        if (!prefs.getBoolean("enabled", true) || body.isEmpty()) return
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, "Weekly Recap", NotificationManager.IMPORTANCE_DEFAULT),
        )
        val open = Intent(ctx, MainActivity::class.java)
            .setAction(Intent.ACTION_VIEW)
            .setData(Uri.parse("relaxify://recap"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val content = PendingIntent.getActivity(
            ctx, ID, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val n = Notification.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_recap)
            .setContentTitle(prefs.getString("title", null) ?: "Your week in music")
            .setContentText(body)
            .setContentIntent(content)
            .setAutoCancel(true)
            .build()
        try {
            nm.notify(ID, n)
        } catch (e: SecurityException) {
            Log.w("RecapReminder", "notifications not allowed: ${e.message}")
        }
    }
}

class RecapReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        RecapReminder.post(context)
        RecapReminder.schedule(context)
    }
}
