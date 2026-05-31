import { useState } from "react";
import VikingRaid  from "./VikingRaid";
import CryptoQuiz  from "./CryptoQuiz";
import GemFlip     from "./GemFlip";
import DragonKeep  from "./DragonKeep";
import RealmWars   from "./RealmWars";

// ─── Game registry ────────────────────────────────────────────────────────────

type GameId = "viking-raid" | "crypto-quiz" | "gem-flip" | "dragon-keep" | "realm-wars";

interface GameEntry {
  id:          GameId;
  name:        string;
  emoji:       string;
  token:       string;
  type:        string;
  description: string;
  players:     number;
  tvl:         string;
  ev:          "positive" | "neutral" | "negative" | "transparent";
  status:      "live" | "beta" | "new";
  color:       string;
}

const GAMES: GameEntry[] = [
  {
    id: "viking-raid",
    name: "Viking Raid",
    emoji: "⚔️",
    token: "$RAID",
    type: "RPG · Educational",
    description: "Raid historical targets, earn $RAID tokens. Skill-based odds scale with level and ship NFT. Norse history unlocked with each raid.",
    players: 4821,
    tvl: "12.4 SOL",
    ev: "positive",
    status: "live",
    color: "#D85A30",
  },
  {
    id: "crypto-quiz",
    name: "Crypto Quiz",
    emoji: "🎓",
    token: "$QUIZ",
    type: "Puzzle · Educational",
    description: "Test your DeFi, Solana, and trading knowledge. Streak bonuses for consecutive correct answers. All answers explained.",
    players: 3204,
    tvl: "8.1 SOL",
    ev: "positive",
    status: "live",
    color: "#0FA9A0",
  },
  {
    id: "dragon-keep",
    name: "Dragon Keep",
    emoji: "🐉",
    token: "$KEEP",
    type: "RPG · Turn-based",
    description: "Turn-based dungeon crawler. 4 character classes, 4 dungeons, full combat system. Earn $KEEP and rare Dragon NFTs.",
    players: 2180,
    tvl: "6.3 SOL",
    ev: "positive",
    status: "live",
    color: "#2EA043",
  },
  {
    id: "realm-wars",
    name: "Realm Wars",
    emoji: "🏰",
    token: "$REALM",
    type: "Strategy · Guild",
    description: "Territory control on a 5×5 map. Train troops, conquer lands, build guilds. Earn $REALM from controlled territories.",
    players: 1450,
    tvl: "4.9 SOL",
    ev: "positive",
    status: "beta",
    color: "#D4860A",
  },
  {
    id: "gem-flip",
    name: "GemFlip",
    emoji: "💎",
    token: "$GEM",
    type: "Ponzi · Transparent",
    description: "Transparent ponzi mechanics with fully disclosed house edge. All odds are on-chain and immutable. Educational disclosure required.",
    players: 892,
    tvl: "2.2 SOL",
    ev: "transparent",
    status: "live",
    color: "#D93B3B",
  },
];

// ─── EV badge ─────────────────────────────────────────────────────────────────

function EVBadge({ ev }: { ev: GameEntry["ev"] }) {
  const config = {
    positive:    { label: "EV+",  bg: "var(--green-light)",  color: "var(--green)" },
    neutral:     { label: "~EV",  bg: "var(--amber-light)",  color: "var(--amber)" },
    negative:    { label: "EV−",  bg: "var(--red-light)",    color: "var(--red)" },
    transparent: { label: "⚠ Ponzi", bg: "var(--red-light)", color: "var(--red)" },
  }[ev];
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: "2px 7px",
      borderRadius: 4, background: config.bg, color: config.color,
    }}>
      {config.label}
    </span>
  );
}

function StatusBadge({ status }: { status: GameEntry["status"] }) {
  const config = {
    live: { label: "live",  color: "var(--green)" },
    beta: { label: "beta",  color: "var(--amber)" },
    new:  { label: "new",   color: "var(--teal)" },
  }[status];
  return (
    <span style={{
      fontSize: 9, fontWeight: 600, padding: "2px 6px",
      borderRadius: 4, background: "var(--surface-2)", color: config.color,
      textTransform: "uppercase", letterSpacing: "0.5px",
    }}>
      {config.label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PlayPanel({ selectedGame }: { selectedGame?: { id: string; type: string } | null }) {
  const [active, setActive] = useState<GameId | null>(selectedGame?.id as GameId ?? null);

  // Render active game
  if (active === "viking-raid")  return <GameWrapper game={GAMES[0]} onBack={() => setActive(null)}><VikingRaid /></GameWrapper>;
  if (active === "crypto-quiz")  return <GameWrapper game={GAMES[1]} onBack={() => setActive(null)}><CryptoQuiz /></GameWrapper>;
  if (active === "dragon-keep")  return <GameWrapper game={GAMES[2]} onBack={() => setActive(null)}><DragonKeep /></GameWrapper>;
  if (active === "realm-wars")   return <GameWrapper game={GAMES[3]} onBack={() => setActive(null)}><RealmWars /></GameWrapper>;
  if (active === "gem-flip")     return <GameWrapper game={GAMES[4]} onBack={() => setActive(null)}><GemFlip /></GameWrapper>;

  // Game list
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Play</div>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>
          {GAMES.length} games live · all liquidity locked · odds verified on-chain
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {GAMES.map(game => (
          <div
            key={game.id}
            onClick={() => setActive(game.id)}
            style={{
              border: "0.5px solid var(--border)",
              borderRadius: 14, padding: "14px 16px",
              cursor: "pointer", background: "var(--background)",
              transition: "all 0.15s",
              display: "flex", gap: 14, alignItems: "flex-start",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = game.color;
              e.currentTarget.style.boxShadow = `0 0 0 1px ${game.color}20`;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            {/* Icon */}
            <div style={{
              width: 48, height: 48, borderRadius: 12, flexShrink: 0,
              background: `${game.color}18`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 24,
            }}>
              {game.emoji}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{game.name}</span>
                <StatusBadge status={game.status} />
                <EVBadge ev={game.ev} />
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>
                {game.type} · {game.token}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, marginBottom: 8 }}>
                {game.description}
              </div>
              <div style={{ display: "flex", gap: 14, fontSize: 11, color: "var(--muted)" }}>
                <span>👥 {game.players.toLocaleString()} players</span>
                <span>💧 {game.tvl} TVL</span>
              </div>
            </div>

            <div style={{ fontSize: 18, color: "var(--muted)", flexShrink: 0, paddingTop: 12 }}>→</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Game wrapper ─────────────────────────────────────────────────────────────

function GameWrapper({
  game, onBack, children
}: { game: GameEntry; onBack: () => void; children: React.ReactNode }) {
  return (
    <div>
      {/* Game header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, marginBottom: 20,
        paddingBottom: 16, borderBottom: "0.5px solid var(--border)",
      }}>
        <button
          onClick={onBack}
          style={{
            background: "none", border: "none",
            color: "var(--muted)", fontSize: 20, cursor: "pointer", padding: 4,
          }}
        >←</button>
        <div style={{
          width: 36, height: 36, borderRadius: 9,
          background: `${game.color}18`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18,
        }}>
          {game.emoji}
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{game.name}</div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>{game.type} · {game.token}</div>
        </div>
      </div>

      {/* Game content */}
      {children}
    </div>
  );
}
