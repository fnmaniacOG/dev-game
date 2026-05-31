import { useState, useEffect, useCallback } from "react";
import { hapticRaidSuccess, hapticRaidFail, hapticLevelUp } from "../lib/mobile";

// ─── Types ────────────────────────────────────────────────────────────────────

type BattlePhase = "map" | "combat" | "reward" | "shop" | "levelup";
type EnemyType   = "goblin" | "orc" | "dragon" | "lich" | "boss";

interface Stat  { hp: number; maxHp: number; atk: number; def: number; spd: number }
interface Hero  { name: string; class: string; emoji: string; level: number; xp: number; xpToNext: number; stats: Stat; gold: number; keepTokens: number }
interface Enemy { name: string; type: EnemyType; emoji: string; level: number; stats: Stat; reward: { xp: number; gold: number; tokens: number }; lore: string }
interface CombatLog { turn: number; text: string; type: "player" | "enemy" | "system" }
interface ShopItem  { id: string; name: string; emoji: string; cost: number; effect: string; stat: keyof Stat; value: number }

// ─── Data ─────────────────────────────────────────────────────────────────────

const HERO_CLASSES = [
  { name: "Berserker", emoji: "⚔️", stats: { hp: 120, maxHp: 120, atk: 18, def: 8,  spd: 12 } },
  { name: "Paladin",   emoji: "🛡️", stats: { hp: 150, maxHp: 150, atk: 12, def: 16, spd: 8  } },
  { name: "Ranger",    emoji: "🏹", stats: { hp: 100, maxHp: 100, atk: 14, def: 10, spd: 18 } },
  { name: "Mage",      emoji: "🔮", stats: { hp: 80,  maxHp: 80,  atk: 22, def: 6,  spd: 14 } },
];

const DUNGEONS = [
  {
    name: "Goblin Caves",    emoji: "🕳️",  bg: "#F1EFE8", difficulty: "easy",
    enemies: ["goblin", "goblin", "orc"] as EnemyType[],
    reward: { xp: 150, gold: 40, tokens: 80 }, unlockLevel: 1,
  },
  {
    name: "Dark Forest",     emoji: "🌲",  bg: "#E1F5EE", difficulty: "medium",
    enemies: ["orc", "orc", "dragon"] as EnemyType[],
    reward: { xp: 300, gold: 80, tokens: 200 }, unlockLevel: 5,
  },
  {
    name: "Dragon's Peak",   emoji: "🏔️",  bg: "#FAECE7", difficulty: "hard",
    enemies: ["dragon", "dragon", "lich"] as EnemyType[],
    reward: { xp: 600, gold: 160, tokens: 500 }, unlockLevel: 10,
  },
  {
    name: "Shadow Citadel",  emoji: "🏰",  bg: "#EEEDFE", difficulty: "legendary",
    enemies: ["lich", "dragon", "boss"] as EnemyType[],
    reward: { xp: 1200, gold: 320, tokens: 1200 }, unlockLevel: 20,
  },
];

function makeEnemy(type: EnemyType, dungeonLevel: number): Enemy {
  const base: Record<EnemyType, Omit<Enemy, "stats"> & { baseStats: Stat }> = {
    goblin: { name: "Goblin Raider",    type: "goblin",  emoji: "👺", level: 1, lore: "A scrawny goblin wielding a rusty dagger.", baseStats: { hp: 40, maxHp: 40, atk: 8,  def: 4,  spd: 10 }, reward: { xp: 30, gold: 8,  tokens: 15 } },
    orc:    { name: "Orc Warrior",       type: "orc",     emoji: "👹", level: 4, lore: "A hulking orc with a bone-crushing maul.",  baseStats: { hp: 80, maxHp: 80, atk: 14, def: 8,  spd: 6  }, reward: { xp: 60, gold: 15, tokens: 35 } },
    dragon: { name: "Cave Dragon",       type: "dragon",  emoji: "🐉", level: 8, lore: "A young dragon — still deadly.",            baseStats: { hp: 140,maxHp:140,atk: 20, def: 12, spd: 10 }, reward: { xp: 120,gold: 30, tokens: 80 } },
    lich:   { name: "Lich Lord",         type: "lich",    emoji: "💀", level: 15,lore: "An ancient undead sorcerer of immense power.",baseStats:{ hp: 200,maxHp:200,atk: 28, def: 8,  spd: 14 }, reward: { xp: 250,gold: 60, tokens: 200}},
    boss:   { name: "Shadow Archon",     type: "boss",    emoji: "👁️", level: 25,lore: "The corrupted master of the Shadow Citadel.", baseStats:{ hp: 350,maxHp:350,atk: 35, def: 18, spd: 16 }, reward: { xp: 500,gold: 120,tokens: 500}},
  };
  const b = base[type];
  const scale = 1 + dungeonLevel * 0.15;
  return {
    ...b,
    stats: {
      hp:    Math.round(b.baseStats.hp    * scale),
      maxHp: Math.round(b.baseStats.maxHp * scale),
      atk:   Math.round(b.baseStats.atk   * scale),
      def:   Math.round(b.baseStats.def   * scale),
      spd:   Math.round(b.baseStats.spd   * scale),
    },
  };
}

