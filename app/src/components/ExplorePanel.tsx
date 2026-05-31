import { useState } from "react";
import { useProtocolStats } from "../hooks/useOnChainData";

type GameType = "all" | "rpg" | "strategy" | "puzzle" | "ponzi" | "mini";

interface GameCard {
  id:          string;
  name:        string;
  emoji:       string;
  token:       string;
  type:        GameType;
  description: string;
  players:     number;
  tvl:         string;
  ev:          string;
  featured:    boolean;
  color:       string;
  lpLocked:    boolean;
  lockDays:    number;
}

const FEATURED_GAMES: GameCard[] = [
  { id: "viking-raid",  name: "Viking Raid",   emoji: "⚔️", token: "$RAID",  type: "rpg",      description: "Raid historical targets, earn $RAID. Skill-based odds. Norse history unlocked.", players: 4821, tvl: "12.4 SOL", ev: "EV+",        featured: true,  color: "#D85A30", lpLocked: true, lockDays: 365 },
  { id: "dragon-keep",  name: "Dragon Keep",   emoji: "🐉", token: "$KEEP",  type: "rpg",      description: "Turn-based dungeon RPG. 4 classes, 4 dungeons, rare Dragon NFTs.",              players: 2180, tvl: "6.3 SOL",  ev: "EV+",        featured: true,  color: "#2EA043", lpLocked: true, lockDays: 365 },
  { id: "realm-wars",   name: "Realm Wars",    emoji: "🏰", token: "$REALM", type: "strategy", description: "Territory control strategy. Train troops, build guilds, earn $REALM per turn.", players: 1450, tvl: "4.9 SOL",  ev: "EV+",        featured: true,  color: "#D4860A", lpLocked: true, lockDays: 180 },
  { id: "crypto-quiz",  name: "Crypto Quiz",   emoji: "🎓", token: "$QUIZ",  type: "puzzle",   description: "DeFi, Solana, trading, security. Earn $QUIZ for correct answers + streaks.",    players: 3204, tvl: "8.1 SOL",  ev: "EV+",        featured: false, color: "#0FA9A0", lpLocked: true, lockDays: 180 },
  { id: "gem-flip",     name: "GemFlip",       emoji: "💎", token: "$GEM",   type: "ponzi",    description: "Transparent ponzi. All odds disclosed on-chain. Educational disclosure required.", players: 892, tvl: "2.2 SOL",  ev: "⚠ Ponzi",   featured: false, color: "#D93B3B", lpLocked: true, lockDays: 180 },
];

const TYPE_LABELS: Record<GameType, string> = {
  all:      "All Games",
  rpg:      "RPG",
  strategy: "Strategy",
  puzzle:   "Puzzle",
  ponzi:    "Ponzi",
  mini:     "Mini Game",
};

