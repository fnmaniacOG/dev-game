import { useState } from "react";
import { useDeployment, type DeploymentConfig } from "../lib/deployment-bundle";
import type { GameType, TokenAllocation } from "../lib/types";
import { DEFAULT_ALLOCATIONS, GAME_TYPE_LABELS } from "../lib/types";

// ─────────────────────────────────────────────────────────────────────────────
//  DeployWizard — linear 3-step wizard that ends in ONE wallet confirm
//
//  Step 1: game basics (name, type, educational)
//  Step 2: tokenomics (supply, allocations, liquidity, lock)
//  Step 3: review + one-click deploy
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  onDeployed?: (gameId: string, mint: string) => void;
  presetType?: string | null;
}

const ALLOC_COLORS: Record<string, string> = {
  playerRewards: "#D85A30", liquidity: "#1D9E75",
  dev: "#BA7517", treasury: "#D4537E", airdrop: "#888780",
};

export default function DeployWizard({ onDeployed, presetType }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1
  const [gameName,    setGameName]    = useState("");
  const [ticker,      setTicker]      = useState("");
  const [gameType,    setGameType]    = useState<GameType>((presetType as GameType) ?? "rpg");
  const [educational, setEducational] = useState(false);
  const [description, setDescription] = useState("");

  // Step 2
  const [supply,   setSupply]   = useState("1000000000");
  const [alloc,    setAlloc]    = useState<TokenAllocation>(DEFAULT_ALLOCATIONS[(presetType as GameType) ?? "rpg"]);
  const [initSol,  setInitSol]  = useState("2");
  const [houseEdge,setHouseEdge]= useState(1500);
  const [liqMode,   setLiqMode]  = useState<'instant'|'bonding'>('instant');
  const [gradTarget,setGradTarget]= useState('69');
  const [initPrice, setInitPrice] = useState('0.000001');

  // Deploy hook (IDLs loaded dynamically in production from generated files)
  const { deploy, deploying, progress, stage, result, error, reset } = useDeployment(
    null, null, null  // IDLs passed in production
  );

  const totalAlloc = Object.values(alloc).reduce((a, b) => a + b, 0);
  const allocValid = totalAlloc === 10000;

  const handleDeploy = async () => {
    const config: DeploymentConfig = {
      gameName,
      gameType:     ["rpg","mini","ponzi","strategy","puzzle","battle"].indexOf(gameType),
      isEducational: educational,
      ticker:       ticker.startsWith("$") ? ticker : `$${ticker}`,
      totalSupply:  BigInt(supply.replace(/,/g, "")),
      decimals:     6,
      allocPlayerRewards: alloc.playerRewards,
      allocLiquidity:     alloc.liquidity,
      allocDev:           alloc.dev,
      allocTreasury:      alloc.treasury,
      allocAirdrop:       alloc.airdrop,
      initialLiquiditySol: parseFloat(initSol) || 2,
      lockDurationSecs:   9999 * 86400, // permanently locked
      houseEdgeBps:       houseEdge,
      skillRewardBps:     Math.floor(alloc.playerRewards * 0.6),
      tournamentPoolBps:  Math.floor(alloc.playerRewards * 0.4),
    };

    const res = await deploy(config);
    if (res) onDeployed?.(res.gameId.toString(), res.mintAddress);
  };

  const canProceed1 = gameName.trim() && ticker.trim();
  const canProceed2 = allocValid && (liqMode === 'bonding' || parseFloat(initSol) >= 0.5);

  const field = (label: string, node: React.ReactNode, hint?: string) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 13, color: "var(--muted)", marginBottom: 5 }}>{label}</label>
      {node}
      {hint && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{hint}</div>}
    </div>
  );

  const input = (value: string, onChange: (v: string) => void, placeholder?: string, type = "text") => (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 14, outline: "none", boxSizing: "border-box" }}
    />
  );

  if (result) {
    return (
      <div style={{ border: "0.5px solid var(--teal)", borderRadius: 12, padding: 28, background: "var(--teal-light)", textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🚀</div>
        <div style={{ fontSize: 18, fontWeight: 500, color: "var(--teal-dark)", marginBottom: 6 }}>{gameName} is live!</div>
        <div style={{ fontSize: 13, color: "var(--teal-dark)", marginBottom: 20, lineHeight: 1.7 }}>
          Token minted · Game registered · Liquidity locked · Automation scheduled.
          Everything in one transaction.
        </div>
        <div style={{ background: "var(--background)", borderRadius: 10, padding: 14, marginBottom: 20, textAlign: "left" }}>
          {[
            ["game ID",   result.gameId.toString()],
            ["mint",      `${result.mintAddress.slice(0,12)}...`],
            ["LP lock",   `${result.lockPDA.slice(0,12)}...`],
            ["tx",        `${result.txSig.slice(0,12)}...`],
          ].map(([l, v]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0", borderBottom: "0.5px solid var(--border)" }}>
              <span style={{ color: "var(--muted)" }}>{l}</span>
              <span style={{ fontFamily: "monospace" }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <a href={result.explorerUrl} target="_blank" rel="noreferrer"
            style={{ padding: "10px 20px", borderRadius: 8, background: "var(--teal)", color: "#fff", textDecoration: "none", fontSize: 13, fontWeight: 500 }}>
            view on Solscan ↗
          </a>
          <button onClick={reset} style={{ padding: "10px 20px", borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--background)", cursor: "pointer", fontSize: 13, color: "var(--muted)" }}>
            deploy another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "var(--font-sans, sans-serif)" }}>
      {/* Step indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        {[1, 2, 3].map(s => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: s < step ? "var(--teal)" : s === step ? "var(--orange)" : "var(--surface)",
              color: s <= step ? "#fff" : "var(--muted)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 500,
            }}>
              {s < step ? "✓" : s}
            </div>
            <span style={{ fontSize: 12, color: s === step ? "var(--text)" : "var(--muted)", fontWeight: s === step ? 500 : 400 }}>
              {["game basics", "tokenomics", "deploy"][s - 1]}
            </span>
            {s < 3 && <div style={{ width: 24, height: 1, background: "var(--border)" }} />}
          </div>
        ))}
      </div>

      {/* STEP 1 */}
      {step === 1 && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>{field("game name", input(gameName, setGameName, "Viking Raid"))}</div>
            <div>{field("token ticker", input(ticker, v => setTicker(v.toUpperCase()), "$RAID"))}</div>
          </div>
          {field("game type",
            <select value={gameType} onChange={e => { setGameType(e.target.value as GameType); setAlloc(DEFAULT_ALLOCATIONS[e.target.value as GameType]); }}
              style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 14, outline: "none" }}>
              {Object.entries(GAME_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          )}
          {field("description (optional)", <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
            placeholder="What's the core gameplay loop?"
            style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box" }}
          />)}
          {field("educational mode?",
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setEducational(true)}  style={{ flex: 1, padding: "8px", borderRadius: 8, border: `1.5px solid ${educational ? "var(--orange)" : "var(--border)"}`, background: educational ? "rgba(232,98,26,0.08)" : "var(--surface)", cursor: "pointer", fontSize: 13, color: educational ? "var(--orange)" : "var(--muted)", fontWeight: educational ? 600 : 400 }}>yes</button>
              <button onClick={() => setEducational(false)} style={{ flex: 1, padding: "8px", borderRadius: 8, border: `1.5px solid ${!educational ? "var(--orange)" : "var(--border)"}`, background: !educational ? "rgba(232,98,26,0.08)" : "var(--surface)", cursor: "pointer", fontSize: 13, color: !educational ? "var(--orange)" : "var(--muted)", fontWeight: !educational ? 600 : 400 }}>no</button>
            </div>
          )}
        </div>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <div>
          {field("total supply", input(supply, setSupply, "1000000000"), "tokens (decimals: 6 — 1B = 1,000,000,000)")}

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>allocations (must sum to 100%)</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              {(Object.entries(alloc) as [keyof TokenAllocation, number][]).map(([k, v]) => (
                <div key={k} style={{ background: "var(--surface)", borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: ALLOC_COLORS[k] }} />
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>{k}</span>
                    {k === "liquidity" && <span style={{ fontSize: 10, color: "var(--teal)", marginLeft: "auto" }}>🔒</span>}
                  </div>
                  <input type="number" min={0} max={10000} value={v}
                    onChange={e => setAlloc(prev => ({ ...prev, [k]: parseInt(e.target.value) || 0 }))}
                    style={{ width: "100%", padding: "4px 8px", borderRadius: 6, border: "0.5px solid var(--border)", background: "var(--background)", fontSize: 13, color: "var(--text)", outline: "none", boxSizing: "border-box" }}
                  />
                  <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{(v/100).toFixed(0)}%</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: allocValid ? "var(--teal)" : "var(--orange)", textAlign: "center" }}>
              Total: {(totalAlloc/100).toFixed(0)}% {allocValid ? "✓" : `(need 100%)`}
            </div>
            {/* Allocation bar */}
            <div style={{ display: "flex", borderRadius: 4, overflow: "hidden", height: 8, marginTop: 8 }}>
              {(Object.entries(alloc) as [string, number][]).map(([k, v]) => (
                <div key={k} style={{ flex: v, background: ALLOC_COLORS[k] }} />
              ))}
            </div>
          </div>

          {/* Liquidity mode toggle */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>liquidity model</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button onClick={() => setLiqMode("instant")}
                style={{ flex: 1, padding: "10px 8px", borderRadius: 8, border: `1.5px solid ${liqMode === "instant" ? "var(--orange)" : "var(--border)"}`, background: liqMode === "instant" ? "rgba(232,98,26,0.08)" : "var(--surface)", cursor: "pointer", fontSize: 13, color: liqMode === "instant" ? "var(--orange)" : "var(--muted)", fontWeight: liqMode === "instant" ? 600 : 400 }}>
                💧 instant pool<br/>
                <span style={{ fontSize: 11, fontWeight: 400 }}>deposit SOL now, live immediately</span>
              </button>
              <button onClick={() => setLiqMode("bonding")}
                style={{ flex: 1, padding: "10px 8px", borderRadius: 8, border: `1.5px solid ${liqMode === "bonding" ? "var(--orange)" : "var(--border)"}`, background: liqMode === "bonding" ? "rgba(232,98,26,0.08)" : "var(--surface)", cursor: "pointer", fontSize: 13, color: liqMode === "bonding" ? "var(--orange)" : "var(--muted)", fontWeight: liqMode === "bonding" ? 600 : 400 }}>
                📈 bonding curve<br/>
                <span style={{ fontSize: 11, fontWeight: 400 }}>auto-graduates at SOL target</span>
              </button>
            </div>

            {liqMode === "instant" && (
              <div>
                {field("initial liquidity (SOL — Permanently Locked 🔒)",
                  input(initSol, setInitSol, "2"),
                  "min 0.5 SOL · LP tokens are burned at deploy — liquidity can never be withdrawn"
                )}
              </div>
            )}

            {liqMode === "bonding" && (
              <div style={{ background: "var(--surface)", borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 13, color: "var(--text)", marginBottom: 10, fontWeight: 500 }}>📈 bonding curve settings</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {field("graduation target (SOL)",
                    input(gradTarget, setGradTarget, "69"),
                    "pool auto-creates + LP permanently locked when target is hit"
                  )}
                  {field("initial token price (SOL)",
                    input(initPrice, setInitPrice, "0.000001"),
                    "price at curve start — rises as tokens are bought"
                  )}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                  800M tokens (80%) go on the curve · remaining 200M reserved for post-graduation pool · LP burned at graduation = permanently locked 🔒
                </div>
              </div>
            )}
          </div>

          {field("house edge",
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <input type="range" min={0} max={2000} step={50} value={houseEdge} onChange={e => setHouseEdge(parseInt(e.target.value))} style={{ flex: 1 }} />
                <span style={{ fontSize: 13, fontWeight: 500, minWidth: 40 }}>{(houseEdge/100).toFixed(1)}%</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>max 20% · enforced on-chain by game_state program</div>
            </div>
          )}
        </div>
      )}

      {/* STEP 3 — REVIEW */}
      {step === 3 && (
        <div>
          <div style={{ background: "var(--surface)", borderRadius: 10, padding: 16, marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>deployment summary</div>
            {[
              ["game",      `${gameName} · ${GAME_TYPE_LABELS[gameType]}`],
              ["ticker",    ticker],
              ["supply",    parseInt(supply).toLocaleString()],
              ["liquidity", liqMode === "bonding" ? `bonding curve → graduates at ${gradTarget} SOL 🔒` : `${initSol} SOL · permanently locked 🔒`],
              ["house edge",`${(houseEdge/100).toFixed(1)}%`],
              ["player rewards", `${(alloc.playerRewards/100).toFixed(0)}%`],
              ["educational", educational ? "yes" : "no"],
            ].map(([l, v]) => (
              <div key={l as string} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0", borderBottom: "0.5px solid var(--border)" }}>
                <span style={{ color: "var(--muted)" }}>{l}</span>
                <span style={{ fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>

          <div style={{ background: "var(--teal-light)", borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 12, color: "var(--teal-dark)", lineHeight: 1.6 }}>
            <strong>One wallet confirm</strong> · All 4 steps execute atomically:
            mint token → register game → add Raydium liquidity → lock LP.
            If any step fails, none of them land. No partial state.
          </div>

          {deploying && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ height: 6, background: "var(--surface)", borderRadius: 3, overflow: "hidden", marginBottom: 6 }}>
                <div style={{ height: "100%", width: `${progress}%`, background: "var(--orange)", borderRadius: 3, transition: "width 0.4s" }} />
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center" }}>{stage}</div>
            </div>
          )}

          {error && (
            <div style={{ background: "var(--orange-light)", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 13, color: "var(--orange-dark)" }}>
              ⚠️ {error}
            </div>
          )}

          <button onClick={handleDeploy} disabled={deploying} style={{
            width: "100%", padding: 14, borderRadius: 10,
            background: deploying ? "var(--muted)" : "var(--orange)",
            color: "#fff", border: "none", fontSize: 15, fontWeight: 500,
            cursor: deploying ? "default" : "pointer",
          }}>
            {deploying ? stage || "deploying..." : "deploy to solana — one confirm →"}
          </button>
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
        <button onClick={() => setStep(s => Math.max(1, s - 1) as 1|2|3)} disabled={step === 1}
          style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--background)", cursor: step === 1 ? "default" : "pointer", fontSize: 13, color: "var(--muted)", opacity: step === 1 ? 0.3 : 1 }}>
          back
        </button>
        {step < 3 && (
          <button
            onClick={() => setStep(s => (s + 1) as 1|2|3)}
            disabled={(step === 1 && !canProceed1) || (step === 2 && !canProceed2)}
            style={{ padding: "8px 20px", borderRadius: 8, background: "var(--orange)", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500, opacity: (step === 1 && !canProceed1) || (step === 2 && !canProceed2) ? 0.4 : 1 }}>
            next →
          </button>
        )}
      </div>
    </div>
  );
}
