import { useState, useEffect } from "react";
import { useWallet }   from "@solana/wallet-adapter-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreatorGame {
  id:              number;
  slug:            string;
  name:            string;
  emoji:           string;
  ticker:          string;
  ftMint:          string;
  gameType:        string;
  totalPlayers:    number;
  totalRaids:      number;
  totalRewardsPaid: number;
  rewardPoolLeft:  number;
  rewardPoolTotal: number;
  dailyActiveUsers: number;
  dailyRaids:      number;
  dailyRevenue:    number;
  weeklyRevenue:   number;
  lockDaysLeft:    number;
  lockUnlockDate:  string;
  lpLocked:        boolean;
  nftCollection:   string | null;
  nftMinted:       number;
  nftMaxSupply:    number | null;
  paused:          boolean;
}

interface DailyMetric { date: string; raids: number; players: number; rewards: number }

// ─── Mock data (replace with Supabase fetch) ──────────────────────────────────

const MOCK_GAMES: CreatorGame[] = [
  {
    id: 1, slug: "viking-raid", name: "Viking Raid", emoji: "⚔️", ticker: "$RAID",
    ftMint: "Raid1111111111111111111111111111111111111111",
    gameType: "rpg", totalPlayers: 1240, totalRaids: 28400, totalRewardsPaid: 14200000,
    rewardPoolLeft: 385000000, rewardPoolTotal: 400000000,
    dailyActiveUsers: 184, dailyRaids: 920, dailyRevenue: 46000, weeklyRevenue: 312000,
    lockDaysLeft: 287, lockUnlockDate: "Jan 20, 2026",
    lpLocked: true, nftCollection: "Viking Ships", nftMinted: 1840, nftMaxSupply: 10000,
    paused: false,
  },
  {
    id: 4, slug: "crypto-quiz", name: "CryptoQuiz", emoji: "🧩", ticker: "$QUIZ",
    ftMint: "Quiz1111111111111111111111111111111111111111",
    gameType: "puzzle", totalPlayers: 3100, totalRaids: 62000, totalRewardsPaid: 3100000,
    rewardPoolLeft: 546000000, rewardPoolTotal: 550000000,
    dailyActiveUsers: 420, dailyRaids: 2100, dailyRevenue: 10500, weeklyRevenue: 73500,
    lockDaysLeft: 164, lockUnlockDate: "Sep 19, 2025",
    lpLocked: true, nftCollection: null, nftMinted: 0, nftMaxSupply: null,
    paused: false,
  },
];

const MOCK_DAILY: DailyMetric[] = Array.from({ length: 14 }, (_, i) => ({
  date:    new Date(Date.now() - (13 - i) * 86400_000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  raids:   Math.floor(700 + Math.random() * 500),
  players: Math.floor(120 + Math.random() * 100),
  rewards: Math.floor(35000 + Math.random() * 20000),
}));

// ─── Subcomponents ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{ background: "var(--surface)", borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 500, color: accent ?? "var(--text)" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function MiniBarChart({ data, field, color }: { data: DailyMetric[]; field: keyof DailyMetric; color: string }) {
  const max = Math.max(...data.map(d => d[field] as number));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 48 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div style={{
            width: "100%", borderRadius: "2px 2px 0 0",
            height: `${Math.max(3, ((d[field] as number) / max) * 44)}px`,
            background: i === data.length - 1 ? color : `${color}60`,
            transition: "height 0.3s",
          }} />
        </div>
      ))}
    </div>
  );
}