export default function ExplorePanel({ onLaunch, onGameSelect }: { onLaunch?: () => void }) {
  const protocolStats = useProtocolStats();
  const [filter, setFilter] = useState<GameType>("all");
  const [search, setSearch] = useState("");

  const filtered = FEATURED_GAMES.filter(g => {
    const matchType = filter === "all" || g.type === filter;
    const matchSearch = !search || g.name.toLowerCase().includes(search.toLowerCase()) || g.token.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const featured = filtered.filter(g => g.featured);
  const rest     = filtered.filter(g => !g.featured);

  return (
    <div>
      {/* Hero */}
      <div style={{
        background: "linear-gradient(135deg, #1A0E06 0%, #2E1A08 100%)",
        borderRadius: 16, padding: "28px 20px", marginBottom: 24,
        position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: -20, right: -20,
          width: 180, height: 180, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(232,98,26,0.2) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
        <div style={{ position: "relative" }}>
          <div style={{ fontSize: 11, color: "#C87040", letterSpacing: "1.5px", fontWeight: 600, marginBottom: 8 }}>
            SOLANA GAME LAUNCHPAD
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#FFF0E0", marginBottom: 6, letterSpacing: "-0.5px" }}>
            Launch games.<br />Launch tokens.<br />
            <span style={{ color: "#E8621A" }}>Win together.</span>
          </div>
          <div style={{ fontSize: 13, color: "#907050", lineHeight: 1.6, marginBottom: 20, maxWidth: 320 }}>
            Every game has locked liquidity, on-chain odds, and player-first economics. No rug pulls. Ever.
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={onLaunch}
              style={{
                padding: "10px 20px", borderRadius: 9, border: "none",
                background: "var(--orange)", color: "#fff",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              🚀 launch a game
            </button>
            <div style={{
              padding: "10px 16px", borderRadius: 9,
              border: "0.5px solid rgba(255,255,255,0.1)",
              fontSize: 12, color: "#C07040",
            }}>
              🔒 LP always locked
            </div>
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
        gap: 8, marginBottom: 24,
      }}>
        {[
          { label: "games live",     value: String(protocolStats.totalGames) },
          { label: "total players",  value: protocolStats.totalPlayers > 1000 ? (protocolStats.totalPlayers/1000).toFixed(1)+"K" : String(protocolStats.totalPlayers) },
          { label: "rewards paid",   value: protocolStats.rewardsPaid > 1000000 ? (protocolStats.rewardsPaid/1000000).toFixed(1)+"M" : String(protocolStats.rewardsPaid) },
          { label: "TVL",            value: protocolStats.totalTVLSol.toFixed(1)+" SOL" },
        ].map(s => (
          <div key={s.label} style={{
            background: "var(--surface)", borderRadius: 10,
            padding: "12px 8px", textAlign: "center",
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--orange)" }}>{s.value}</div>
            <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Search + filter */}
      <div style={{ marginBottom: 20 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search games or tokens…"
          style={{
            width: "100%", padding: "10px 14px", borderRadius: 9,
            border: "0.5px solid var(--border)", background: "var(--surface)",
            color: "var(--text)", fontSize: 13, outline: "none",
            marginBottom: 10,
          }}
        />
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
          {(Object.keys(TYPE_LABELS) as GameType[]).map(t => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              style={{
                padding: "5px 12px", borderRadius: 20, flexShrink: 0,
                border: `${filter === t ? "2px" : "0.5px"} solid ${filter === t ? "var(--orange)" : "var(--border)"}`,
                background: filter === t ? "var(--orange-light)" : "var(--surface)",
                color: filter === t ? "var(--orange)" : "var(--muted)",
                fontSize: 12, fontWeight: filter === t ? 600 : 400, cursor: "pointer",
              }}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Featured */}
      {featured.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, marginBottom: 12, letterSpacing: "0.5px" }}>
            FEATURED
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
            {featured.map(g => <GameCard key={g.id} game={g} onSelect={onGameSelect} />)}
          </div>
        </>
      )}

      {/* All games */}
      {rest.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, marginBottom: 12, letterSpacing: "0.5px" }}>
            ALL GAMES
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rest.map(g => <GameCard key={g.id} game={g} onSelect={onGameSelect} />)}
          </div>
        </>
      )}

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted)", fontSize: 14 }}>
          No games match your search
        </div>
      )}
    </div>
  );
}

// ─── Game card ────────────────────────────────────────────────────────────────

function GameCard({ game, onSelect }: { game: GameCard; onSelect?: (id: string, type: string) => void }) {
  return (
    <div style={{
      border: "0.5px solid var(--border)", borderRadius: 14, padding: "14px 16px",
      background: "var(--background)", transition: "all 0.15s",
      display: "flex", gap: 14, alignItems: "flex-start",
      cursor: onSelect ? "pointer" : "default",
    }}
    onClick={() => onSelect?.(game.id, game.type)}
    onMouseEnter={e => {
      e.currentTarget.style.borderColor = game.color;
      e.currentTarget.style.transform = "translateY(-1px)";
      e.currentTarget.style.boxShadow = "var(--shadow)";
    }}
    onMouseLeave={e => {
      e.currentTarget.style.borderColor = "var(--border)";
      e.currentTarget.style.transform = "none";
      e.currentTarget.style.boxShadow = "none";
    }}
    >
      <div style={{
        width: 48, height: 48, borderRadius: 12, flexShrink: 0,
        background: `${game.color}18`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 22,
      }}>
        {game.emoji}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{game.name}</span>
          <span style={{
            fontSize: 9, padding: "2px 6px", borderRadius: 4, fontWeight: 600,
            background: game.ev.includes("⚠") ? "var(--red-light)" : "var(--green-light)",
            color: game.ev.includes("⚠") ? "var(--red)" : "var(--green)",
          }}>{game.ev}</span>
          <span style={{
            fontSize: 9, padding: "2px 6px", borderRadius: 4,
            background: "var(--surface-2)", color: "var(--muted)", fontWeight: 500,
          }}>🔒 {game.lockDays}d</span>
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>
          {TYPE_LABELS[game.type as GameType]} · {game.token}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, marginBottom: 8 }}>
          {game.description}
        </div>
        <div style={{ display: "flex", gap: 14, fontSize: 11, color: "var(--muted)" }}>
          <span>👥 {game.players.toLocaleString()}</span>
          <span>💧 {game.tvl}</span>
        </div>
      </div>
    </div>
  );
}
