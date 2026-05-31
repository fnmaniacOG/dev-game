import { useState, useEffect } from "react";
import { ConnectionProvider, WalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { WalletModalProvider, WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { clusterApiUrl } from "@solana/web3.js";

import ExplorePanel   from "./components/ExplorePanel";
import PlayPanel      from "./components/PlayPanel";
import TournamentPanel from "./components/TournamentPanel";
import LaunchPanel    from "./components/LaunchPanel";
import PortfolioPanel from "./components/PortfolioPanel";
import DeployWizard   from "./components/DeployWizard";

// ─── Design tokens ────────────────────────────────────────────────────────────
// All components reference these CSS variables — change here to retheme globally


// ─── Tab config ───────────────────────────────────────────────────────────────

type Tab = "explore" | "play" | "tournaments" | "launch" | "portfolio";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "explore",     label: "explore",     icon: "🗺" },
  { id: "play",        label: "play",        icon: "🎮" },
  { id: "tournaments", label: "prizes",      icon: "🏆" },
  { id: "launch",      label: "launch",      icon: "🚀" },
  { id: "portfolio",   label: "portfolio",   icon: "💼" },
];

// ─── Header ───────────────────────────────────────────────────────────────────

function Header({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const { publicKey } = useWallet();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 100,
      background: scrolled ? "rgba(20,18,16,0.95)" : "var(--background)",
      backdropFilter: scrolled ? "blur(12px)" : "none",
      borderBottom: `0.5px solid ${scrolled ? "var(--border)" : "transparent"}`,
      transition: "all 0.2s ease",
    }}>
      <div style={{
        maxWidth: 960, margin: "0 auto",
        padding: "0 16px",
        height: 56,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        {/* Logo */}
        <div
          onClick={() => setTab("explore")}
          style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}
        >
          <div style={{
            width: 28, height: 28,
            background: "linear-gradient(135deg, var(--orange) 0%, var(--amber) 100%)",
            borderRadius: 7,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14,
          }}>🎮</div>
          <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.3px" }}>
            dev<span style={{ color: "var(--orange)" }}>game</span>
          </span>
        </div>

        {/* Desktop nav */}
        <nav style={{ display: "flex", gap: 2 }} className="desktop-nav">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "none",
                background: tab === t.id ? "var(--orange-light)" : "transparent",
                color: tab === t.id ? "var(--orange)" : "var(--muted)",
                fontSize: 13,
                fontWeight: tab === t.id ? 500 : 400,
                transition: "all 0.15s",
              }}
            >
              <span style={{ marginRight: 4 }}>{t.icon}</span>{t.label}
            </button>
          ))}
        </nav>

        {/* Wallet */}
        <WalletMultiButton />
      </div>
    </header>
  );
}

// ─── Main content ─────────────────────────────────────────────────────────────

function AppContent() {
  const [selectedGame, setSelectedGame] = useState<{id:string;type:string}|null>(null);
  const [tab, setTab] = useState<Tab>("explore");
  const [launchMode, setLaunchMode] = useState(false);

  return (
    <div style={{ minHeight: "100vh" }}>
      <Header tab={tab} setTab={setTab} />

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px 80px" }}>
        {tab === "explore"     && <ExplorePanel onLaunch={() => { setTab("launch"); setLaunchMode(true); }} onGameSelect={(id, type) => { setSelectedGame({id, type}); setTab("play"); }} />}
        {tab === "play"        && <PlayPanel selectedGame={selectedGame} />}
        {tab === "tournaments" && <TournamentPanel />}
        {tab === "launch"      && <LaunchPanel />}
        {tab === "portfolio"   && <PortfolioPanel />}
      </main>
    </div>
  );
}

// ─── Root with providers ──────────────────────────────────────────────────────

const wallets = [new PhantomWalletAdapter(), new SolflareWalletAdapter()];
const endpoint = clusterApiUrl("devnet");

export default function App() {
  return (
    <>
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>
            <AppContent />
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </>
  );
}
