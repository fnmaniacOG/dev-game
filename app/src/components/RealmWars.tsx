import { useState, useEffect, useCallback, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { hapticRaidSuccess, hapticRaidFail, hapticLevelUp } from "../lib/mobile";

// ─── Types ────────────────────────────────────────────────────────────────────

type ResourceType = "gold" | "iron" | "wood" | "magic" | "food";
type Phase = "setup" | "map" | "battle" | "train" | "guild";

interface Territory {
  idx:        number;
  name:       string;
  resource:   ResourceType;
  yield:      number;           // $REALM per turn
  owner:      string | null;    // player name or null (neutral)
  garrison:   number;
  fort:       number;           // 0–5
  x:          number;           // grid col
  y:          number;           // grid row
}

interface Kingdom {
  name:        string;
  color:       string;
  troops:      number;
  gold:        number;
  realmTokens: number;
  territories: number[];        // territory indices owned
  guild:       string | null;
  isPlayer:    boolean;
}

interface BattleResult {
  won:             boolean;
  territory:       Territory;
  attackerLosses:  number;
  defenderLosses:  number;
  troopsCommitted: number;
}

interface Guild {
  name:      string;
  tag:       string;
  members:   string[];
  treasury:  number;
  territories: number;
}

// ─── Map data ─────────────────────────────────────────────────────────────────

const RESOURCE_CONFIG: Record<ResourceType, { emoji: string; color: string; label: string }> = {
  gold:  { emoji: "💰", color: "#FAEEDA", label: "gold mine" },
  iron:  { emoji: "⚙️",  color: "#D3D1C7", label: "ironworks" },
  wood:  { emoji: "🌲", color: "#E1F5EE", label: "lumber mill" },
  magic: { emoji: "🔮", color: "#EEEDFE", label: "arcane node" },
  food:  { emoji: "🌾", color: "#EAF3DE", label: "farmlands" },
};

const TERRITORY_NAMES = [
  "Ironhold", "Goldmere", "Ashford", "Stonegate", "Frostpeak",
  "Embervale", "Greenveil", "Crystalmoor", "Shadowfen", "Thornwall",
  "Duskridge", "Starfall", "Coppergate", "Moonvale", "Saltmarsh",
  "Cinderhold", "Brightmere", "Darkwood", "Sunridge", "Mistfall",
  "Oakenshield", "Deepwater", "Highwatch", "Ironveil", "Stormreach",
];

const RESOURCE_SEQUENCE: ResourceType[] = [
  "gold","iron","wood","magic","food",
  "iron","magic","gold","food","wood",
  "wood","food","magic","iron","gold",
  "magic","gold","iron","wood","food",
  "food","wood","gold","magic","iron",
];

function makeMap(): Territory[] {
  return Array.from({ length: 25 }, (_, i) => ({
    idx:      i,
    name:     TERRITORY_NAMES[i],
    resource: RESOURCE_SEQUENCE[i],
    yield:    20 + (i % 5) * 15 + Math.floor(i / 5) * 10,
    owner:    null,
    garrison: 20 + (i % 7) * 8,
    fort:     0,
    x:        i % 5,
    y:        Math.floor(i / 5),
  }));
}

const AI_PLAYERS: Kingdom[] = [
  { name: "Iron Legion",   color: "#888780", troops: 120, gold: 500, realmTokens: 0, territories: [],  guild: null, isPlayer: false },
  { name: "Gold Empire",   color: "#BA7517", troops: 100, gold: 450, realmTokens: 0, territories: [],  guild: null, isPlayer: false },
  { name: "Magic Council", color: "#7F77DD", troops: 90,  gold: 600, realmTokens: 0, territories: [],  guild: null, isPlayer: false },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RESOURCE_COLORS: Record<ResourceType, string> = {
  gold: "#FAEEDA", iron: "#F1EFE8", wood: "#E1F5EE", magic: "#EEEDFE", food: "#EAF3DE",
};

const OWNER_COLORS: Record<string, string> = {
  "player":        "#D85A30",
  "Iron Legion":   "#888780",
  "Gold Empire":   "#BA7517",
  "Magic Council": "#7F77DD",
};

function getOwnerColor(owner: string | null, territories: Territory[]): string {
  if (!owner) return "#F1EFE8";
  return OWNER_COLORS[owner] ?? "#888780";
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RealmWars() {
  const { publicKey } = useWallet();
  const [phase,      setPhase]      = useState<Phase>("setup");
  const [heroName,   setHeroName]   = useState("Lord Aldric");
  const [map,        setMap]        = useState<Territory[]>(makeMap());
  const [player,     setPlayer]     = useState<Kingdom | null>(null);
  const [aiKingdoms, setAiKingdoms] = useState<Kingdom[]>(AI_PLAYERS.map(k => ({ ...k, territories: [] })));
  const [selected,   setSelected]   = useState<number | null>(null);
  const [troopInput, setTroopInput] = useState(20);
  const [battleResult, setBattleResult] = useState<BattleResult | null>(null);
  const [guild,      setGuild]      = useState<Guild | null>(null);
  const [guildName,  setGuildName]  = useState("");
  const [guildTag,   setGuildTag]   = useState("");
  const [turn,       setTurn]       = useState(1);
  const [turnMsg,    setTurnMsg]    = useState("");
  const [log,        setLog]        = useState<string[]>([]);
  const [trainCount, setTrainCount] = useState(10);

  const addLog = (msg: string) => setLog(prev => [msg, ...prev.slice(0, 12)]);

  // Start game
  const startGame = () => {
    const p: Kingdom = {
      name: heroName, color: "#D85A30",
      troops: 50, gold: 200, realmTokens: 0,
      territories: [], guild: null, isPlayer: true,
    };
    // Give AI players some starting territories
    const m = [...map];
    const aiOwned: number[][] = [[], [], []];
    [0, 5, 10, 15, 20].forEach((idx, i) => {
      m[idx].owner   = AI_PLAYERS[i % 3].name;
      m[idx].garrison = 0;
      aiOwned[i % 3].push(idx);
    });
    setMap(m);
    setAiKingdoms(prev => prev.map((k, i) => ({ ...k, territories: aiOwned[i] ?? [] })));
    setPlayer(p);
    setPhase("map");
    addLog("Your realm begins. Conquer territories to earn $REALM each turn.");
  };

  // Attack a territory
  const attack = useCallback((territoryIdx: number) => {
    if (!player) return;
    const territory = map[territoryIdx];
    if (territory.owner === heroName) return;

    const fortBonus    = 1 + territory.fort * 0.3;
    const defenderStr  = Math.round((territory.owner ? territory.garrison : territory.garrison) * fortBonus);
    const effectiveAtk = Math.round(troopInput * 1.0); // base — hero NFT would add multiplier

    const won           = effectiveAtk > defenderStr;
    const atkLosses     = won ? Math.round(troopInput * defenderStr / (effectiveAtk + 1) * 0.6) : Math.round(troopInput * 0.5);
    const defLosses     = won ? territory.garrison : Math.round(territory.garrison * effectiveAtk / (defenderStr + 1) * 0.5);

    if (won) hapticRaidSuccess(); else hapticRaidFail();

    const newMap = map.map((t, i) => {
      if (i !== territoryIdx) return t;
      return won
        ? { ...t, owner: heroName, garrison: Math.round(troopInput * 0.4), fort: 0, neutral_garrison: 0 }
        : { ...t, garrison: Math.max(5, t.garrison - defLosses) };
    });

    const newPlayer = {
      ...player,
      troops:      player.troops - troopInput + (won ? 0 : 0),
      territories: won ? [...player.territories, territoryIdx] : player.territories.filter(i => i !== territoryIdx),
    };

    if (won && territory.owner) {
      setAiKingdoms(prev => prev.map(k =>
        k.name === territory.owner
          ? { ...k, territories: k.territories.filter(i => i !== territoryIdx) }
          : k
      ));
    }

    setMap(newMap);
    setPlayer(newPlayer);
    setBattleResult({ won, territory, attackerLosses: atkLosses, defenderLosses: defLosses, troopsCommitted: troopInput });
    setPhase("battle");
    setSelected(null);
    addLog(won
      ? `⚔️ Conquered ${territory.name}! (lost ${atkLosses} troops)`
      : `💀 Failed to take ${territory.name}. (lost ${atkLosses} troops)`
    );
  }, [player, map, troopInput, heroName]);

  // Claim turn income
  const claimTurn = () => {
    if (!player) return;
    const income = player.territories.reduce((sum, idx) => sum + map[idx].yield, 0);
    const tribute = guild ? Math.round(income * 0.02) : 0;
    const net = income - tribute;

    setPlayer(prev => prev ? { ...prev, realmTokens: prev.realmTokens + net, gold: prev.gold + net } : null);
    setTurn(t => t + 1);
    setTurnMsg(`+${net} $REALM from ${player.territories.length} territories`);
    addLog(`Turn ${turn}: earned ${net} $REALM from territories`);

    // Simple AI turn
    setAiKingdoms(prev => prev.map(k => ({ ...k, gold: k.gold + k.territories.length * 30 })));

    // AI tries to expand occasionally
    if (Math.random() < 0.3) {
      const neutralTerrs = map.filter(t => !t.owner && t.garrison < 60);
      if (neutralTerrs.length > 0) {
        const target = neutralTerrs[Math.floor(Math.random() * neutralTerrs.length)];
        const aiIdx  = Math.floor(Math.random() * aiKingdoms.length);
        setMap(m => m.map((t, i) => i === target.idx ? { ...t, owner: aiKingdoms[aiIdx].name, garrison: 15 } : t));
        setAiKingdoms(prev => prev.map((k, i) => i === aiIdx ? { ...k, territories: [...k.territories, target.idx] } : k));
      }
    }
  };

  // Train troops
  const trainTroops = () => {
    if (!player) return;
    const cost = trainCount * 10;
    if (player.gold < cost) { addLog("⚠️ Not enough $REALM to train troops"); return; }
    setPlayer(prev => prev ? { ...prev, troops: prev.troops + trainCount, gold: prev.gold - cost } : null);
    addLog(`⚔️ Trained ${trainCount} troops (-${cost} $REALM)`);
    setPhase("map");
  };

  // Fortify selected territory
  const fortify = (idx: number) => {
    if (!player || map[idx].owner !== heroName) return;
    if (player.gold < 500) { addLog("⚠️ Need 500 $REALM to fortify"); return; }
    if (map[idx].fort >= 5) { addLog("Max fortification reached"); return; }
    setMap(m => m.map((t, i) => i === idx ? { ...t, fort: t.fort + 1 } : t));
    setPlayer(prev => prev ? { ...prev, gold: prev.gold - 500 } : null);
    addLog(`🏰 Fortified ${map[idx].name} to level ${map[idx].fort + 1}`);
  };

  // Create guild
  const createGuild = () => {
    if (!player || player.gold < 1000) { addLog("⚠️ Need 1000 $REALM to create a guild"); return; }
    const g: Guild = { name: guildName, tag: guildTag, members: [heroName], treasury: 0, territories: player.territories.length };
    setGuild(g);
    setPlayer(prev => prev ? { ...prev, guild: guildName, gold: prev.gold - 1000 } : null);
    addLog(`🛡️ Guild "${guildName}" [${guildTag}] created!`);
    hapticLevelUp();
    setPhase("map");
  };

  const selectedTerritory = selected !== null ? map[selected] : null;

  // ── Character creation ─────────────────────────────────────────────────────
  if (phase === "setup") {
    return (
      <div style={{ fontFamily: "var(--font-sans, sans-serif)" }}>
        <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>Realm Wars</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>Territory control strategy · Earn $REALM · Build your guild</div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 13, color: "var(--muted)", marginBottom: 5 }}>your hero name</label>
          <input value={heroName} onChange={e => setHeroName(e.target.value)}
            style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 14, outline: "none" }}
          />
        </div>
        <div style={{ background: "var(--surface)", borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13, color: "var(--muted)", lineHeight: 1.7 }}>
          <strong style={{ color: "var(--text)" }}>How to play:</strong> You start with 50 troops and 200 $REALM.
          Conquer neutral territories to earn $REALM every turn (6 hours on mainnet, instant here).
          Train more troops to expand. Fortify territories to defend them.
          Build a guild to pool income and compete in weekly tournaments.
        </div>
        <button onClick={startGame} disabled={!heroName.trim()} style={{
          width: "100%", padding: 13, borderRadius: 10, background: "var(--orange)", color: "#fff",
          border: "none", fontSize: 15, fontWeight: 500, cursor: "pointer", opacity: heroName.trim() ? 1 : 0.5,
        }}>
          begin conquest →
        </button>
      </div>
    );
  }

  if (!player) return null;

  return (
    <div style={{ fontFamily: "var(--font-sans, sans-serif)" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 500 }}>{player.name} · Turn {turn}</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {player.territories.length} territories · {player.troops.toLocaleString()} troops
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: "var(--orange)" }}>{player.realmTokens.toLocaleString()}</div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>$REALM earned</div>
        </div>
      </div>

      {/* Quick stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
        {[
          ["💰 treasury", `${player.gold}`],
          ["⚔️ troops",   `${player.troops}`],
          ["🗺 territories", `${player.territories.length}`],
          ["🛡 guild",    player.guild ?? "none"],
        ].map(([l, v]) => (
          <div key={l as string} style={{ background: "var(--surface)", borderRadius: 8, padding: "8px 10px" }}>
            <div style={{ fontSize: 10, color: "var(--muted)" }}>{l}</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        <button onClick={claimTurn} style={{ padding: "7px 14px", borderRadius: 8, background: "var(--teal)", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 500 }}>
          ⏰ claim turn
        </button>
        <button onClick={() => setPhase("train")} style={{ padding: "7px 14px", borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--background)", cursor: "pointer", fontSize: 12, color: "var(--muted)" }}>
          ⚔️ train troops
        </button>
        <button onClick={() => setPhase("guild")} style={{ padding: "7px 14px", borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--background)", cursor: "pointer", fontSize: 12, color: "var(--muted)" }}>
          🛡️ guild
        </button>
        {turnMsg && <div style={{ fontSize: 12, color: "var(--teal-dark)", padding: "7px 0" }}>{turnMsg}</div>}
      </div>

      {/* MAP */}
      {phase === "map" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, marginBottom: 14 }}>
            {map.map((t, i) => {
              const isOwned     = t.owner === heroName;
              const isSelected  = selected === i;
              const ownerColor  = t.owner ? (OWNER_COLORS[t.owner] ?? "#888780") : "#D3D1C7";
              const rc          = RESOURCE_CONFIG[t.resource];
              return (
                <button key={i} onClick={() => setSelected(isSelected ? null : i)} style={{
                  aspectRatio: "1", borderRadius: 8, border: `${isSelected ? "2px" : "0.5px"} solid ${isSelected ? "var(--orange)" : isOwned ? ownerColor : "var(--border)"}`,
                  background: isOwned ? `${ownerColor}30` : rc.color,
                  cursor: "pointer", padding: 4,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1,
                  position: "relative",
                }}>
                  <span style={{ fontSize: 14 }}>{rc.emoji}</span>
                  <span style={{ fontSize: 8, color: "var(--muted)", lineHeight: 1 }}>{t.name.slice(0, 6)}</span>
                  {t.fort > 0 && <span style={{ fontSize: 8 }}>{"🏰".slice(0, t.fort > 0 ? 1 : 0)}{t.fort}</span>}
                  {isOwned && <div style={{ position: "absolute", top: 2, right: 2, width: 5, height: 5, borderRadius: "50%", background: "var(--orange)" }} />}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, fontSize: 11, color: "var(--muted)" }}>
            {Object.entries(RESOURCE_CONFIG).map(([r, c]) => (
              <span key={r} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span>{c.emoji}</span> {c.label}
              </span>
            ))}
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--orange)", display: "inline-block" }} /> yours
            </span>
          </div>

          {/* Selected territory panel */}
          {selectedTerritory && (
            <div style={{ border: "0.5px solid var(--border)", borderRadius: 10, padding: 14, background: "var(--background)" }}>
              <div style={{ display: "flex", justify: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{RESOURCE_CONFIG[selectedTerritory.resource].emoji} {selectedTerritory.name}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    {RESOURCE_CONFIG[selectedTerritory.resource].label} · +{selectedTerritory.yield} $REALM/turn
                    {selectedTerritory.fort > 0 && ` · Fort lv${selectedTerritory.fort}`}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 2 }}>
                    {selectedTerritory.owner
                      ? <span style={{ color: selectedTerritory.owner === heroName ? "var(--orange)" : "var(--muted)" }}>Owned by {selectedTerritory.owner === heroName ? "you" : selectedTerritory.owner}</span>
                      : <span style={{ color: "var(--muted)" }}>Neutral · {selectedTerritory.garrison} garrison</span>
                    }
                  </div>
                </div>
              </div>

              {selectedTerritory.owner !== heroName ? (
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                    <label style={{ fontSize: 12, color: "var(--muted)" }}>troops:</label>
                    <input type="number" min={1} max={player.troops} value={troopInput}
                      onChange={e => setTroopInput(Math.min(player.troops, parseInt(e.target.value) || 1))}
                      style={{ width: 80, padding: "5px 8px", borderRadius: 6, border: "0.5px solid var(--border)", background: "var(--surface)", fontSize: 13, color: "var(--text)", outline: "none" }}
                    />
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>
                      vs {Math.round((selectedTerritory.garrison) * (1 + selectedTerritory.fort * 0.3))} defender str
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => attack(selectedTerritory.idx)} style={{
                      flex: 1, padding: "9px", borderRadius: 8, background: "var(--orange)", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500,
                    }}>⚔️ attack</button>
                    <button onClick={() => setSelected(null)} style={{ padding: "9px 14px", borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--background)", cursor: "pointer", fontSize: 12, color: "var(--muted)" }}>
                      cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => fortify(selectedTerritory.idx)} disabled={player.gold < 500 || selectedTerritory.fort >= 5} style={{
                    flex: 1, padding: "9px", borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--background)", cursor: "pointer", fontSize: 12, color: "var(--muted)",
                    opacity: player.gold < 500 || selectedTerritory.fort >= 5 ? 0.4 : 1,
                  }}>
                    🏰 fortify (500 $REALM)
                  </button>
                  <button onClick={() => setSelected(null)} style={{ padding: "9px 14px", borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--background)", cursor: "pointer", fontSize: 12, color: "var(--muted)" }}>
                    close
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* BATTLE RESULT */}
      {phase === "battle" && battleResult && (
        <div style={{ border: `0.5px solid ${battleResult.won ? "var(--teal)" : "var(--border)"}`, borderRadius: 12, padding: 18, background: battleResult.won ? "var(--teal-light)" : "var(--surface)" }}>
          <div style={{ fontSize: 26, textAlign: "center", marginBottom: 10 }}>{battleResult.won ? "🏆" : "💀"}</div>
          <div style={{ fontSize: 15, fontWeight: 500, textAlign: "center", marginBottom: 12, color: battleResult.won ? "var(--teal-dark)" : "var(--text)" }}>
            {battleResult.won ? `${battleResult.territory.name} conquered!` : `Attack repelled at ${battleResult.territory.name}`}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
            {[
              ["committed",    battleResult.troopsCommitted],
              ["your losses",  battleResult.attackerLosses],
              ["enemy losses", battleResult.defenderLosses],
            ].map(([l, v]) => (
              <div key={l as string} style={{ background: "var(--background)", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>{l}</div>
                <div style={{ fontSize: 16, fontWeight: 500 }}>{v}</div>
              </div>
            ))}
          </div>
          {battleResult.won && (
            <div style={{ background: "var(--background)", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: "var(--teal-dark)" }}>
              Now earns +{battleResult.territory.yield} $REALM per turn
            </div>
          )}
          <button onClick={() => setPhase("map")} style={{ width: "100%", padding: 10, borderRadius: 8, background: "var(--orange)", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 500 }}>
            continue
          </button>
        </div>
      )}

      {/* TRAIN */}
      {phase === "train" && (
        <div style={{ border: "0.5px solid var(--border)", borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>Train troops</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <input type="range" min={1} max={Math.min(500, Math.floor(player.gold / 10))} value={trainCount}
              onChange={e => setTrainCount(parseInt(e.target.value))} style={{ flex: 1 }} />
            <span style={{ fontSize: 14, fontWeight: 500, minWidth: 30 }}>{trainCount}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 14 }}>
            <span style={{ color: "var(--muted)" }}>cost: {trainCount * 10} $REALM</span>
            <span style={{ color: "var(--muted)" }}>current: {player.troops} troops</span>
            <span style={{ color: "var(--teal)" }}>after: {player.troops + trainCount}</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={trainTroops} disabled={player.gold < trainCount * 10} style={{
              flex: 1, padding: "10px", borderRadius: 8, background: "var(--orange)", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 500, opacity: player.gold < trainCount * 10 ? 0.4 : 1,
            }}>train {trainCount} troops</button>
            <button onClick={() => setPhase("map")} style={{ padding: "10px 16px", borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--background)", cursor: "pointer", fontSize: 13 }}>
              cancel
            </button>
          </div>
        </div>
      )}

      {/* GUILD */}
      {phase === "guild" && (
        <div style={{ border: "0.5px solid var(--border)", borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>Guild</div>
          {guild ? (
            <div>
              <div style={{ background: "var(--teal-light)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 500, color: "var(--teal-dark)" }}>[{guild.tag}] {guild.name}</div>
                <div style={{ fontSize: 12, color: "var(--teal-dark)", marginTop: 4 }}>
                  {guild.members.length} member{guild.members.length !== 1 ? "s" : ""} · {guild.territories} territories · {guild.treasury} $REALM treasury
                </div>
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
                All guild territories combined for weekly leaderboard. Top guild wins the weekly tournament prize pool.
              </div>
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>guild name</label>
                <input value={guildName} onChange={e => setGuildName(e.target.value)} placeholder="e.g. Iron Vanguard"
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--surface)", fontSize: 13, color: "var(--text)", outline: "none" }}
                />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>tag (max 5 chars)</label>
                <input value={guildTag} onChange={e => setGuildTag(e.target.value.slice(0, 5).toUpperCase())} placeholder="IV"
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--surface)", fontSize: 13, color: "var(--text)", outline: "none" }}
                />
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
                Creating a guild costs 1,000 $REALM. Guild members share 2% tribute from all territory income into a shared treasury.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={createGuild} disabled={player.gold < 1000 || !guildName || !guildTag} style={{
                  flex: 1, padding: "10px", borderRadius: 8, background: "var(--orange)", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500,
                  opacity: player.gold < 1000 || !guildName || !guildTag ? 0.4 : 1,
                }}>create guild (1,000 $REALM)</button>
                <button onClick={() => setPhase("map")} style={{ padding: "10px 16px", borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--background)", cursor: "pointer", fontSize: 13 }}>
                  cancel
                </button>
              </div>
            </div>
          )}
          {guild && <button onClick={() => setPhase("map")} style={{ width: "100%", marginTop: 8, padding: "10px", borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--background)", cursor: "pointer", fontSize: 13, color: "var(--muted)" }}>back to map</button>}
        </div>
      )}

      {/* Log */}
      {log.length > 0 && phase === "map" && (
        <div style={{ marginTop: 14, background: "var(--surface)", borderRadius: 8, padding: "8px 12px" }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: "var(--muted)", marginBottom: 4 }}>event log</div>
          {log.slice(0, 5).map((e, i) => (
            <div key={i} style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6, opacity: 1 - i * 0.18 }}>{e}</div>
          ))}
        </div>
      )}
    </div>
  );
}
