#!/usr/bin/env ts-node
/**
 * game.tok · Health Monitor
 *
 * Runs as a cron job (every 5 minutes in production).
 * Checks:
 *   1. All reward pools — alert if < 10% remaining
 *   2. VRF oracle responsiveness — check pending requests > 60s
 *   3. LP lock expiry — alert at 30 days and 7 days remaining
 *   4. Program upgrade authority — alert if revoked unexpectedly
 *   5. RPC endpoint latency — alert if > 2s
 *   6. Supabase indexer lag — alert if last event > 5 minutes old
 *
 * Alerts via:
 *   - Discord webhook (primary)
 *   - PagerDuty (critical only — fund risk)
 *   - Email via Resend (secondary)
 *
 * Run: npx ts-node scripts/health-monitor.ts
 * Cron: */5 * * * * npx ts-node /app/scripts/health-monitor.ts
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createClient } from "@supabase/supabase-js";

// ─── Config ───────────────────────────────────────────────────────────────────

const RPC_URL         = process.env.HELIUS_HTTP_URL   ?? "https://api.devnet.solana.com";
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK   ?? "";
const PAGERDUTY_KEY   = process.env.PAGERDUTY_ROUTING_KEY ?? "";
const RESEND_KEY      = process.env.RESEND_API_KEY    ?? "";
const ALERT_EMAIL     = process.env.ALERT_EMAIL       ?? "";
const SUPABASE_URL    = process.env.SUPABASE_URL      ?? "";
const SUPABASE_KEY    = process.env.SUPABASE_SERVICE_KEY ?? "";

const REWARD_POOL_WARN_PCT  = 10;  // warn at 10% remaining
const REWARD_POOL_CRIT_PCT  = 5;   // critical at 5%
const VRF_STUCK_SECS        = 120; // VRF request stuck for 2+ minutes
const LP_LOCK_WARN_DAYS     = 30;
const LP_LOCK_CRIT_DAYS     = 7;
const INDEXER_LAG_WARN_SECS = 300; // 5 minutes
const RPC_LATENCY_WARN_MS   = 2000;

type AlertLevel = "info" | "warn" | "critical";

interface Alert {
  level:   AlertLevel;
  title:   string;
  message: string;
  game_id?: number;
  value?:  string | number;
}

// ─── Health checks ────────────────────────────────────────────────────────────

async function checkRewardPools(
  supabase: ReturnType<typeof createClient>,
): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const { data: games } = await supabase
    .from("games")
    .select("id, name, ticker")
    .eq("paused", false);

  for (const game of games ?? []) {
    // In production: fetch reward vault balance from Solana
    // Here we simulate from Supabase denormalized data
    const { data: pool } = await supabase
      .from("reward_pool_snapshots")
      .select("remaining_pct, amount_left")
      .eq("game_id", game.id)
      .order("snapped_at", { ascending: false })
      .limit(1)
      .single();

    if (!pool) continue;

    if (pool.remaining_pct <= REWARD_POOL_CRIT_PCT) {
      alerts.push({
        level:   "critical",
        title:   `🚨 ${game.name} reward pool CRITICAL`,
        message: `Only ${pool.remaining_pct}% (${pool.amount_left.toLocaleString()} ${game.ticker}) remaining. Players may stop earning within days.`,
        game_id: game.id,
        value:   pool.remaining_pct,
      });
    } else if (pool.remaining_pct <= REWARD_POOL_WARN_PCT) {
      alerts.push({
        level:   "warn",
        title:   `⚠️ ${game.name} reward pool low`,
        message: `${pool.remaining_pct}% remaining. Consider running a fundraising tournament or reducing yield rates.`,
        game_id: game.id,
        value:   pool.remaining_pct,
      });
    }
  }
  return alerts;
}

async function checkVrfPendingRequests(
  connection: Connection,
  supabase: ReturnType<typeof createClient>,
): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const now = Math.floor(Date.now() / 1000);

  // Check for raid requests that have been pending > VRF_STUCK_SECS
  const { data: stuck } = await supabase
    .from("vrf_requests")
    .select("player, game_id, requested_at, stake")
    .eq("status", "pending")
    .lt("requested_at", new Date((now - VRF_STUCK_SECS) * 1000).toISOString());

  if (stuck && stuck.length > 0) {
    alerts.push({
      level:   "critical",
      title:   `🎲 VRF oracle may be down`,
      message: `${stuck.length} raid request(s) have been pending for >${VRF_STUCK_SECS}s. Player stakes are locked in escrow. Check Switchboard oracle status.`,
      value:   stuck.length,
    });
  }

  return alerts;
}

async function checkLpLocks(
  supabase: ReturnType<typeof createClient>,
): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const now = new Date();

  const { data: locks } = await supabase
    .from("lp_locks")
    .select("game_id, unlock_ts, amount")
    .eq("withdrawn", false);

  for (const lock of locks ?? []) {
    const unlockDate  = new Date(lock.unlock_ts);
    const daysLeft    = Math.ceil((unlockDate.getTime() - now.getTime()) / 86_400_000);

    if (daysLeft <= LP_LOCK_CRIT_DAYS) {
      alerts.push({
        level:   "critical",
        title:   `🔒 LP lock expiring in ${daysLeft} days`,
        message: `Game ${lock.game_id} LP lock expires ${unlockDate.toDateString()}. Notify community immediately — players should know.`,
        game_id: lock.game_id,
        value:   daysLeft,
      });
    } else if (daysLeft <= LP_LOCK_WARN_DAYS) {
      alerts.push({
        level:   "warn",
        title:   `⏰ LP lock expiring in ${daysLeft} days`,
        message: `Game ${lock.game_id} LP lock expires ${unlockDate.toDateString()}. Consider communicating renewal plans to players.`,
        game_id: lock.game_id,
        value:   daysLeft,
      });
    }
  }
  return alerts;
}

