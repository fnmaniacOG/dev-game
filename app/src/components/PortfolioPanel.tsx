import { useWallet } from "@solana/wallet-adapter-react";
import { useTokenBalances, useSolBalance } from "../hooks/useOnChainData";

interface TokenHolding {
  token:     string;
  game:      string;
  emoji:     string;
  balance:   number;
  usdValue:  number;
  change24h: number;
  staked:    number;
  color:     string;
}

interface NFTHolding {
  name:      string;
  game:      string;
  emoji:     string;
  rarity:    "common" | "rare" | "epic" | "legendary";
  winBonus:  string;
  color:     string;
}

const MOCK_TOKENS: TokenHolding[] = [
  { token: "$RAID",  game: "Viking Raid",  emoji: "⚔️", balance: 4820, usdValue: 48.20, change24h: +12.4, staked: 1000, color: "#D85A30" },
  { token: "$QUIZ",  game: "Crypto Quiz",  emoji: "🎓", balance: 2340, usdValue: 23.40, change24h: -2.1,  staked: 0,    color: "#0FA9A0" },
  { token: "$KEEP",  game: "Dragon Keep",  emoji: "🐉", balance: 890,  usdValue: 8.90,  change24h: +4.7,  staked: 500,  color: "#2EA043" },
  { token: "$REALM", game: "Realm Wars",   emoji: "🏰", balance: 1200, usdValue: 12.00, change24h: +1.2,  staked: 0,    color: "#D4860A" },
];

const MOCK_NFTS: NFTHolding[] = [
  { name: "Drakkar #142", game: "Viking Raid", emoji: "🚢", rarity: "rare",      winBonus: "+6% win, 1.12× rewards", color: "#D85A30" },
  { name: "Fire Mage #7", game: "Dragon Keep", emoji: "🔥", rarity: "legendary", winBonus: "+9% win, 2× staking",    color: "#2EA043" },
];

const RARITY_COLORS: Record<string, string> = {
  common:    "var(--muted)",
  rare:      "var(--teal)",
  epic:      "#9B59B6",
  legendary: "var(--orange)",
};

export default function PortfolioPanel() {
  const { publicKey, connect } = useWallet();

  if (!publicKey) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>💼</div>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Connect your wallet</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 24 }}>
          See your tokens, NFTs, staking positions, and earnings history
        </div>
      </div>
    );
  }

  const totalUsd = MOCK_TOKENS.reduce((s, t) => s + t.usdValue, 0);
  const totalStaked = MOCK_TOKENS.reduce((s, t) => s + t.staked, 0);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Portfolio</div>
        <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
          {publicKey.toString().slice(0, 8)}…{publicKey.toString().slice(-6)}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
        {[
          { label: "total value", value: `$${totalUsd.toFixed(2)}`, emoji: "💰" },
          { label: "staked",      value: `${totalStaked} tokens`,    emoji: "🔒" },
          { label: "NFTs owned",  value: MOCK_NFTS.length,           emoji: "🃏" },
          { label: "games played", value: 5,                          emoji: "🎮" },
        ].map(s => (
          <div key={s.label} style={{
            background: "var(--surface)", borderRadius: 12, padding: "14px 16px",
            display: "flex", gap: 12, alignItems: "center",
          }}>
            <div style={{ fontSize: 24 }}>{s.emoji}</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tokens */}
      <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, marginBottom: 12, letterSpacing: "0.5px" }}>
        TOKENS
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
        {MOCK_TOKENS.map(t => (
          <div key={t.token} style={{
            border: "0.5px solid var(--border)", borderRadius: 12,
            padding: "12px 14px", display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, background: `${t.color}18`,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
            }}>
              {t.emoji}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{t.token}</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>${t.usdValue.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                <span style={{ color: "var(--muted)" }}>{t.balance.toLocaleString()} · {t.staked > 0 ? `${t.staked} staked` : "none staked"}</span>
                <span style={{ color: t.change24h >= 0 ? "var(--green)" : "var(--red)", fontWeight: 500 }}>
                  {t.change24h >= 0 ? "+" : ""}{t.change24h}%
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* NFTs */}
      <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, marginBottom: 12, letterSpacing: "0.5px" }}>
        NFTs
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
        {MOCK_NFTS.map(n => (
          <div key={n.name} style={{
            border: `1.5px solid ${RARITY_COLORS[n.rarity]}`,
            borderRadius: 12, padding: 14,
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>{n.emoji}</div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{n.name}</div>
            <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6 }}>{n.game}</div>
            <div style={{
              fontSize: 9, fontWeight: 700, letterSpacing: "0.5px",
              color: RARITY_COLORS[n.rarity], marginBottom: 6,
              textTransform: "uppercase",
            }}>
              {n.rarity}
            </div>
            <div style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.5 }}>{n.winBonus}</div>
          </div>
        ))}
        <div style={{
          border: "0.5px dashed var(--border)", borderRadius: 12, padding: 14,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", color: "var(--muted)", fontSize: 12,
          flexDirection: "column", gap: 6,
        }}>
          <span style={{ fontSize: 24 }}>+</span>
          <span>mint NFT</span>
        </div>
      </div>

      {/* Earnings history */}
      <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, marginBottom: 12, letterSpacing: "0.5px" }}>
        RECENT EARNINGS
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {[
          { game: "⚔️ Viking Raid",  action: "Won raid vs Lindisfarne", earned: "+40 $RAID",  when: "2h ago",  color: "var(--green)" },
          { game: "🎓 Crypto Quiz",  action: "Completed DeFi course",   earned: "+85 $QUIZ",  when: "5h ago",  color: "var(--green)" },
          { game: "⚔️ Viking Raid",  action: "Lost raid vs Paris",       earned: "0 $RAID",    when: "6h ago",  color: "var(--muted)" },
          { game: "🐉 Dragon Keep",  action: "Cleared Dragon's Peak",   earned: "+200 $KEEP", when: "1d ago",  color: "var(--green)" },
          { game: "🔒 Staking",      action: "Claimed $KEEP yield",     earned: "+12 $KEEP",  when: "2d ago",  color: "var(--teal)" },
        ].map((e, i) => (
          <div key={i} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "8px 0", borderBottom: "0.5px solid var(--border)", fontSize: 12,
          }}>
            <div>
              <div style={{ fontWeight: 500, marginBottom: 1 }}>{e.action}</div>
              <div style={{ fontSize: 10, color: "var(--muted)" }}>{e.game} · {e.when}</div>
            </div>
            <div style={{ fontWeight: 600, color: e.color, fontFamily: "var(--font-mono)" }}>
              {e.earned}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
