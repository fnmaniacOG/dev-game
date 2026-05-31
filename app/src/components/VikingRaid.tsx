import { useState, useCallback, useRef, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = "lobby" | "select" | "rolling" | "reveal" | "result" | "lore";
type ShipTier = "longship" | "drakkar" | "warship" | "legendary";

interface PlayerState {
  level:      number;
  xp:         number;
  xpToNext:   number;
  raids:      number;
  wins:       number;
  raidTokens: number;
  ship:       ShipTier | null;
}

interface RaidTarget {
  id:          string;
  name:        string;
  emoji:       string;
  region:      string;
  difficulty:  number;     // 1–5
  baseReward:  number;     // $RAID tokens
  winOdds:     number;     // base probability before skill
  lore:        string;
  historicalFact: string;
}

interface RaidResult {
  won:     boolean;
  roll:    number;
  needed:  number;
  reward:  number;
  xp:      number;
  message: string;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const SHIP_BONUSES: Record<ShipTier, { winBonus: number; rewardMult: number; label: string; emoji: string }> = {
  longship:  { winBonus: 0.03, rewardMult: 1.05, label: "Longship",     emoji: "⛵" },
  drakkar:   { winBonus: 0.06, rewardMult: 1.12, label: "Drakkar",      emoji: "🚢" },
  warship:   { winBonus: 0.09, rewardMult: 1.18, label: "Warship",      emoji: "🛳" },
  legendary: { winBonus: 0.09, rewardMult: 1.20, label: "Legendary Ship", emoji: "⚓" },
};

const RAID_TARGETS: RaidTarget[] = [
  {
    id: "lindisfarne",
    name: "Lindisfarne",
    emoji: "⛪",
    region: "Northumbria, 793 AD",
    difficulty: 1,
    baseReward: 40,
    winOdds: 0.60,
    lore: "The monastery on Holy Island — the raid that announced the Viking Age to Europe.",
    historicalFact: "The 793 AD Lindisfarne raid is the first recorded Viking attack. The Anglo-Saxon Chronicle described it as 'devastation incessantly by heathen men.'",
  },
  {
    id: "paris",
    name: "Paris",
    emoji: "🏰",
    region: "West Francia, 845 AD",
    difficulty: 2,
    baseReward: 85,
    winOdds: 0.50,
    lore: "Ragnar Lothbrok led 120 ships up the Seine. King Charles the Bald paid 7,000 pounds of silver to make them leave.",
    historicalFact: "The Danegeld (tribute paid to Vikings) set a precedent that was paid repeatedly across Europe. By 1012, England had paid over 48,000 pounds of silver.",
  },
  {
    id: "constantinople",
    name: "Constantinople",
    emoji: "🕌",
    region: "Byzantine Empire, 860 AD",
    difficulty: 3,
    baseReward: 150,
    winOdds: 0.40,
    lore: "The Rus Vikings sailed down the Dnieper and across the Black Sea. Emperor Michael III was away — the city was nearly taken.",
    historicalFact: "Byzantine emperors formed the Varangian Guard from Norse warriors — elite bodyguards who served for over 300 years. Harald Hardrada served in it before becoming King of Norway.",
  },
  {
    id: "seville",
    name: "Seville",
    emoji: "🌴",
    region: "Al-Andalus, 844 AD",
    difficulty: 4,
    baseReward: 240,
    winOdds: 0.32,
    lore: "Vikings raided Moorish Spain. Arab chroniclers called them 'al-Majus' — the fire-worshippers. They sacked Seville but were eventually driven out.",
    historicalFact: "The Emir of Córdoba, Abd ar-Rahman II, built a naval fleet specifically to counter Norse raiders — the first organized Arab naval defense against Vikings.",
  },
  {
    id: "miklagardr",
    name: "Miklagarðr",
    emoji: "🏛",
    region: "The Great City, 907 AD",
    difficulty: 5,
    baseReward: 420,
    winOdds: 0.24,
    lore: "Oleg of Novgorod assembled 2,000 ships. He nailed his shield to the city gates. The Byzantines paid tribute rather than fight.",
    historicalFact: "Miklagarðr ('Great City') was the Norse name for Constantinople. The trade route from Scandinavia through Russia to Constantinople — the 'Varangian trade route' — was one of the great medieval trade networks.",
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcWinOdds(base: number, level: number, ship: ShipTier | null): number {
  const skillBonus = Math.min(0.20, (level - 1) * 0.005); // +0.5% per level, cap +20%
  const shipBonus  = ship ? SHIP_BONUSES[ship].winBonus : 0;
  return Math.min(0.92, base + skillBonus + shipBonus);
}

function levelFromXp(xp: number): { level: number; xpToNext: number } {
  // XP curve: each level needs level * 800 XP
  let level = 1;
  let total = 0;
  while (total + level * 800 <= xp) {
    total += level * 800;
    level++;
    if (level >= 50) break;
  }
  const xpToNext = level >= 50 ? 0 : level * 800 - (xp - total);
  return { level, xpToNext };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EVBadge({ odds }: { odds: number }) {
  const ev = odds > 0.5 ? "positive" : odds > 0.42 ? "neutral" : "negative";
  const colors = {
    positive: { bg: "var(--green-light)", color: "var(--green)", label: "EV+" },
    neutral:  { bg: "var(--amber-light)", color: "var(--amber)", label: "~EV" },
    negative: { bg: "var(--red-light)",   color: "var(--red)",   label: "EV−" },
  }[ev];
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: "2px 6px",
      borderRadius: 4, background: colors.bg, color: colors.color,
      letterSpacing: "0.3px",
    }}>
      {colors.label} {Math.round(odds * 100)}%
    </span>
  );
}

function DifficultyStars({ n }: { n: number }) {
  return (
    <span style={{ fontSize: 11, letterSpacing: 1 }}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} style={{ color: i < n ? "var(--orange)" : "var(--border)" }}>★</span>
      ))}
    </span>
  );
}

