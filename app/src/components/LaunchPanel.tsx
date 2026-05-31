import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import DeployWizard from "./DeployWizard";

// Re-export DeployWizard as the main launch tab content
// This file wraps it with the landing state and CTA for new creators

interface GameTypePreset {
  id:          string;
  name:        string;
  emoji:       string;
  description: string;
  tokenType:   "ft" | "nft" | "both";
  ev:          string;
  example:     string;
  color:       string;
}

const GAME_TYPES: GameTypePreset[] = [
  {
    id: "rpg", name: "RPG", emoji: "⚔️",
    description: "Dungeon crawlers, raid games, adventure quests. Skill-based mechanics mean EV+ for engaged players.",
    tokenType: "both", ev: "EV+", example: "Viking Raid, Dragon Keep",
    color: "#D85A30",
  },
  {
    id: "strategy", name: "Strategy", emoji: "🏰",
    description: "Territory control, guild wars, resource management. Players earn tokens from owned assets.",
    tokenType: "both", ev: "EV+", example: "Realm Wars",
    color: "#D4860A",
  },
  {
    id: "quiz", name: "Puzzle / Quiz", emoji: "🎓",
    description: "Educational games with built-in financial rewards. Best distribution model for viral growth.",
    tokenType: "ft", ev: "EV+", example: "Crypto Quiz",
    color: "#0FA9A0",
  },
  {
    id: "minigame", name: "Mini Game", emoji: "🎮",
    description: "Flip, guess, predict. Fast rounds, skill-based odds, high repeat play.",
    tokenType: "ft", ev: "~EV", example: "CoinFlip, Lucky Draw",
    color: "#2EA043",
  },
  {
    id: "ponzi", name: "Ponzi (Transparent)", emoji: "💎",
    description: "Ponzi mechanics with mandatory on-chain disclosure. Players see exact odds and pool health.",
    tokenType: "ft", ev: "⚠ Neg", example: "GemFlip",
    color: "#D93B3B",
  },
];

export default function LaunchPanel() {
  const { publicKey } = useWallet();
  const [step, setStep] = useState<"landing" | "wizard">("landing");
  const [selectedType, setSelectedType] = useState<string | null>(null);

  if (step === "wizard") {
    return (
      <div>
        <button
          onClick={() => setStep("landing")}
          style={{
            background: "none", border: "none", color: "var(--muted)",
            fontSize: 13, cursor: "pointer", marginBottom: 16, padding: 0,
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          ← back to launch
        </button>
        <DeployWizard key={selectedType} presetType={selectedType} />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #0A1A0A 0%, #1A2E1A 100%)",
        borderRadius: 16, padding: "24px 20px", marginBottom: 24,
      }}>
        <div style={{ fontSize: 11, color: "#4ACA80", letterSpacing: "1.5px", fontWeight: 600, marginBottom: 6 }}>
          LAUNCH YOUR GAME
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, color: "#E8F8E8", marginBottom: 6 }}>
          🚀 From idea to live game<br />in 10 minutes.
        </div>
        <div style={{ fontSize: 13, color: "#608060", lineHeight: 1.6 }}>
          AI generates your game design + tokenomics. One transaction deploys everything: token mint, LP lock, game state.
        </div>
      </div>

      {/* How it works */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 24,
      }}>
        {[
          { step: "1", title: "Describe it", body: "One sentence. AI fills in the rest — game mechanics, tokenomics, NFT design.", emoji: "✍️" },
          { step: "2", title: "Customize",   body: "Review and tweak the AI output. Adjust allocations, game rules, lock duration.", emoji: "⚙️" },
          { step: "3", title: "Deploy",      body: "One wallet confirmation. Token minted, LP locked, game live on devnet.", emoji: "⚡" },
          { step: "4", title: "Earn",        body: "Earn from house edge. 70% of NFT royalties. 1% of referred creator fees.", emoji: "🪙" },
        ].map(s => (
          <div key={s.step} style={{
            background: "var(--surface)", borderRadius: 12, padding: 14,
          }}>
            <div style={{ fontSize: 20, marginBottom: 8 }}>{s.emoji}</div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{s.title}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5 }}>{s.body}</div>
          </div>
        ))}
      </div>

      {/* Game type picker */}
      <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, marginBottom: 12, letterSpacing: "0.5px" }}>
        CHOOSE YOUR GAME TYPE
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
        {GAME_TYPES.map(gt => (
          <div
            key={gt.id}
            onClick={() => setSelectedType(gt.id)}
            style={{
              border: `${selectedType === gt.id ? "2px" : "0.5px"} solid ${selectedType === gt.id ? gt.color : "var(--border)"}`,
              borderRadius: 12, padding: "12px 14px", cursor: "pointer",
              background: selectedType === gt.id ? `${gt.color}10` : "var(--background)",
              transition: "all 0.15s",
              display: "flex", gap: 12, alignItems: "center",
            }}
          >
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: `${gt.color}18`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20,
            }}>{gt.emoji}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 3 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{gt.name}</span>
                <span style={{
                  fontSize: 9, padding: "2px 6px", borderRadius: 4, fontWeight: 600,
                  background: gt.ev === "EV+" ? "var(--green-light)" : gt.ev.includes("⚠") ? "var(--red-light)" : "var(--amber-light)",
                  color: gt.ev === "EV+" ? "var(--green)" : gt.ev.includes("⚠") ? "var(--red)" : "var(--amber)",
                }}>{gt.ev}</span>
                <span style={{ fontSize: 9, color: "var(--muted)" }}>
                  {gt.tokenType === "both" ? "FT + NFT" : gt.tokenType.toUpperCase()}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>{gt.description}</div>
              <div style={{ fontSize: 10, color: "var(--muted)" }}>examples: {gt.example}</div>
            </div>
            {selectedType === gt.id && (
              <div style={{ fontSize: 20, color: gt.color }}>✓</div>
            )}
          </div>
        ))}
      </div>

      {/* CTA */}
      <button
        onClick={() => setStep("wizard")}
        style={{
          width: "100%", padding: 14, borderRadius: 10, border: "none",
          background: selectedType ? "var(--green)" : "var(--surface)",
          color: selectedType ? "#fff" : "var(--muted)",
          fontSize: 15, fontWeight: 600,
          cursor: selectedType ? "pointer" : "default",
          transition: "all 0.2s",
        }}
      >
        {selectedType ? `start building →` : "select a game type to continue"}
      </button>

      {/* Creator economics */}
      <div style={{
        marginTop: 24, padding: 16, background: "var(--surface)", borderRadius: 12,
        fontSize: 12, color: "var(--muted)", lineHeight: 1.7,
      }}>
        <strong style={{ color: "var(--text)", display: "block", marginBottom: 6 }}>Creator economics</strong>
        You earn from your game's house edge (you set it, up to 20%) · NFT royalties split 70/30 (you/players) · Refer a creator: earn 1% of their protocol fees for 12 months · Apply for liquidity matching: protocol matches your LP up to 5 SOL for vetted games
      </div>
    </div>
  );
}