const SHOP_ITEMS: ShopItem[] = [
  { id: "health",   name: "Health Potion",    emoji: "🧪", cost: 20, effect: "+40 max HP",    stat: "maxHp",  value: 40  },
  { id: "sword",    name: "Iron Sword",       emoji: "⚔️", cost: 35, effect: "+6 attack",     stat: "atk",    value: 6   },
  { id: "shield",   name: "Tower Shield",     emoji: "🛡️", cost: 30, effect: "+5 defense",    stat: "def",    value: 5   },
  { id: "boots",    name: "Swift Boots",      emoji: "👟", cost: 25, effect: "+4 speed",      stat: "spd",    value: 4   },
  { id: "dragon",   name: "Dragon Scale Mail",emoji: "🐲", cost: 80, effect: "+10 def +20 hp",stat: "def",    value: 10  },
  { id: "elixir",   name: "Full Elixir",      emoji: "✨", cost: 50, effect: "Full HP restore",stat: "hp",    value: 9999},
];

// ─── Stat Bar ─────────────────────────────────────────────────────────────────

function StatBar({ current, max, color = "var(--teal)" }: { current: number; max: number; color?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round((current / max) * 100)));
  return (
    <div style={{ height: 8, background: "var(--surface)", borderRadius: 4, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, transition: "width 0.4s" }} />
    </div>
  );
}

// ─── Main game ────────────────────────────────────────────────────────────────

