import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

interface Tournament {
  id:          string;
  game:        string;
  gameEmoji:   string;
  token:       string;
  name:        string;
  prizePool:   number;
  entryFee:    number;
  maxEntrants: number;
  entrants:    number;
  endsAt:      Date;
  status:      "live" | "upcoming" | "ended";
  top3:        { name: string; score: number }[];
  myRank?:     number;
  color:       string;
}

function useCountdown(target: Date) {
  const [left, setLeft] = useState(Math.max(0, target.getTime() - Date.now()));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, target.getTime() - Date.now())), 1000);
    return () => clearInterval(t);
  }, [target]);
  const s = Math.floor(left / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
}

const MOCK_TOURNAMENTS: Tournament[] = [
  {
    id: "t1", game: "Viking Raid", gameEmoji: "⚔️", token: "$RAID",
    name: "Weekend Raid Championship",
    prizePool: 10000, entryFee: 50, maxEntrants: 500, entrants: 312,
    endsAt: new Date(Date.now() + 38 * 3600 * 1000),
    status: "live",
    top3: [
      { name: "IronVikingX", score: 4820 },
      { name: "NorseQueen",  score: 4550 },
      { name: "Skaldsson",   score: 4220 },
    ],
    myRank: 47,
    color: "#D85A30",
  },
  {
    id: "t2", game: "Crypto Quiz", gameEmoji: "🎓", token: "$QUIZ",
    name: "DeFi Master Quiz",
    prizePool: 5000, entryFee: 0, maxEntrants: 1000, entrants: 681,
    endsAt: new Date(Date.now() + 2 * 3600 * 1000),
    status: "live",
    top3: [
      { name: "DegenSage",   score: 970 },
      { name: "OnchainProf", score: 960 },
      { name: "SolBrain",    score: 945 },
    ],
    color: "#0FA9A0",
  },
  {
    id: "t3", game: "Dragon Keep", gameEmoji: "🐉", token: "$KEEP",
    name: "Dragon Slayer Weekly",
    prizePool: 8000, entryFee: 80, maxEntrants: 200, entrants: 87,
    endsAt: new Date(Date.now() + 6 * 24 * 3600 * 1000),
    status: "upcoming",
    top3: [],
    color: "#2EA043",
  },
  {
    id: "t4", game: "Realm Wars", gameEmoji: "🏰", token: "$REALM",
    name: "Guild Wars Season 1",
    prizePool: 25000, entryFee: 200, maxEntrants: 64, entrants: 64,
    endsAt: new Date(Date.now() - 3 * 3600 * 1000),
    status: "ended",
    top3: [
      { name: "Lord Aldric",  score: 24800 },
      { name: "Ironshield",   score: 21400 },
      { name: "QueenMira",    score: 19900 },
    ],
    color: "#D4860A",
  },
];

// ─── Tournament card ──────────────────────────────────────────────────────────