// ─── Rolling animation ────────────────────────────────────────────────────────

function DiceRoller({
  target, needed, onDone
}: { target: number; needed: number; onDone: (roll: number) => void }) {
  const [display, setDisplay] = useState(50);
  const [done, setDone] = useState(false);
  const iterations = useRef(0);
  const maxIter = 30;

  useEffect(() => {
    const interval = setInterval(() => {
      iterations.current++;
      if (iterations.current < maxIter) {
        setDisplay(Math.floor(Math.random() * 100) + 1);
      } else {
        clearInterval(interval);
        setDisplay(target);
        setDone(true);
        setTimeout(() => onDone(target), 600);
      }
    }, iterations.current < 20 ? 60 : 120);
    return () => clearInterval(interval);
  }, []);

  const won = target <= needed;

  return (
    <div style={{ textAlign: "center", padding: "32px 0" }}>
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
        rolling for your raid…
      </div>

      {/* Oracle orb */}
      <div style={{
        width: 120, height: 120,
        borderRadius: "50%",
        margin: "0 auto 20px",
        background: done
          ? won ? "var(--green)" : "var(--red)"
          : "linear-gradient(135deg, var(--orange) 0%, var(--amber) 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 48,
        fontWeight: 700,
        color: "#fff",
        boxShadow: done
          ? won
            ? "0 0 40px rgba(46,160,67,0.5)"
            : "0 0 40px rgba(217,59,59,0.5)"
          : "0 0 40px rgba(232,98,26,0.4)",
        transition: "all 0.5s ease",
        animation: done ? "none" : "pulse 0.5s ease infinite alternate",
      }}>
        {display}
      </div>

      <div style={{ fontSize: 13, color: "var(--muted)" }}>
        need ≤ <strong style={{ color: "var(--text)" }}>{needed}</strong> to win
      </div>

      <style>{`
        @keyframes pulse {
          from { transform: scale(1); }
          to   { transform: scale(1.06); }
        }
      `}</style>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function VikingRaid() {
  const { publicKey } = useWallet();
  const [phase,   setPhase]   = useState<Phase>("lobby");
  const [player,  setPlayer]  = useState<PlayerState>({
    level: 1, xp: 0, xpToNext: 800,
    raids: 0, wins: 0, raidTokens: 0, ship: null,
  });
  const [selected, setSelected] = useState<RaidTarget | null>(null);
  const [result,   setResult]   = useState<RaidResult | null>(null);
  const [loreFocus, setLoreFocus] = useState<RaidTarget | null>(null);

  // Compute current win odds for selected target
  const winOdds = selected
    ? calcWinOdds(selected.winOdds, player.level, player.ship)
    : 0;
  const needed = Math.round(winOdds * 100); // roll must be ≤ needed

  const handleRoll = useCallback((roll: number) => {
    if (!selected) return;

    const won     = roll <= needed;
    const mult    = player.ship ? SHIP_BONUSES[player.ship].rewardMult : 1;
    const reward  = won ? Math.round(selected.baseReward * mult) : 0;
    const xpGain  = won ? Math.round(selected.difficulty * 120) : Math.round(selected.difficulty * 30);

    const newXp     = player.xp + xpGain;
    const { level: newLevel, xpToNext } = levelFromXp(newXp);

    setResult({
      won, roll, needed, reward, xp: xpGain,
      message: won
        ? ["Valhöll awaits!", "Skál!", "The gods smiled on you.", "Your name will be sung!"][Math.floor(Math.random() * 4)]
        : ["Odin looks away.", "The defenders held.", "Retreat — and return stronger.", "Skál next time."][Math.floor(Math.random() * 4)],
    });

    setPlayer(prev => ({
      ...prev,
      level:      newLevel,
      xp:         newXp,
      xpToNext,
      raids:      prev.raids + 1,
      wins:       prev.wins + (won ? 1 : 0),
      raidTokens: prev.raidTokens + reward,
    }));

    setPhase("result");
  }, [selected, needed, player]);

  // ── Lobby ─────────────────────────────────────────────────────────────────
  if (phase === "lobby") {
    return (
      <div style={{ fontFamily: "var(--font-sans, sans-serif)" }}>
        {/* Header */}
        <div style={{
          background: "linear-gradient(135deg, #1A0E06 0%, #2E1A08 100%)",
          borderRadius: 16, padding: "28px 20px", marginBottom: 20,
          position: "relative", overflow: "hidden",
        }}>
          {/* Background runes */}
          <div style={{
            position: "absolute", top: 0, right: 0, bottom: 0, left: 0,
            display: "flex", flexWrap: "wrap", gap: 20,
            padding: 20, opacity: 0.06, fontSize: 28,
            pointerEvents: "none", overflow: "hidden",
          }}>
            {["ᚠ","ᚢ","ᚦ","ᚨ","ᚱ","ᚲ","ᚷ","ᚹ","ᚺ","ᚾ","ᛁ","ᛃ","ᛇ","ᛈ","ᛉ","ᛊ","ᛏ","ᛒ","ᛖ","ᛗ","ᛚ","ᛜ","ᛞ","ᛟ"].map((r, i) => (
              <span key={i}>{r}</span>
            ))}
          </div>

          <div style={{ position: "relative" }}>
            <div style={{ fontSize: 11, color: "#C87040", letterSpacing: "1.5px", fontWeight: 600, marginBottom: 6 }}>
              DEVGAME · SOLANA
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#FFF0E0", marginBottom: 6, letterSpacing: "-0.5px" }}>
              ⚔️ Viking Raid
            </div>
            <div style={{ fontSize: 13, color: "#A07850", lineHeight: 1.5, maxWidth: 300 }}>
              Choose a target. Roll the oracle. Earn $RAID tokens — or face defeat with honor.
            </div>
          </div>
        </div>

        {/* Player stats */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 20,
        }}>
          {[
            { label: "level", value: player.level, emoji: "⚔️" },
            { label: "raids", value: player.raids,  emoji: "🛡" },
            { label: "wins",  value: player.wins,   emoji: "🏆" },
            { label: "$RAID", value: player.raidTokens, emoji: "🪙" },
          ].map(s => (
            <div key={s.label} style={{
              background: "var(--surface)", borderRadius: 10,
              padding: "12px 8px", textAlign: "center",
            }}>
              <div style={{ fontSize: 18, marginBottom: 2 }}>{s.emoji}</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{s.value}</div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* XP bar */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginBottom: 5 }}>
            <span>XP progress to level {player.level + 1}</span>
            <span>{player.xpToNext} XP needed</span>
          </div>
          <div style={{ height: 6, background: "var(--surface)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 3,
              background: "linear-gradient(90deg, var(--orange), var(--amber))",
              width: `${Math.min(100, 100 - (player.xpToNext / (player.level * 800)) * 100)}%`,
              transition: "width 0.5s ease",
            }} />
          </div>
        </div>

        {/* Ship NFT slot */}
        <div style={{
          border: "0.5px dashed var(--border)", borderRadius: 10, padding: 12,
          marginBottom: 20, display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 8,
            background: player.ship ? "var(--orange-light)" : "var(--surface)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20,
          }}>
            {player.ship ? SHIP_BONUSES[player.ship].emoji : "⛵"}
          </div>
          <div style={{ flex: 1 }}>
            {player.ship ? (
              <>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{SHIP_BONUSES[player.ship].label}</div>
                <div style={{ fontSize: 11, color: "var(--orange)" }}>
                  +{(SHIP_BONUSES[player.ship].winBonus * 100).toFixed(0)}% win rate · {SHIP_BONUSES[player.ship].rewardMult}× rewards
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 13, color: "var(--muted)" }}>No ship NFT equipped</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>Mint a ship to boost your odds</div>
              </>
            )}
          </div>
          {/* Demo ship equip for testing */}
          {!player.ship && (
            <button
              onClick={() => setPlayer(p => ({ ...p, ship: "drakkar" }))}
              style={{
                fontSize: 11, padding: "5px 10px", borderRadius: 6,
                border: "0.5px solid var(--border)", background: "var(--surface)",
                color: "var(--muted)", cursor: "pointer",
              }}
            >
              demo equip
            </button>
          )}
        </div>

        <button
          onClick={() => setPhase("select")}
          style={{
            width: "100%", padding: 14,
            borderRadius: 10, border: "none",
            background: "linear-gradient(135deg, var(--orange) 0%, var(--orange-dark) 100%)",
            color: "#fff", fontSize: 15, fontWeight: 600,
            cursor: "pointer", letterSpacing: "-0.2px",
          }}
        >
          choose your target →
        </button>
      </div>
    );
  }

  // ── Target selection ──────────────────────────────────────────────────────
  if (phase === "select") {
    return (
      <div style={{ fontFamily: "var(--font-sans, sans-serif)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button
            onClick={() => setPhase("lobby")}
            style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 20, cursor: "pointer", padding: 4 }}
          >←</button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Choose Your Target</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Level {player.level} raider · {player.ship ? SHIP_BONUSES[player.ship].label : "no ship"}</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {RAID_TARGETS.map(t => {
            const odds = calcWinOdds(t.winOdds, player.level, player.ship);
            return (
              <div
                key={t.id}
                onClick={() => { setSelected(t); setPhase("rolling"); }}
                style={{
                  border: `0.5px solid var(--border)`,
                  borderRadius: 12, padding: "14px 16px",
                  cursor: "pointer", background: "var(--background)",
                  transition: "all 0.15s",
                  display: "flex", gap: 12, alignItems: "center",
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--orange)")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
              >
                <div style={{ fontSize: 32 }}>{t.emoji}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{t.name}</span>
                    <DifficultyStars n={t.difficulty} />
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>{t.region}</div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <EVBadge odds={odds} />
                    <span style={{ fontSize: 11, color: "var(--teal-dark)", fontWeight: 500 }}>
                      🪙 {t.baseReward} $RAID
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); setLoreFocus(t); setPhase("lore"); }}
                      style={{
                        fontSize: 10, padding: "2px 7px", borderRadius: 4,
                        border: "0.5px solid var(--border)", background: "none",
                        color: "var(--muted)", cursor: "pointer",
                      }}
                    >
                      📜 lore
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: 20, color: "var(--muted)" }}>→</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Rolling / VRF reveal ──────────────────────────────────────────────────
  if (phase === "rolling" && selected) {
    const roll = Math.floor(Math.random() * 100) + 1;
    return (
      <div style={{ fontFamily: "var(--font-sans, sans-serif)" }}>
        <div style={{ textAlign: "center", marginBottom: 4 }}>
          <div style={{ fontSize: 22 }}>{selected.emoji}</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{selected.name}</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>{selected.region}</div>
        </div>

        <div style={{
          background: "var(--surface)", borderRadius: 10, padding: "8px 14px",
          marginBottom: 20, textAlign: "center", fontSize: 11, color: "var(--muted)",
        }}>
          Verifiable randomness · on-chain settlement · result in ~1 second
        </div>

        <DiceRoller
          target={roll}
          needed={needed}
          onDone={handleRoll}
        />
      </div>
    );
  }

  // ── Result ────────────────────────────────────────────────────────────────
  if (phase === "result" && result && selected) {
    return (
      <div style={{ fontFamily: "var(--font-sans, sans-serif)" }}>
        {/* Banner */}
        <div style={{
          borderRadius: 16, padding: "28px 20px", marginBottom: 20, textAlign: "center",
          background: result.won
            ? "linear-gradient(135deg, #0A2E14 0%, #123D1E 100%)"
            : "linear-gradient(135deg, #2E0A0A 0%, #3D1212 100%)",
        }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>
            {result.won ? "⚔️" : "🛡"}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#F0EDE8", marginBottom: 4 }}>
            {result.won ? "Victory!" : "Defeat"}
          </div>
          <div style={{ fontSize: 13, color: result.won ? "#80D0A0" : "#D08080" }}>
            {result.message}
          </div>
        </div>

        {/* Roll breakdown */}
        <div style={{
          background: "var(--surface)", borderRadius: 12, padding: 16, marginBottom: 16,
        }}>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>Roll breakdown</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {[
              { label: "you rolled", value: result.roll, highlight: false },
              { label: "needed ≤",   value: result.needed, highlight: false },
              { label: "outcome",    value: result.won ? "WIN" : "LOSS", highlight: true },
            ].map(s => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>{s.label}</div>
                <div style={{
                  fontSize: 20, fontWeight: 700,
                  color: s.highlight
                    ? result.won ? "var(--green)" : "var(--red)"
                    : "var(--text)",
                }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Rewards */}
        {result.won && (
          <div style={{
            background: "var(--green-light)", borderRadius: 12, padding: 14, marginBottom: 16,
            display: "flex", gap: 16, justifyContent: "center",
          }}>
            {[
              { label: "$RAID earned", value: `+${result.reward}`, color: "var(--green)" },
              { label: "XP gained",    value: `+${result.xp}`,    color: "var(--teal)" },
            ].map(s => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Historical fact */}
        <div style={{
          border: "0.5px solid var(--border)", borderRadius: 12,
          padding: 14, marginBottom: 20,
          background: "var(--surface)",
        }}>
          <div style={{ fontSize: 11, color: "var(--orange)", fontWeight: 600, marginBottom: 6 }}>
            📜 HISTORICAL RECORD
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
            {selected.historicalFact}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button
            onClick={() => setPhase("lobby")}
            style={{
              padding: 12, borderRadius: 10, border: "0.5px solid var(--border)",
              background: "var(--surface)", color: "var(--text)", fontSize: 13, cursor: "pointer",
            }}
          >
            ← back to camp
          </button>
          <button
            onClick={() => setPhase("select")}
            style={{
              padding: 12, borderRadius: 10, border: "none",
              background: "var(--orange)", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer",
            }}
          >
            raid again →
          </button>
        </div>
      </div>
    );
  }

  // ── Lore panel ────────────────────────────────────────────────────────────
  if (phase === "lore" && loreFocus) {
    return (
      <div style={{ fontFamily: "var(--font-sans, sans-serif)" }}>
        <button
          onClick={() => setPhase("select")}
          style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 18, cursor: "pointer", marginBottom: 16 }}
        >
          ← back
        </button>
        <div style={{ fontSize: 40, marginBottom: 8 }}>{loreFocus.emoji}</div>
        <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 2 }}>{loreFocus.name}</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 20 }}>{loreFocus.region}</div>

        <div style={{
          background: "var(--surface)", borderRadius: 12, padding: 16, marginBottom: 14,
        }}>
          <div style={{ fontSize: 11, color: "var(--orange)", fontWeight: 600, marginBottom: 8 }}>THE RAID</div>
          <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.7 }}>{loreFocus.lore}</div>
        </div>

        <div style={{
          border: "0.5px solid var(--orange)", borderRadius: 12, padding: 16, marginBottom: 20,
          background: "var(--orange-light)",
        }}>
          <div style={{ fontSize: 11, color: "var(--orange)", fontWeight: 600, marginBottom: 8 }}>
            📚 VERIFIED HISTORY
          </div>
          <div style={{ fontSize: 13, color: "var(--orange-dark)", lineHeight: 1.7 }}>
            {loreFocus.historicalFact}
          </div>
        </div>

        <button
          onClick={() => { setSelected(loreFocus); setPhase("rolling"); }}
          style={{
            width: "100%", padding: 13, borderRadius: 10, border: "none",
            background: "var(--orange)", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer",
          }}
        >
          raid {loreFocus.name} →
        </button>
      </div>
    );
  }

  return null;
}