export default function DragonKeep() {
  const [phase,    setPhase]    = useState<BattlePhase>("map");
  const [hero,     setHero]     = useState<Hero | null>(null);
  const [classIdx, setClassIdx] = useState(0);
  const [heroName, setHeroName] = useState("Aldric");
  const [enemy,    setEnemy]    = useState<Enemy | null>(null);
  const [dungeon,  setDungeon]  = useState(DUNGEONS[0]);
  const [turn,     setTurn]     = useState(1);
  const [log,      setLog]      = useState<CombatLog[]>([]);
  const [acting,   setActing]   = useState(false);
  const [heroFlash,setHeroFlash]= useState("");
  const [enemyFlash,setEnemyFlash]=useState("");
  const [pendingReward, setPendingReward] = useState<{ xp: number; gold: number; tokens: number } | null>(null);

  const addLog = (text: string, type: CombatLog["type"]) =>
    setLog(p => [{ turn, text, type }, ...p.slice(0, 14)]);

  const startGame = () => {
    const cls = HERO_CLASSES[classIdx];
    setHero({
      name: heroName, class: cls.name, emoji: cls.emoji,
      level: 1, xp: 0, xpToNext: 1000,
      stats: { ...cls.stats },
      gold: 50, keepTokens: 0,
    });
    setPhase("map");
  };

  const enterDungeon = (d: typeof DUNGEONS[0]) => {
    if (!hero) return;
    setDungeon(d);
    const enemyType = d.enemies[Math.floor(Math.random() * d.enemies.length)];
    const lvl = DUNGEONS.indexOf(d);
    const e = makeEnemy(enemyType, lvl);
    setEnemy({ ...e, stats: { ...e.stats } });
    setTurn(1);
    setLog([]);
    setPhase("combat");
    addLog(`Entered ${d.name}. A ${e.name} appears!`, "system");
  };

  const playerAttack = useCallback(async () => {
    if (!hero || !enemy || acting) return;
    setActing(true);

    // Player attacks
    const hitRoll = Math.random();
    const hitChance = Math.min(0.95, 0.7 + (hero.stats.spd - enemy.stats.spd) * 0.02);
    const playerHits = hitRoll < hitChance;
    const rawDmg = hero.stats.atk + Math.floor(Math.random() * 6);
    const playerDmg = playerHits ? Math.max(1, rawDmg - Math.floor(enemy.stats.def * 0.6)) : 0;

    setEnemyFlash(playerHits ? "hit" : "miss");
    setTimeout(() => setEnemyFlash(""), 400);

    const newEnemyHp = Math.max(0, enemy.stats.hp - playerDmg);
    addLog(
      playerHits
        ? `${hero.name} strikes for ${playerDmg} damage! (${newEnemyHp}/${enemy.stats.maxHp} HP)`
        : `${hero.name} attacks but misses!`,
      "player"
    );

    if (newEnemyHp <= 0) {
      // Enemy defeated
      setEnemy(null);
      setPhase("reward");
      setPendingReward(dungeon.reward);
      hapticRaidSuccess();
      addLog(`${enemy.name} is defeated!`, "system");
      setActing(false);
      return;
    }

    setEnemy(prev => prev ? { ...prev, stats: { ...prev.stats, hp: newEnemyHp } } : null);
    await new Promise(r => setTimeout(r, 600));

    // Enemy attacks back
    const enemyHitChance = Math.min(0.85, 0.6 + (enemy.stats.spd - hero.stats.spd) * 0.02);
    const enemyHits = Math.random() < enemyHitChance;
    const enemyRawDmg = enemy.stats.atk + Math.floor(Math.random() * 4);
    const enemyDmg = enemyHits ? Math.max(1, enemyRawDmg - Math.floor(hero.stats.def * 0.5)) : 0;

    setHeroFlash(enemyHits ? "hit" : "miss");
    setTimeout(() => setHeroFlash(""), 400);

    const newHeroHp = Math.max(0, hero.stats.hp - enemyDmg);
    addLog(
      enemyHits
        ? `${enemy.name} retaliates for ${enemyDmg} damage! (${newHeroHp}/${hero.stats.maxHp} HP)`
        : `${enemy.name} attacks but misses!`,
      "enemy"
    );

    if (newHeroHp <= 0) {
      hapticRaidFail();
      setHero(prev => prev ? { ...prev, stats: { ...prev.stats, hp: 1 } } : null); // survive with 1 HP
      addLog("You barely escape with your life!", "system");
      setPhase("map");
      setActing(false);
      return;
    }

    setHero(prev => prev ? { ...prev, stats: { ...prev.stats, hp: newHeroHp } } : null);
    setTurn(t => t + 1);
    setActing(false);
  }, [hero, enemy, acting, dungeon, turn]);

  const claimReward = () => {
    if (!hero || !pendingReward) return;
    const newXp    = hero.xp + pendingReward.xp;
    const levelUp  = newXp >= hero.xpToNext;
    const newLevel = levelUp ? hero.level + 1 : hero.level;
    const nextXp   = newLevel * newLevel * 1000;
    if (levelUp) hapticLevelUp();

    setHero(prev => prev ? {
      ...prev,
      level: newLevel,
      xp: levelUp ? newXp - prev.xpToNext : newXp,
      xpToNext: nextXp,
      gold: prev.gold + pendingReward.gold,
      keepTokens: prev.keepTokens + pendingReward.tokens,
      stats: levelUp
        ? { ...prev.stats, maxHp: prev.stats.maxHp + 10, hp: prev.stats.maxHp + 10, atk: prev.stats.atk + 2, def: prev.stats.def + 1 }
        : prev.stats,
    } : null);

    setPendingReward(null);
    setPhase(levelUp ? "levelup" : "map");
  };

  const buyItem = (item: ShopItem) => {
    if (!hero || hero.gold < item.cost) return;
    setHero(prev => {
      if (!prev) return null;
      const stats = { ...prev.stats };
      if (item.stat === "hp") {
        stats.hp = Math.min(stats.maxHp, stats.hp + item.value);
      } else if (item.stat === "maxHp") {
        stats.maxHp += item.value;
        stats.hp    += item.value;
      } else {
        (stats[item.stat] as number) += item.value;
      }
      return { ...prev, stats, gold: prev.gold - item.cost };
    });
  };

  // ── Character creation ──────────────────────────────────────────────────────
  if (!hero) {
    return (
      <div style={{ fontFamily: "var(--font-sans, sans-serif)" }}>
        <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>Dragon Keep</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>Turn-based RPG · Earn $KEEP tokens · Rare Dragon NFTs</div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>hero name</label>
          <input value={heroName} onChange={e => setHeroName(e.target.value)}
            style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 14, outline: "none" }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>choose your class</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {HERO_CLASSES.map((cls, i) => (
              <button key={cls.name} onClick={() => setClassIdx(i)} style={{
                padding: 12, borderRadius: 10, textAlign: "left",
                border: `${classIdx === i ? "2px" : "0.5px"} solid ${classIdx === i ? "var(--orange)" : "var(--border)"}`,
                background: classIdx === i ? "var(--orange-light)" : "var(--background)", cursor: "pointer",
              }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>{cls.emoji}</div>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{cls.name}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                  HP {cls.stats.hp} · ATK {cls.stats.atk} · DEF {cls.stats.def} · SPD {cls.stats.spd}
                </div>
              </button>
            ))}
          </div>
        </div>

        <button onClick={startGame} disabled={!heroName.trim()} style={{
          width: "100%", padding: 13, borderRadius: 10, background: "var(--orange)", color: "#fff", border: "none", fontSize: 15, fontWeight: 500, cursor: "pointer", opacity: heroName.trim() ? 1 : 0.5,
        }}>
          begin your quest →
        </button>
      </div>
    );
  }

  const xpPct = Math.round((hero.xp / hero.xpToNext) * 100);

  return (
    <div style={{ fontFamily: "var(--font-sans, sans-serif)" }}>
      {/* Hero bar */}
      <div style={{ border: "0.5px solid var(--border)", borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>{hero.emoji}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{hero.name} · {hero.class}</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>Level {hero.level}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
            <span>⚔️ {hero.stats.atk}</span>
            <span>🛡 {hero.stats.def}</span>
            <span>💛 {hero.gold}</span>
            <span style={{ color: "var(--orange)", fontWeight: 500 }}>{hero.keepTokens} $KEEP</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ fontSize: 11, color: "var(--muted)", minWidth: 60 }}>HP {hero.stats.hp}/{hero.stats.maxHp}</div>
          <div style={{ flex: 1 }}>
            <StatBar current={hero.stats.hp} max={hero.stats.maxHp} color={hero.stats.hp < hero.stats.maxHp * 0.3 ? "var(--orange)" : "var(--teal)"} />
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", minWidth: 60, textAlign: "right" }}>XP {xpPct}%</div>
          <div style={{ flex: 1 }}>
            <StatBar current={hero.xp} max={hero.xpToNext} color="#7F77DD" />
          </div>
        </div>
      </div>

      {/* MAP */}
      {phase === "map" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>choose dungeon</div>
            <button onClick={() => setPhase("shop")} style={{ padding: "6px 14px", borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--background)", cursor: "pointer", fontSize: 12, color: "var(--muted)" }}>
              🏪 shop
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {DUNGEONS.map(d => {
              const locked = hero.level < d.unlockLevel;
              return (
                <button key={d.name} onClick={() => !locked && enterDungeon(d)} disabled={locked} style={{
                  border: "0.5px solid var(--border)", borderRadius: 12, overflow: "hidden",
                  cursor: locked ? "not-allowed" : "pointer", background: "var(--background)", textAlign: "left",
                  opacity: locked ? 0.5 : 1,
                }}>
                  <div style={{ height: 64, background: d.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>{d.emoji}</div>
                  <div style={{ padding: "10px 12px" }}>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{d.name}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>{locked ? `Unlock at level ${d.unlockLevel}` : d.difficulty}</div>
                    <div style={{ fontSize: 11, color: "var(--teal)" }}>+{d.reward.tokens} $KEEP · +{d.reward.xp} XP</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* COMBAT */}
      {phase === "combat" && enemy && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            {/* Hero */}
            <div style={{
              border: `2px solid ${heroFlash === "hit" ? "var(--orange)" : "var(--border)"}`,
              borderRadius: 10, padding: 12, background: heroFlash === "hit" ? "var(--orange-light)" : "var(--background)",
              transition: "all 0.2s",
            }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>{hero.emoji}</div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{hero.name}</div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>HP {hero.stats.hp}/{hero.stats.maxHp}</div>
              <StatBar current={hero.stats.hp} max={hero.stats.maxHp} color={hero.stats.hp < hero.stats.maxHp * 0.3 ? "var(--orange)" : "var(--teal)"} />
            </div>
            {/* Enemy */}
            <div style={{
              border: `2px solid ${enemyFlash === "hit" ? "var(--teal)" : "var(--border)"}`,
              borderRadius: 10, padding: 12, background: enemyFlash === "hit" ? "var(--teal-light)" : "var(--background)",
              transition: "all 0.2s",
            }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>{enemy.emoji}</div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{enemy.name}</div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6, fontStyle: "italic" }}>{enemy.lore}</div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>HP {enemy.stats.hp}/{enemy.stats.maxHp}</div>
              <StatBar current={enemy.stats.hp} max={enemy.stats.maxHp} color="var(--orange)" />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button onClick={playerAttack} disabled={acting} style={{
              flex: 1, padding: "11px", borderRadius: 8, background: "var(--orange)", color: "#fff", border: "none", fontWeight: 500, fontSize: 14, cursor: acting ? "default" : "pointer", opacity: acting ? 0.5 : 1,
            }}>
              {acting ? "fighting..." : "⚔️ attack"}
            </button>
            <button onClick={() => {
              setHero(prev => prev ? { ...prev, stats: { ...prev.stats, hp: Math.min(prev.stats.maxHp, prev.stats.hp + Math.floor(prev.stats.maxHp * 0.3)) } } : null);
              addLog(`${hero.name} drinks a healing draught (+${Math.floor(hero.stats.maxHp * 0.3)} HP)`, "player");
            }} disabled={acting} style={{
              padding: "11px 14px", borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--background)", cursor: "pointer", fontSize: 13,
            }}>🧪</button>
            <button onClick={() => { setPhase("map"); setEnemy(null); addLog("You retreat from battle!", "system"); }} style={{
              padding: "11px 14px", borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--background)", cursor: "pointer", fontSize: 13,
            }}>🏃</button>
          </div>

          {/* Combat log */}
          <div style={{ background: "var(--surface)", borderRadius: 8, padding: "8px 12px", maxHeight: 120, overflow: "hidden" }}>
            {log.slice(0, 5).map((entry, i) => (
              <div key={i} style={{ fontSize: 12, lineHeight: 1.6, color: entry.type === "player" ? "var(--teal-dark)" : entry.type === "enemy" ? "var(--orange-dark)" : "var(--muted)", opacity: 1 - i * 0.15 }}>
                {entry.type === "player" ? "▶ " : entry.type === "enemy" ? "◀ " : "· "}{entry.text}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* REWARD */}
      {phase === "reward" && pendingReward && (
        <div style={{ border: "0.5px solid var(--teal)", borderRadius: 12, padding: 20, background: "var(--teal-light)", textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🏆</div>
          <div style={{ fontSize: 16, fontWeight: 500, color: "var(--teal-dark)", marginBottom: 16 }}>Victory!</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
            {[["XP", `+${pendingReward.xp}`], ["gold", `+${pendingReward.gold}`], ["$KEEP", `+${pendingReward.tokens}`]].map(([l, v]) => (
              <div key={l} style={{ background: "var(--background)", borderRadius: 8, padding: "10px 8px" }}>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>{l}</div>
                <div style={{ fontSize: 18, fontWeight: 500, color: "var(--teal-dark)" }}>{v}</div>
              </div>
            ))}
          </div>
          <button onClick={claimReward} style={{ width: "100%", padding: 12, borderRadius: 8, background: "var(--teal)", color: "#fff", border: "none", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
            claim rewards →
          </button>
        </div>
      )}

      {/* LEVEL UP */}
      {phase === "levelup" && (
        <div style={{ border: "0.5px solid var(--amber)", borderRadius: 12, padding: 20, background: "var(--amber-light)", textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>⬆️</div>
          <div style={{ fontSize: 18, fontWeight: 500, color: "var(--amber-dark)", marginBottom: 4 }}>Level {hero.level}!</div>
          <div style={{ fontSize: 13, color: "var(--amber-dark)", marginBottom: 16 }}>
            All stats increased · +10 max HP · +2 ATK · +1 DEF
          </div>
          <button onClick={() => setPhase("map")} style={{ padding: "10px 24px", borderRadius: 8, background: "var(--amber)", color: "#fff", border: "none", fontSize: 14, cursor: "pointer" }}>
            continue
          </button>
        </div>
      )}

      {/* SHOP */}
      {phase === "shop" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>🏪 Dragon Keep Shop</div>
            <div style={{ fontSize: 13, color: "var(--amber-dark)" }}>💛 {hero.gold} gold</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            {SHOP_ITEMS.map(item => (
              <button key={item.id} onClick={() => buyItem(item)} disabled={hero.gold < item.cost} style={{
                border: "0.5px solid var(--border)", borderRadius: 10, padding: "10px 12px", textAlign: "left",
                cursor: hero.gold < item.cost ? "not-allowed" : "pointer",
                background: "var(--background)", opacity: hero.gold < item.cost ? 0.5 : 1,
              }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{item.emoji}</div>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 1 }}>{item.name}</div>
                <div style={{ fontSize: 11, color: "var(--teal)" }}>{item.effect}</div>
                <div style={{ fontSize: 12, color: "var(--amber-dark)", marginTop: 4 }}>💛 {item.cost}</div>
              </button>
            ))}
          </div>
          <button onClick={() => setPhase("map")} style={{ width: "100%", padding: 10, borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--background)", cursor: "pointer", fontSize: 13, color: "var(--muted)" }}>
            ← back to map
          </button>
        </div>
      )}
    </div>
  );
}
