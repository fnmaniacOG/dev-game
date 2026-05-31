# game.tok Tokenomics Whitepaper

**Version 1.0 · Draft for community review**

---

## Abstract

game.tok is a multi-token game launchpad on Solana where every game has its own token economy, governed by on-chain rules that protect players. This document describes the tokenomics framework, EV+ enforcement mechanism, liquidity lock system, and NFT economic model.

---

## 1. Protocol architecture

game.tok is four Anchor programs working together:

| Program | Role |
|---|---|
| `token_factory` | Mints game FTs and NFT collections |
| `liquidity_lock` | Locks LP tokens for a minimum of 180 days |
| `game_state` | Player accounts, game loop, skill rewards, staking |
| `tournament` | Trustless prize pool tournaments |

Game creators deploy through the platform UI. The programs enforce rules that cannot be bypassed — not by developers, not by creators.

---

## 2. Token types

### 2.1 Fungible tokens (FT)

Each game may issue one fungible SPL token. Key properties enforced at mint:

- Mint authority revoked immediately after initial supply mint — **fixed supply forever**
- Allocations validated on-chain to sum to exactly 10,000 basis points (100%)
- Minimum liquidity allocation: enforced in the recommended UI (not hard-coded in program, allowing flexibility for edge cases)

### 2.2 NFTs

Games may issue one or more NFT collections using the Metaplex standard:

- Each collection has a configurable `max_supply`
- Rarity tiers: common (60%), rare (25%), epic (12%), legendary (3%)
- Traits are deterministic — derived from mint pubkey + edition number
- Royalties enforced via Metaplex creator shares (default: 5% = 500 bps)

### 2.3 Hybrid (FT + NFT)

A game may have both. The FT serves as the in-game currency (earned through raids, staking, tournaments). NFTs modify player stats and grant passive staking yield multipliers.

---

## 3. Tokenomics templates

The AI designer suggests allocations based on game type. All are editable by the creator, subject to on-chain constraints.

### RPG (default)
| Bucket | Allocation | Notes |
|---|---|---|
| Player rewards | 40% | Raid prizes, quest completion |
| Liquidity | 20% | Locked via `liquidity_lock` |
| Dev | 15% | 24-month linear vest recommended |
| Treasury | 15% | DAO-controlled for future development |
| Airdrop | 10% | Early adopter incentive |

### Mini game
| Bucket | Allocation |
|---|---|
| Player rewards | 55% |
| Liquidity | 25% |
| Dev | 10% |
| Treasury | 5% |
| Airdrop | 5% |

### Ponzi / social game
Ponzi games deliberately allocate more to liquidity (30%) to sustain the pool longer, and less to player rewards (30%), reflecting the higher-risk, higher-reward structure. The transparent disclosure UI is mandatory for this game type.

### Puzzle / educational
Educational games maximize player rewards (60%) because virality is driven by players genuinely earning — making it the stickiest model. Dev allocation is minimized (10%).

---

## 4. Liquidity lock mechanism

**The most important player protection on the platform.**

When a game launches:
1. The creator adds SOL + game tokens to a Raydium/Orca liquidity pool
2. The resulting LP tokens are transferred to the `liquidity_lock` program
3. The lock is permanent for the specified duration — **no admin override exists**
4. The on-chain `LpLock` account is publicly readable — anyone can verify the lock on Solscan

### Lock durations
| Option | Use case |
|---|---|
| 180 days (minimum) | Short-term games, proof of concept |
| 1 year | Standard launch |
| 2 years | Flagship games with long-term roadmap |
| Permanent | Maximum trust signal |

### Why this matters
pump.fun and most token launchpads allow creators to remove liquidity at any time. This is the primary vector for rug pulls. On game.tok, LP lock is not a checkbox — it is enforced by a program that has no `set_admin` or `upgrade_override` instruction.

---

## 5. EV+ enforcement

The `game_state` program enforces positive expected value for players at the protocol level.

### On-chain constraints
```
house_edge_bps ≤ 2,000        (20% maximum)
skill_reward_bps + tournament_pool_bps ≥ 8,000
```

These checks run in `register_game`. Any game that violates them cannot be registered — the transaction fails.

### Player EV model

For a skill-based game like Viking Raid:

