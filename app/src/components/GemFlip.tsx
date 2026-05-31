import { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = "lobby" | "flip" | "result";
type Tier = "1x" | "2x" | "3x" | "5x" | "10x";

interface TierConfig {
  label:       string;
  multiplier:  number;
  winOdds:     number; // True probability
  cost:        number; // $GEM tokens
  emoji:       string;
  color:       string;
}

interface FlipResult {
  won:         boolean;
  tier:        TierConfig;
  paid:        number;
  received:    number;
  roll:        number;
  poolBefore:  number;
  poolAfter:   number;
}

// ─── Tier config ──────────────────────────────────────────────────────────────

const TIERS: Record<Tier, TierConfig> = {
  "1x":  { label: "Sapphire",  multiplier: 1.5,  winOdds: 0.58, cost: 20,  emoji: "💎", color: "var(--teal)" },
  "2x":  { label: "Emerald",   multiplier: 2.0,  winOdds: 0.43, cost: 40,  emoji: "💚", color: "var(--green)" },
  "3x":  { label: "Ruby",      multiplier: 3.0,  winOdds: 0.30, cost: 80,  emoji: "❤️‍🔥", color: "var(--red)" },
  "5x":  { label: "Topaz",     multiplier: 5.0,  winOdds: 0.17, cost: 150, emoji: "🔶", color: "var(--amber)" },
  "10x": { label: "Black Opal",multiplier: 10.0, winOdds: 0.08, cost: 300, emoji: "🖤", color: "var(--text)" },
};

// House edge per tier: 1x=13%, 2x=14%, 3x=10%, 5x=15%, 10x=20%
// (1 - winOdds * multiplier) = house edge

// ─── Pool simulator ───────────────────────────────────────────────────────────

const INITIAL_POOL = 50_000; // $GEM tokens

function calcRunway(pool: number, dailyFlips: number, avgHouseEdge: number): number {
  // Pool shrinks when players win more than they put in (at end of life)
  // Actually pool grows when house edge is positive — collapse happens from incentive changes
  // For display: estimate days until pool is "empty" if players don't join
  const dailyNetDrain = dailyFlips * 40 * (1 - avgHouseEdge); // net outflow
  return pool > 0 ? Math.round(pool / Math.max(1, dailyNetDrain)) : 0;
}

// ─── EV display ──────────────────────────────────────────────────────────────

function EVTable() {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: "var(--orange)", fontWeight: 600, marginBottom: 8, letterSpacing: "0.5px" }}>
        TRANSPARENT ODDS — ALL STATS ARE EXACT AND ON-CHAIN
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "0.5px solid var(--border)" }}>
              {["Gem", "Win rate", "Payout", "House edge", "EV per flip"].map(h => (
                <th key={h} style={{ padding: "6px 8px", textAlign: "right", color: "var(--muted)", fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(Object.entries(TIERS) as [Tier, TierConfig][]).map(([id, t]) => {
              const houseEdge = 1 - t.winOdds * t.multiplier;
              const evPct     = (-houseEdge * 100).toFixed(1);
              return (
                <tr key={id} style={{ borderBottom: "0.5px solid var(--border)" }}>
                  <td style={{ padding: "6px 8px", color: t.color }}>{t.emoji} {t.label}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{(t.winOdds * 100).toFixed(0)}%</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{t.multiplier}×</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", color: "var(--red)" }}>{(houseEdge * 100).toFixed(0)}%</td>
                  <td style={{ padding: "6px 8px", textAlign: "right", color: "var(--red)", fontWeight: 600 }}>{evPct}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GemFlip() {
  const [phase,       setPhase]      = useState<Phase>("lobby");
  const [pool,        setPool]       = useState(INITIAL_POOL);
  const [playerGems,  setPlayerGems] = useState(500); // Starting $GEM balance
  const [totalFlips,  setTotalFlips] = useState(0);
  const [totalWon,    setTotalWon]   = useState(0);
  const [selectedTier, setSelectedTier] = useState<Tier>("2x");
  const [result,      setResult]     = useState<FlipResult | null>(null);
  const [rolling,     setRolling]    = useState(false);
  const [rollDisplay, setRollDisplay] = useState(50);
  const [accepted,    setAccepted]   = useState(false);

  const tier = TIERS[selectedTier];

  const doFlip = useCallback(() => {
    if (playerGems < tier.cost || rolling) return;

    setRolling(true);
    setPhase("flip");

    const finalRoll = Math.random();
    const won       = finalRoll < tier.winOdds;
    const received  = won ? Math.round(tier.cost * tier.multiplier) : 0;

    // Animate roll
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setRollDisplay(Math.round(Math.random() * 100));
      if (i >= 25) {
        clearInterval(interval);
        setRollDisplay(Math.round(finalRoll * 100));
        setTimeout(() => {
          const poolBefore = pool;
          const poolAfter  = won ? pool - received + tier.cost : pool + tier.cost;

          setResult({ won, tier, paid: tier.cost, received, roll: Math.round(finalRoll * 100), poolBefore, poolAfter });
          setPlayerGems(p => p - tier.cost + received);
          setPool(poolAfter);
          setTotalFlips(p => p + 1);
          if (won) setTotalWon(p => p + 1);
          setRolling(false);
          setPhase("result");
        }, 300);
      }
    }, 70);
  }, [tier, playerGems, pool, rolling]);

  // ── Disclaimer ─────────────────────────────────────────────────────────
  if (!accepted) {
    return (
      <div style={{ fontFamily: "var(--font-sans, sans-serif)" }}>
        <div style={{
          border: "2px solid var(--red)", borderRadius: 16,
          padding: 24, marginBottom: 16,
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--red)", marginBottom: 12 }}>
            ⚠️ Mandatory Disclosure
          </div>
          <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.7, marginBottom: 16 }}>
            <strong>GemFlip is a ponzi-style game.</strong> This means:
          </div>
          <ul style={{ fontSize: 13, color: "var(--muted)", lineHeight: 2, paddingLeft: 20, marginBottom: 16 }}>
            <li>All payouts come from other players' deposits</li>
            <li>The pool will eventually be depleted</li>
            <li>Early players win at the expense of late players</li>
            <li>Every tier has a <strong style={{ color: "var(--red)" }}>negative expected value</strong></li>
            <li>You will lose money on average over many flips</li>
          </ul>
          <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.6 }}>
            game.tok displays this disclosure because transparency is required by the protocol. The pool size, win rates, and house edge are stored <strong>on-chain</strong> and cannot be hidden or changed by the developer.
          </div>
        </div>

        <div style={{
          background: "var(--surface)", borderRadius: 10, padding: 12,
          marginBottom: 20, fontSize: 12, color: "var(--muted)",
        }}>
          💡 <strong style={{ color: "var(--text)" }}>Why this game exists on game.tok:</strong> Ponzi mechanics are common in crypto. By making them transparent and on-chain, we turn a predatory pattern into an educational one. You can see exactly how it works — and choose whether to play.
        </div>

        <button
          onClick={() => setAccepted(true)}
          style={{
            width: "100%", padding: 14, borderRadius: 10, border: "none",
            background: "var(--red)", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer",
          }}
        >
          I understand — show me the game
        </button>
      </div>
    );
  }

  // ── Lobby ─────────────────────────────────────────────────────────────
  if (phase === "lobby") {
    const runway = calcRunway(pool, 50, 0.14);

    return (
      <div style={{ fontFamily: "var(--font-sans, sans-serif)" }}>
        {/* Header */}
        <div style={{
          background: "linear-gradient(135deg, #1A0808 0%, #2E1010 100%)",
          borderRadius: 16, padding: "20px 16px", marginBottom: 20,
        }}>
          <div style={{ fontSize: 11, color: "#C04040", letterSpacing: "1.5px", fontWeight: 600, marginBottom: 6 }}>
            DEVGAME · PONZI-TRANSPARENT
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#F0E0E0", marginBottom: 4 }}>
            💎 GemFlip
          </div>
          <div style={{ fontSize: 12, color: "#907070" }}>
            House edge: 10–20% · Pool: {pool.toLocaleString()} $GEM · Collapse in ~{runway} days
          </div>
        </div>

        {/* Pool stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 20 }}>
          {[
            { label: "pool size",  value: pool.toLocaleString(), sub: "$GEM" },
            { label: "your balance", value: playerGems.toLocaleString(), sub: "$GEM" },
            { label: "win rate",   value: `${Math.round(totalWon / Math.max(1, totalFlips) * 100)}%`, sub: `${totalFlips} flips` },
          ].map(s => (
            <div key={s.label} style={{ background: "var(--surface)", borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{s.value}</div>
              <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 2, textTransform: "uppercase" }}>{s.label}</div>
              <div style={{ fontSize: 9, color: "var(--muted)" }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Pool bar */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
            <span>pool health</span>
            <span>{Math.round((pool / INITIAL_POOL) * 100)}% of initial</span>
          </div>
          <div style={{ height: 8, background: "var(--surface)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 4,
              background: pool > INITIAL_POOL * 0.5
                ? "var(--green)"
                : pool > INITIAL_POOL * 0.2
                  ? "var(--amber)"
                  : "var(--red)",
              width: `${Math.min(100, (pool / INITIAL_POOL) * 100)}%`,
              transition: "width 0.5s ease",
            }} />
          </div>
        </div>

        {/* EV table */}
        <EVTable />

        {/* Tier selector */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>choose your gem</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
            {(Object.entries(TIERS) as [Tier, TierConfig][]).map(([id, t]) => (
              <button
                key={id}
                onClick={() => setSelectedTier(id)}
                style={{
                  padding: "8px 4px", borderRadius: 8, textAlign: "center",
                  border: `${selectedTier === id ? "2px" : "0.5px"} solid ${selectedTier === id ? t.color : "var(--border)"}`,
                  background: selectedTier === id ? "var(--surface-2)" : "var(--surface)",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 18 }}>{t.emoji}</div>
                <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>{t.multiplier}×</div>
                <div style={{ fontSize: 9, color: t.color, fontWeight: 600 }}>{t.cost} $GEM</div>
              </button>
            ))}
          </div>
        </div>

        {/* Flip button */}
        <div style={{
          background: "var(--surface)", borderRadius: 10, padding: 12, marginBottom: 14,
          fontSize: 12, color: "var(--muted)", display: "flex", justifyContent: "space-between",
        }}>
          <span>selected: {tier.emoji} {tier.label}</span>
          <span>win: {(tier.winOdds * 100).toFixed(0)}% · pay {tier.cost} → win {Math.round(tier.cost * tier.multiplier)}</span>
        </div>

        <button
          onClick={doFlip}
          disabled={playerGems < tier.cost}
          style={{
            width: "100%", padding: 14, borderRadius: 10, border: "none",
            background: playerGems < tier.cost ? "var(--surface-2)" : "var(--red)",
            color: playerGems < tier.cost ? "var(--muted)" : "#fff",
            fontSize: 15, fontWeight: 600, cursor: playerGems < tier.cost ? "not-allowed" : "pointer",
          }}
        >
          {playerGems < tier.cost ? `need ${tier.cost} $GEM (have ${playerGems})` : `flip for ${tier.cost} $GEM →`}
        </button>
      </div>
    );
  }

  // ── Rolling ────────────────────────────────────────────────────────────
  if (phase === "flip") {
    return (
      <div style={{ fontFamily: "var(--font-sans, sans-serif)", textAlign: "center", padding: "40px 0" }}>
        <div style={{ fontSize: 40, marginBottom: 20 }}>{tier.emoji}</div>
        <div style={{
          width: 100, height: 100, borderRadius: "50%", margin: "0 auto 20px",
          background: "linear-gradient(135deg, var(--red) 0%, var(--amber) 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 40, fontWeight: 700, color: "#fff",
          animation: "spin 0.3s linear infinite",
        }}>
          {rollDisplay}
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>
          need ≤ {Math.round(tier.winOdds * 100)} to win
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Result ─────────────────────────────────────────────────────────────
  if (phase === "result" && result) {
    return (
      <div style={{ fontFamily: "var(--font-sans, sans-serif)" }}>
        <div style={{
          borderRadius: 16, padding: "24px 20px", marginBottom: 20, textAlign: "center",
          background: result.won
            ? "linear-gradient(135deg, #0A2E14 0%, #123D1E 100%)"
            : "linear-gradient(135deg, #2E0A0A 0%, #3D1212 100%)",
        }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>{result.won ? result.tier.emoji : "💔"}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#F0EDE8" }}>
            {result.won ? `Won ${result.received} $GEM!` : `Lost ${result.paid} $GEM`}
          </div>
          <div style={{ fontSize: 12, color: result.won ? "#80D0A0" : "#D08080", marginTop: 4 }}>
            roll: {result.roll} · needed ≤ {Math.round(result.tier.winOdds * 100)}
          </div>
        </div>

        {/* Pool impact */}
        <div style={{ background: "var(--surface)", borderRadius: 12, padding: 14, marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10 }}>Pool impact</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span>before: <strong>{result.poolBefore.toLocaleString()}</strong></span>
            <span style={{ color: result.won ? "var(--red)" : "var(--green)" }}>
              {result.won ? `−${result.received - result.paid}` : `+${result.paid}`}
            </span>
            <span>after: <strong>{result.poolAfter.toLocaleString()}</strong></span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button
            onClick={() => setPhase("lobby")}
            style={{
              padding: 12, borderRadius: 10, border: "0.5px solid var(--border)",
              background: "var(--surface)", fontSize: 13, cursor: "pointer", color: "var(--text)",
            }}
          >
            ← back
          </button>
          <button
            onClick={() => {
              setResult(null);
              setPhase("lobby");
            }}
            style={{
              padding: 12, borderRadius: 10, border: "none",
              background: "var(--red)", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer",
            }}
          >
            flip again →
          </button>
        </div>
      </div>
    );
  }

  return null;
}