function ProgressBar({ value, max, color = "var(--orange)" }: { value: number; max: number; color?: string }) {
  const pct = Math.round(Math.min(100, (value / max) * 100));
  return (
    <div>
      <div style={{ height: 6, background: "var(--surface)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.5s" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
        <span>{value.toLocaleString()} used</span>
        <span>{max.toLocaleString()} total ({pct}%)</span>
      </div>
    </div>
  );
}

// ─── Create Tournament Modal ──────────────────────────────────────────────────

function CreateTournamentForm({ game, onClose }: { game: CreatorGame; onClose: () => void }) {
  const [prizePool,  setPrizePool]  = useState("50000");
  const [entryFee,   setEntryFee]   = useState("0");
  const [maxPlayers, setMaxPlayers] = useState("500");
  const [duration,   setDuration]   = useState("24");
  const [shares,     setShares]     = useState("5000,2500,1500,1000");
  const [creating,   setCreating]   = useState(false);
  const [done,       setDone]       = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    await new Promise(r => setTimeout(r, 1500));
    setCreating(false);
    setDone(true);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
    }}>
      <div style={{
        background: "var(--background)", borderRadius: 16, padding: 24,
        width: "100%", maxWidth: 460, border: "0.5px solid var(--border)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>Create tournament · {game.name}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--muted)" }}>×</button>
        </div>

        {done ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🏆</div>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>Tournament created!</div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
              Prize pool locked in smart contract. Players can enter now.
            </div>
            <button onClick={onClose} style={{ padding: "10px 24px", borderRadius: 8, background: "var(--orange)", color: "#fff", border: "none", cursor: "pointer", fontSize: 14 }}>
              done
            </button>
          </div>
        ) : (
          <div>
            {[
              { label: "prize pool (tokens)", val: prizePool, set: setPrizePool, hint: `Drawn from your ${game.ticker} treasury` },
              { label: "entry fee (0 = free)", val: entryFee, set: setEntryFee, hint: "Entry fees add to the prize pool" },
              { label: "max entrants", val: maxPlayers, set: setMaxPlayers, hint: "" },
              { label: "duration (hours)", val: duration, set: setDuration, hint: "" },
              { label: "prize shares (bps, comma-separated)", val: shares, set: setShares, hint: "e.g. 5000,2500,1500,1000 = 50/25/15/10 split, must sum to 10000" },
            ].map(({ label, val, set, hint }) => (
              <div key={label} style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>{label}</label>
                <input value={val} onChange={e => set(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, outline: "none" }}
                />
                {hint && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{hint}</div>}
              </div>
            ))}

            <div style={{ background: "var(--teal-light)", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "var(--teal-dark)", marginBottom: 16 }}>
              Prize pool of {parseInt(prizePool).toLocaleString()} {game.ticker} will be locked in the tournament smart contract immediately.
              100% goes to winners — game.tok takes no cut of tournament prizes.
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleCreate} disabled={creating} style={{
                flex: 1, padding: 12, borderRadius: 8, background: "var(--orange)",
                color: "#fff", border: "none", fontSize: 14, fontWeight: 500, cursor: "pointer",
              }}>
                {creating ? "creating..." : "create & fund tournament"}
              </button>
              <button onClick={onClose} style={{ padding: "12px 16px", borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--background)", fontSize: 14, cursor: "pointer", color: "var(--muted)" }}>
                cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function CreatorDashboard() {
  const { publicKey } = useWallet();
  const [games,       setGames]       = useState<CreatorGame[]>(MOCK_GAMES);
  const [activeGame,  setActiveGame]  = useState<CreatorGame>(MOCK_GAMES[0]);
  const [activeTab,   setActiveTab]   = useState<"overview" | "rewards" | "nfts" | "tournaments" | "settings">("overview");
  const [showTourn,   setShowTourn]   = useState(false);
  const [pausing,     setPausing]     = useState(false);

  const rewardPct   = Math.round((activeGame.rewardPoolLeft / activeGame.rewardPoolTotal) * 100);
  const daysRunway  = activeGame.dailyRevenue > 0
    ? Math.round(activeGame.rewardPoolLeft / activeGame.dailyRevenue)
    : 999;

  const togglePause = async () => {
    setPausing(true);
    await new Promise(r => setTimeout(r, 800));
    setGames(prev => prev.map(g => g.id === activeGame.id ? { ...g, paused: !g.paused } : g));
    setActiveGame(prev => ({ ...prev, paused: !prev.paused }));
    setPausing(false);
  };

  const tabStyle = (t: string) => ({
    padding: "8px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer",
    border: `0.5px solid ${activeTab === t ? "var(--orange)" : "var(--border)"}`,
    background: activeTab === t ? "var(--orange-light)" : "var(--background)",
    color: activeTab === t ? "var(--orange-dark)" : "var(--muted)",
    transition: "all .15s",
  } as const);

  if (!publicKey) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🎮</div>
        <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>Creator Dashboard</div>
        <div style={{ fontSize: 14, color: "var(--muted)" }}>Connect your wallet to manage your games</div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "var(--font-sans, sans-serif)" }}>
      {showTourn && <CreateTournamentForm game={activeGame} onClose={() => setShowTourn(false)} />}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 500 }}>Creator Dashboard</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>{games.length} game{games.length !== 1 ? "s" : ""} deployed</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowTourn(true)} style={{
            padding: "8px 16px", borderRadius: 8, background: "var(--orange)", color: "#fff",
            border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer",
          }}>+ tournament</button>
        </div>
      </div>

      {/* Game selector */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {games.map(g => (
          <button key={g.id} onClick={() => setActiveGame(g)} style={{
            padding: "8px 16px", borderRadius: 10, fontSize: 13,
            border: `0.5px solid ${activeGame.id === g.id ? "var(--orange)" : "var(--border)"}`,
            background: activeGame.id === g.id ? "var(--orange-light)" : "var(--background)",
            color: activeGame.id === g.id ? "var(--orange-dark)" : "var(--muted)",
            cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ fontSize: 18 }}>{g.emoji}</span>
            <span>{g.name}</span>
            {g.paused && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 10, background: "var(--orange-light)", color: "var(--orange-dark)" }}>paused</span>}
          </button>
        ))}
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {(["overview", "rewards", "nfts", "tournaments", "settings"] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={tabStyle(t)}>{t}</button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === "overview" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
            <StatCard label="total players"    value={activeGame.totalPlayers.toLocaleString()} />
            <StatCard label="total raids"      value={activeGame.totalRaids.toLocaleString()} />
            <StatCard label="daily active"     value={activeGame.dailyActiveUsers.toLocaleString()} sub="users today" />
            <StatCard label="daily volume"     value={`${activeGame.dailyRevenue.toLocaleString()} ${activeGame.ticker}`} sub="raid volume" accent="var(--orange)" />
          </div>

          {/* 14-day charts */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
            {([
              { label: "daily raids", field: "raids" as const,   color: "var(--orange)" },
              { label: "daily players", field: "players" as const, color: "var(--teal)" },
              { label: "rewards paid", field: "rewards" as const, color: "#7F77DD" },
            ]).map(({ label, field, color }) => (
              <div key={label} style={{ background: "var(--surface)", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>{label} · 14d</div>
                <MiniBarChart data={MOCK_DAILY} field={field} color={color} />
                <div style={{ marginTop: 6, fontSize: 13, fontWeight: 500 }}>
                  {MOCK_DAILY[MOCK_DAILY.length - 1][field].toLocaleString()}
                  <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 400, marginLeft: 4 }}>today</span>
                </div>
              </div>
            ))}
          </div>

          {/* Lock status */}
          <div style={{ border: "0.5px solid var(--border)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>🔒 liquidity lock</div>
              <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, background: "var(--teal-light)", color: "var(--teal-dark)" }}>
                {activeGame.lockDaysLeft} days remaining
              </span>
            </div>
            <div style={{ display: "flex", gap: 20, fontSize: 13, color: "var(--muted)" }}>
              <span>Unlocks: {activeGame.lockUnlockDate}</span>
              <span>LP tokens locked in PDA vault</span>
              <a href={`https://solscan.io/account/${activeGame.ftMint}?cluster=devnet`}
                target="_blank" rel="noreferrer"
                style={{ color: "var(--orange)", textDecoration: "none", marginLeft: "auto" }}>
                verify on Solscan ↗
              </a>
            </div>
          </div>

          {/* Win rate distribution */}
          <div style={{ background: "var(--surface)", borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>player win rate distribution</div>
            <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 60 }}>
              {[12, 18, 24, 31, 26, 19, 14, 9, 5, 3].map((pct, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <div style={{
                    width: "100%", borderRadius: "2px 2px 0 0",
                    height: `${(pct / 31) * 56}px`,
                    background: i < 3 ? "var(--orange)" : i < 6 ? "var(--teal)" : "var(--surface)",
                    border: "0.5px solid var(--border)",
                  }} />
                  <div style={{ fontSize: 9, color: "var(--muted)" }}>{(40 + i * 5)}%</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 11, color: "var(--muted)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 8, height: 8, background: "var(--orange)", borderRadius: 2, display: "inline-block" }} />losing players (EV−)
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 8, height: 8, background: "var(--teal)", borderRadius: 2, display: "inline-block" }} />profitable players (EV+)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* REWARDS TAB */}
      {activeTab === "rewards" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
            <StatCard label="reward pool remaining" value={`${(activeGame.rewardPoolLeft / 1e6).toFixed(1)}M ${activeGame.ticker}`} sub={`${rewardPct}% remaining`} accent={rewardPct < 20 ? "var(--orange)" : "var(--text)"} />
            <StatCard label="estimated runway"      value={`${daysRunway} days`} sub="at current daily volume" accent={daysRunway < 90 ? "var(--orange)" : "var(--teal)"} />
            <StatCard label="total rewards paid"    value={`${(activeGame.totalRewardsPaid / 1e6).toFixed(1)}M ${activeGame.ticker}`} />
            <StatCard label="daily reward drain"    value={`${activeGame.dailyRevenue.toLocaleString()} ${activeGame.ticker}`} sub="avg last 7 days" />
          </div>

          <div style={{ border: "0.5px solid var(--border)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>reward pool consumption</div>
            <ProgressBar value={activeGame.rewardPoolTotal - activeGame.rewardPoolLeft} max={activeGame.rewardPoolTotal} color="var(--orange)" />
          </div>

          {rewardPct < 30 && (
            <div style={{ background: "var(--orange-light)", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--orange-dark)", marginBottom: 4 }}>⚠️ Reward pool running low</div>
              <div style={{ fontSize: 12, color: "var(--orange-dark)", lineHeight: 1.5 }}>
                At current burn rate your reward pool runs out in ~{daysRunway} days. Consider reducing raid reward rates or running a fundraising tournament to replenish the treasury.
              </div>
            </div>
          )}

          <div style={{ border: "0.5px solid var(--border)", borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>EV health check</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { label: "house edge",      value: "15%",  status: "ok",  note: "Within protocol limit (20%)" },
                { label: "player EV (avg)", value: "+4.1%", status: "good", note: "Positive for level 20+ players" },
                { label: "skill cap EV",   value: "+19.4%", status: "good", note: "Expert players well rewarded" },
                { label: "reward runway",  value: `${daysRunway}d`, status: daysRunway > 180 ? "good" : "warn", note: daysRunway > 180 ? "Sustainable" : "Consider topping up" },
              ].map(({ label, value, status, note }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "0.5px solid var(--border)" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: status === "good" ? "var(--teal)" : status === "warn" ? "var(--amber)" : "var(--orange)", flexShrink: 0 }} />
                  <div style={{ fontSize: 13, flex: 1 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{value}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", minWidth: 160, textAlign: "right" }}>{note}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* NFTS TAB */}
      {activeTab === "nfts" && (
        <div>
          {activeGame.nftCollection ? (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
                <StatCard label="collection"     value={activeGame.nftCollection} />
                <StatCard label="minted"         value={activeGame.nftMinted.toLocaleString()} sub={`of ${activeGame.nftMaxSupply?.toLocaleString()}`} />
                <StatCard label="mint progress"  value={`${Math.round((activeGame.nftMinted / (activeGame.nftMaxSupply ?? 1)) * 100)}%`} accent="var(--orange)" />
              </div>

              <div style={{ border: "0.5px solid var(--border)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>mint progress</div>
                <ProgressBar value={activeGame.nftMinted} max={activeGame.nftMaxSupply ?? 1} color="var(--orange)" />
              </div>

              <div style={{ border: "0.5px solid var(--border)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>rarity distribution (minted)</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                  {[
                    { name: "common",    pct: 60, color: "var(--surface)",   tc: "var(--muted)",       count: Math.round(activeGame.nftMinted * 0.60) },
                    { name: "rare",      pct: 25, color: "var(--teal-light)", tc: "var(--teal-dark)",   count: Math.round(activeGame.nftMinted * 0.25) },
                    { name: "epic",      pct: 12, color: "#EEEDFE",          tc: "#3C3489",             count: Math.round(activeGame.nftMinted * 0.12) },
                    { name: "legendary", pct:  3, color: "var(--amber-light)", tc: "var(--amber-dark)", count: Math.round(activeGame.nftMinted * 0.03) },
                  ].map(r => (
                    <div key={r.name} style={{ background: r.color, borderRadius: 8, padding: "10px 12px" }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: r.tc, marginBottom: 2 }}>{r.name}</div>
                      <div style={{ fontSize: 20, fontWeight: 500, color: r.tc }}>{r.count.toLocaleString()}</div>
                      <div style={{ fontSize: 11, color: r.tc }}>{r.pct}% weight</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ border: "0.5px solid var(--border)", borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>royalty revenue</div>
                <div style={{ fontSize: 13, color: "var(--muted)" }}>5% royalty on secondary sales · Royalty split: 70% dev treasury · 30% player reward pool</div>
                <div style={{ fontSize: 20, fontWeight: 500, marginTop: 8 }}>284.4 SOL <span style={{ fontSize: 13, fontWeight: 400, color: "var(--muted)" }}>lifetime royalties</span></div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "40px 20px", background: "var(--surface)", borderRadius: 12 }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>🖼️</div>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>No NFT collection</div>
              <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>Add an NFT collection to your game to unlock staking multipliers, win rate bonuses, and secondary market royalties.</div>
              <button style={{ padding: "10px 20px", borderRadius: 8, background: "var(--orange)", color: "#fff", border: "none", cursor: "pointer", fontSize: 14 }}>
                create NFT collection
              </button>
            </div>
          )}
        </div>
      )}

      {/* TOURNAMENTS TAB */}
      {activeTab === "tournaments" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>Tournaments for {activeGame.name}</div>
            <button onClick={() => setShowTourn(true)} style={{ padding: "8px 16px", borderRadius: 8, background: "var(--orange)", color: "#fff", border: "none", cursor: "pointer", fontSize: 13 }}>
              + create tournament
            </button>
          </div>

          {[
            { id: "t1", state: "live",     prizePool: "50,000", entrants: 312, maxEntrants: 500, ends: "22h 14m", ticker: activeGame.ticker },
            { id: "t2", state: "ended",    prizePool: "20,000", entrants: 198, maxEntrants: 200, ends: "ended",   ticker: activeGame.ticker, winner: "DkNf...3xR2" },
            { id: "t3", state: "upcoming", prizePool: "100,000",entrants: 0,   maxEntrants: 200, ends: "starts in 2d", ticker: activeGame.ticker },
          ].map(t => (
            <div key={t.id} style={{ border: "0.5px solid var(--border)", borderRadius: 10, padding: 14, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 18 }}>🏆</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{t.prizePool} {t.ticker} prize pool</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{t.entrants}/{t.maxEntrants} entrants · {t.ends}</div>
                    {t.winner && <div style={{ fontSize: 11, color: "var(--teal)" }}>🥇 winner: {t.winner}</div>}
                  </div>
                </div>
                <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, background: t.state === "live" ? "var(--teal-light)" : t.state === "upcoming" ? "var(--amber-light)" : "var(--surface)", color: t.state === "live" ? "var(--teal-dark)" : t.state === "upcoming" ? "var(--amber-dark)" : "var(--muted)" }}>
                  {t.state}
                </span>
              </div>
              {t.state === "live" && (
                <div style={{ marginTop: 8 }}>
                  <ProgressBar value={t.entrants} max={t.maxEntrants} color="var(--teal)" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* SETTINGS TAB */}
      {activeTab === "settings" && (
        <div>
          <div style={{ border: "0.5px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
            {[
              { label: "game name",        value: activeGame.name },
              { label: "token ticker",     value: activeGame.ticker },
              { label: "token mint",       value: `${activeGame.ftMint.slice(0, 12)}...` },
              { label: "game type",        value: activeGame.gameType },
              { label: "house edge",       value: "15%" },
              { label: "status",           value: activeGame.paused ? "PAUSED" : "active" },
            ].map((row, i, arr) => (
              <div key={row.label} style={{
                display: "flex", justifyContent: "space-between", padding: "12px 16px",
                borderBottom: i < arr.length - 1 ? "0.5px solid var(--border)" : "none",
                fontSize: 13,
              }}>
                <span style={{ color: "var(--muted)" }}>{row.label}</span>
                <span style={{ fontWeight: 500 }}>{row.value}</span>
              </div>
            ))}
          </div>

          {/* Danger zone */}
          <div style={{ border: "0.5px solid var(--orange)", borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--orange-dark)", marginBottom: 12 }}>danger zone</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={togglePause} disabled={pausing} style={{
                padding: "9px 16px", borderRadius: 8,
                background: activeGame.paused ? "var(--teal)" : "var(--orange)",
                color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500,
              }}>
                {pausing ? "..." : activeGame.paused ? "unpause game" : "pause game"}
              </button>
              <button style={{ padding: "9px 16px", borderRadius: 8, border: "0.5px solid var(--orange)", color: "var(--orange)", background: "var(--background)", cursor: "pointer", fontSize: 13 }}>
                export player data
              </button>
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>
              Pausing stops new raids but does not affect pending VRF requests or active tournaments.
              Liquidity remains locked regardless of pause state.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