```
EV = win_rate × reward_multiplier × (1 − house_edge) − loss_rate
```

At default settings (house_edge = 15%, reward_mult = 1.75×):

| Player tier | Win rate | EV per raid |
|---|---|---|
| New (level 1) | 45% | −3.9% |
| Average (level 20) | 52% | +4.1% |
| Skilled (level 40) | 62% | +12.8% |
| Expert (level 50 + Legendary ship) | 69% | +19.4% |

The beginner experience is slightly negative EV by design — players are learning and the game provides guided quests with guaranteed rewards to offset this. Active players at level 20+ are positive EV.

### Fee distribution
Of all protocol fees collected:
- **80% → players** (skill rewards, tournaments, staking yield)
- **20% → protocol treasury** (development, audits, marketing)

---

## 6. NFT economic model

### In-game utility
NFTs are not pure collectibles. Every NFT on game.tok has mechanical utility:

| Rarity | Win rate bonus | Reward multiplier | Staking yield mult |
|---|---|---|---|
| Common | +0% | 1.0× | 1.0× |
| Rare | +3% | 1.05× | 1.2× |
| Epic | +6% | 1.12× | 1.5× |
| Legendary | +9% | 1.20× | 2.0× |

### Royalty flow
Secondary market sales generate royalties (default 5%), split:
- 70% → game creator / dev treasury
- 30% → player reward pool (reinforces EV+)

### Multiple collections
A game can deploy multiple NFT collections (e.g. Ships + Heroes + Items). Each has its own `NftCollection` account and supply cap. Players can equip one NFT per slot.

---

## 7. Staking

Players can stake their game tokens for passive daily yield:

- Default yield rate: 0.5% per day (configurable per game, bounded by creator)
- Yield paid from the treasury allocation
- Staking does not lock tokens — withdrawals are instant
- Legendary NFT holders earn 2× yield multiplier

### Sustainable staking rate
At 0.5%/day, a 10% treasury allocation sustains staking for:
```
treasury_tokens / (staked_supply × 0.005) days
```
For a 1B token supply with 10% treasury and 20% staked:
```
100M / (200M × 0.005) = 100 days
```
Creators are shown this runway estimate in the launch UI and encouraged to set rates that maintain long-term health.

---

## 8. Tournament economics

Tournaments create a provably fair, EV-neutral redistribution mechanism:

- Creator funds prize pool from treasury allocation
- Players enter (free or with entry fee)
- Entry fees add to the prize pool — 100% returned to winners
- Prize shares are set at creation time and immutable thereafter
- All prize claims execute directly against the on-chain vault

The standard prize distribution for a 4-place tournament:
- 1st: 50%
- 2nd: 25%
- 3rd: 15%
- 4th: 10%

Tournaments are EV-neutral for the prize pool (100% in, 100% out) but EV+ overall because skilled players can earn more per hour than casual ones.

---

## 9. Ponzi game disclosures

Ponzi-mechanic games are permitted on game.tok under a mandatory transparency framework:

1. The game type must be declared as `ponzi` at launch
2. The UI must display live pool stats, including total deposited, total paid, and estimated collapse date
3. The creator cannot set `is_educational = false` for ponzi games — they must include a disclosure
4. Players see the expected % of entrants who profit before entering

This model acknowledges reality: many crypto games are ponzi-adjacent. By making the mechanics explicit and transparent, game.tok turns a predatory pattern into an educational one.

---

## 10. Revenue model

game.tok earns 2% of all on-chain game transactions (configurable via governance after launch). This fee is collected in the `execute_raid`, `claim_prize`, and staking yield instructions and routed to the protocol treasury.

At $10M in daily on-chain game volume (achievable with 5–10 active popular games):
- Daily protocol revenue: ~$200,000
- Annual run rate: ~$73M

---

## 11. Governance roadmap

Phase 1 (launch): Creator-controlled games, protocol parameters set by founding team.

Phase 2 (6 months post-launch): Protocol DAO via a governance token airdropped to top players across all games. DAO controls fee rates and treasury spending.

Phase 3 (12 months): Fully decentralized game approval, fee structure voted on-chain. Founding team retains 0 special privileges.

---

*This document is a draft. Parameters are subject to change before mainnet launch. All on-chain mechanics described are implemented in the Anchor programs in this repository.*
