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
import kotlin.random.Random

/**
 * The weekly Recap notification: Sunday, at a different time each week
 * somewhere between noon and 9 pm, for anyone who allows notifications.
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
    private const val DAY_MS = 24 * 60 * 60 * 1000L
    /** One picked at random each Sunday. */
    private val TITLES = listOf(
        "Get your Recap of the week 🎧",
        "Your Recap just dropped 🔥",
        "Your week, on repeat 🔁",
        "The Recap is in. No skipping 👀",
        "Guess who you played most? 🎶",
    )

    fun save(ctx: Context, enabled: Boolean, body: String) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean("enabled", enabled)
            .putString("body", body)
            .apply()
    }

    private fun alarm(ctx: Context): PendingIntent = PendingIntent.getBroadcast(
        ctx,
        ID,
        Intent(ctx, RecapReminderReceiver::class.java),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    /**
     * When the next one goes out: a random minute of Sunday 12:00-21:00.
     *
     * Kept in prefs, not re-rolled: schedule() runs on every app start, and a
     * re-roll at 2 pm that landed on 1 pm would skip that Sunday. Once it has
     * gone out, the next roll starts a day later, so no Sunday gets two.
     */
    private fun nextAt(ctx: Context, now: Long = System.currentTimeMillis()): Long {
        val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val kept = prefs.getLong("at", 0L)
        if (kept > now) return kept
        val from = if (kept > 0L) maxOf(now, kept + DAY_MS) else now
        val minute = 12 * 60 + Random.nextInt(9 * 60)
        val c = Calendar.getInstance().apply {
            timeInMillis = from
            set(Calendar.DAY_OF_WEEK, Calendar.SUNDAY)
            set(Calendar.HOUR_OF_DAY, minute / 60)
            set(Calendar.MINUTE, minute % 60)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        while (c.timeInMillis <= from) c.add(Calendar.DAY_OF_YEAR, 7)
        prefs.edit().putLong("at", c.timeInMillis).apply()
        return c.timeInMillis
    }

    fun schedule(ctx: Context) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pi = alarm(ctx)
        am.cancel(pi)
        val on = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("enabled", true)
        if (on) {
            am.setWindow(AlarmManager.RTC_WAKEUP, nextAt(ctx), 60 * 60 * 1000L, pi)
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
            .setContentTitle(TITLES.random())
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