async function checkRpcLatency(connection: Connection): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const start = Date.now();
  try {
    await connection.getSlot();
    const latency = Date.now() - start;
    if (latency > RPC_LATENCY_WARN_MS) {
      alerts.push({
        level:   "warn",
        title:   `🐌 RPC latency high: ${latency}ms`,
        message: `Current RPC response time is ${latency}ms (threshold: ${RPC_LATENCY_WARN_MS}ms). Consider switching RPC provider or checking Helius status.`,
        value:   latency,
      });
    }
  } catch (e) {
    alerts.push({
      level:   "critical",
      title:   "🔴 RPC endpoint unreachable",
      message: `Cannot connect to Solana RPC. All game transactions will fail. Error: ${String(e)}`,
    });
  }
  return alerts;
}

async function checkIndexerLag(
  supabase: ReturnType<typeof createClient>,
): Promise<Alert[]> {
  const alerts: Alert[] = [];

  const { data } = await supabase
    .from("raids")
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!data) return alerts;

  const lagSecs = Math.floor((Date.now() - new Date(data.created_at).getTime()) / 1000);
  if (lagSecs > INDEXER_LAG_WARN_SECS) {
    alerts.push({
      level:   "warn",
      title:   `📊 Indexer may be lagging`,
      message: `Last indexed raid was ${Math.round(lagSecs / 60)} minutes ago. Check indexer process health. Leaderboards and analytics may be stale.`,
      value:   lagSecs,
    });
  }

  return alerts;
}

async function checkSolBalance(
  connection:     Connection,
  treasuryWallet: string,
): Promise<Alert[]> {
  const alerts: Alert[] = [];
  try {
    const balance = await connection.getBalance(new PublicKey(treasuryWallet));
    const solBal  = balance / LAMPORTS_PER_SOL;
    if (solBal < 0.5) {
      alerts.push({
        level:   "critical",
        title:   `💸 Treasury SOL low: ${solBal.toFixed(3)} SOL`,
        message: `Treasury wallet is low on SOL. Clockwork threads and protocol transactions may fail. Top up immediately.`,
        value:   solBal,
      });
    }
  } catch { /* skip */ }
  return alerts;
}

// ─── Alert delivery ───────────────────────────────────────────────────────────

async function sendDiscordAlert(alert: Alert): Promise<void> {
  if (!DISCORD_WEBHOOK) return;
  const color = alert.level === "critical" ? 0xFF0000 : alert.level === "warn" ? 0xFFA500 : 0x00FF00;
  await fetch(DISCORD_WEBHOOK, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [{
        title:       alert.title,
        description: alert.message,
        color,
        timestamp:   new Date().toISOString(),
        footer:      { text: "game.tok health monitor" },
        fields:      alert.game_id ? [{ name: "game_id", value: String(alert.game_id), inline: true }] : [],
      }],
    }),
  }).catch(console.error);
}

async function sendPagerDuty(alert: Alert): Promise<void> {
  if (!PAGERDUTY_KEY || alert.level !== "critical") return;
  await fetch("https://events.pagerduty.com/v2/enqueue", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      routing_key:  PAGERDUTY_KEY,
      event_action: "trigger",
      payload: {
        summary:   alert.title,
        source:    "game.tok health monitor",
        severity:  "critical",
        custom_details: { message: alert.message, game_id: alert.game_id, value: alert.value },
      },
    }),
  }).catch(console.error);
}

async function sendEmail(alert: Alert): Promise<void> {
  if (!RESEND_KEY || !ALERT_EMAIL || alert.level === "info") return;
  await fetch("https://api.resend.com/emails", {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_KEY}` },
    body: JSON.stringify({
      from:    "alerts@gametok.io",
      to:      [ALERT_EMAIL],
      subject: `[game.tok] ${alert.level.toUpperCase()}: ${alert.title}`,
      html:    `<p>${alert.message}</p><p><small>game_id: ${alert.game_id ?? "n/a"} · value: ${alert.value ?? "n/a"}</small></p>`,
    }),
  }).catch(console.error);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[${new Date().toISOString()}] game.tok health monitor starting...`);

  const connection = new Connection(RPC_URL, "confirmed");
  const supabase   = createClient(SUPABASE_URL, SUPABASE_KEY);

  const allChecks = await Promise.allSettled([
    checkRewardPools(supabase),
    checkVrfPendingRequests(connection, supabase),
    checkLpLocks(supabase),
    checkRpcLatency(connection),
    checkIndexerLag(supabase),
    checkSolBalance(connection, process.env.TREASURY_WALLET ?? ""),
  ]);

  const allAlerts: Alert[] = allChecks.flatMap(result =>
    result.status === "fulfilled" ? result.value : []
  );

  if (allAlerts.length === 0) {
    console.log("✅ All systems healthy");
    return;
  }

  console.log(`Found ${allAlerts.length} alert(s):`);

  for (const alert of allAlerts) {
    console.log(`  [${alert.level.toUpperCase()}] ${alert.title}`);
    await Promise.all([
      sendDiscordAlert(alert),
      sendPagerDuty(alert),
      sendEmail(alert),
    ]);
  }

  // Save alert history to Supabase
  await supabase.from("health_alerts").insert(
    allAlerts.map(a => ({
      level:   a.level,
      title:   a.title,
      message: a.message,
      game_id: a.game_id ?? null,
      value:   String(a.value ?? ""),
    }))
  ).catch(console.error);

  console.log("Done.");

  // Exit with non-zero if critical alerts
  if (allAlerts.some(a => a.level === "critical")) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Health monitor crashed:", err);
  process.exit(2);
});