function TournamentCard({ t, onEnter }: { t: Tournament; onEnter: (t: Tournament) => void }) {
  const countdown = useCountdown(t.endsAt);
  const fillPct   = Math.round((t.entrants / t.maxEntrants) * 100);

  const statusConfig = {
    live:     { label: "● live",    color: "var(--green)" },
    upcoming: { label: "⏳ soon",   color: "var(--amber)" },
    ended:    { label: "✓ ended",   color: "var(--muted)" },
  }[t.status];

  return (
    <div style={{
      border: `0.5px solid ${t.status === "live" ? t.color : "var(--border)"}`,
      borderRadius: 14, padding: "16px 16px",
      background: "var(--background)",
      opacity: t.status === "ended" ? 0.7 : 1,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: `${t.color}18`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20,
          }}>
            {t.gameEmoji}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 1 }}>{t.name}</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>{t.game} · {t.token}</div>
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: statusConfig.color }}>{statusConfig.label}</span>
      </div>

      {/* Prize + entry */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
        {[
          { label: "prize pool",  value: `${t.prizePool.toLocaleString()} ${t.token}` },
          { label: "entry fee",   value: t.entryFee === 0 ? "Free" : `${t.entryFee} ${t.token}` },
          { label: "ends in",     value: t.status === "ended" ? "—" : countdown },
        ].map(s => (
          <div key={s.label} style={{ background: "var(--surface)", borderRadius: 8, padding: "8px 10px" }}>
            <div style={{ fontSize: 9, color: "var(--muted)", marginBottom: 3, textTransform: "uppercase" }}>{s.label}</div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Fill meter */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>
          <span>{t.entrants} / {t.maxEntrants} players</span>
          <span>{fillPct}% full</span>
        </div>
        <div style={{ height: 5, background: "var(--surface)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 3,
            background: fillPct >= 90 ? "var(--red)" : fillPct >= 60 ? "var(--amber)" : t.color,
            width: `${fillPct}%`,
          }} />
        </div>
      </div>

      {/* Leaderboard */}
      {t.top3.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {t.top3.map((p, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "5px 0",
              borderBottom: i < 2 ? "0.5px solid var(--border)" : "none",
              fontSize: 12,
            }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ width: 18, color: ["#FFD700","#C0C0C0","#CD7F32"][i], fontWeight: 700 }}>
                  {["🥇","🥈","🥉"][i]}
                </span>
                <span>{p.name}</span>
              </div>
              <span style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{p.score.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {/* My rank */}
      {t.myRank && t.status === "live" && (
        <div style={{
          background: "var(--orange-light)", borderRadius: 8, padding: "7px 10px",
          fontSize: 12, color: "var(--orange)", marginBottom: 12,
        }}>
          You are ranked <strong>#{t.myRank}</strong> of {t.entrants} players
        </div>
      )}

      {/* CTA */}
      {t.status !== "ended" && (
        <button
          onClick={() => onEnter(t)}
          style={{
            width: "100%", padding: 10, borderRadius: 9, border: "none",
            background: t.status === "live" ? t.color : "var(--surface)",
            color: t.status === "live" ? "#fff" : "var(--text)",
            fontSize: 13, fontWeight: 500, cursor: "pointer",
          }}
        >
          {t.status === "live" ? (t.myRank ? "view my position →" : "enter tournament →") : "set reminder →"}
        </button>
      )}
    </div>
  );
}

// ─── Enter modal ──────────────────────────────────────────────────────────────

function EnterModal({ t, onClose }: { t: Tournament; onClose: () => void }) {
  const { publicKey } = useWallet();
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      zIndex: 200, padding: "0 16px 16px",
    }}
    onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--background)", borderRadius: 16, padding: 24,
        width: "100%", maxWidth: 440,
        boxShadow: "var(--shadow-lg)",
      }}>
        {confirmed ? (
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>You're in!</div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>
              You've entered {t.name}. Good luck!
            </div>
            <button onClick={onClose} style={{
              padding: "10px 24px", borderRadius: 9, border: "none",
              background: t.color, color: "#fff", fontSize: 13, cursor: "pointer",
            }}>done</button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Enter {t.name}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 20 }}>
              {t.game} · {t.entrants}/{t.maxEntrants} players · ends {useCountdown(t.endsAt)} from now
            </div>

            <div style={{ background: "var(--surface)", borderRadius: 10, padding: 14, marginBottom: 20 }}>
              {[
                ["Entry fee",    t.entryFee === 0 ? "Free" : `${t.entryFee} ${t.token}`],
                ["Prize pool",   `${t.prizePool.toLocaleString()} ${t.token}`],
                ["Your cut (1st)", `${Math.round(t.prizePool * 0.5).toLocaleString()} ${t.token}`],
                ["2nd place",    `${Math.round(t.prizePool * 0.3).toLocaleString()} ${t.token}`],
                ["3rd place",    `${Math.round(t.prizePool * 0.2).toLocaleString()} ${t.token}`],
              ].map(([k, v]) => (
                <div key={k} style={{
                  display: "flex", justifyContent: "space-between",
                  padding: "6px 0", borderBottom: "0.5px solid var(--border)",
                  fontSize: 13,
                }}>
                  <span style={{ color: "var(--muted)" }}>{k}</span>
                  <span style={{ fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </div>

            {!publicKey ? (
              <div style={{ textAlign: "center", fontSize: 13, color: "var(--muted)", padding: "12px 0" }}>
                Connect your wallet to enter
              </div>
            ) : (
              <button
                onClick={() => setConfirmed(true)}
                style={{
                  width: "100%", padding: 13, borderRadius: 10, border: "none",
                  background: t.color, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}
              >
                {t.entryFee === 0 ? "enter free →" : `pay ${t.entryFee} ${t.token} & enter →`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function TournamentPanel() {
  const [entering, setEntering] = useState<Tournament | null>(null);
  const [tab, setTab] = useState<"live" | "upcoming" | "ended">("live");

  const filtered = MOCK_TOURNAMENTS.filter(t => t.status === tab);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Tournaments</div>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>
          Prize pools locked on-chain at creation · winners claimed instantly
        </div>
      </div>

      {/* Total prizes */}
      <div style={{
        background: "linear-gradient(135deg, var(--orange-light) 0%, var(--amber-light) 100%)",
        borderRadius: 12, padding: "14px 16px", marginBottom: 20,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--orange)", fontWeight: 600 }}>ACTIVE PRIZE POOLS</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--orange-dark)" }}>$15,000</div>
        </div>
        <div style={{ fontSize: 32 }}>🏆</div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {(["live", "upcoming", "ended"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: "8px 0", borderRadius: 9, border: "none",
              background: tab === t ? "var(--orange)" : "var(--surface)",
              color: tab === t ? "#fff" : "var(--muted)",
              fontSize: 12, fontWeight: tab === t ? 600 : 400, cursor: "pointer",
            }}
          >
            {t === "live" ? "● live" : t}
          </button>
        ))}
      </div>

      {/* List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted)", fontSize: 14 }}>
            No {tab} tournaments right now
          </div>
        ) : (
          filtered.map(t => <TournamentCard key={t.id} t={t} onEnter={setEntering} />)
        )}
      </div>

      {entering && <EnterModal t={entering} onClose={() => setEntering(null)} />}
    </div>
  );
}
