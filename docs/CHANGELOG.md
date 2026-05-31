# game.tok v2 — Changelog

## What's new in v2

---

### 1. Switchboard VRF Integration

**Files:** `programs/vrf_consumer/`, `app/src/hooks/useVrfRaid.ts`, `app/src/components/VrfRaidStatus.tsx`

Replaces the slot-hash pseudo-RNG in `game_state::execute_raid` with cryptographically verified randomness from Switchboard's SGX oracle network.

**How it works:**
- Player calls `request_raid_randomness()` — stake locked in PDA escrow immediately
- Switchboard oracle picks up the request (~1–2 slots, <1 second)
- Oracle runs resolution inside an Intel SGX enclave — neither game.tok nor any human can see or influence the result
- Oracle calls `settle_raid()` on-chain with the verified random u64
- Player receives outcome + rewards in the same settlement transaction

**Player UX:** The `useVrfRaid` hook manages the async flow. `VrfRaidStatus` shows a live progress indicator while the oracle responds, then the verified roll and on-chain proof link on settlement.

**Expiry protection:** If the oracle doesn't respond within 5 minutes (rare), the player can call `reclaim_expired_stake()` to get their stake back in full.

**Production steps:**
1. Deploy a Switchboard function: `npx @switchboard-xyz/solana-sdk build`
2. Replace `SWITCHBOARD_FUNCTION` constant with your deployed function ID
3. Update `switchboard_function.ts` with actual program discriminators from IDL

---

### 2. AI Game Designer v2

**Files:** `app/src/pages/api/generate-game-v2.ts`, `app/src/components/AiGameDesignerV2.tsx`

Complete rewrite of the AI generation endpoint. v1 returned a loose text blob. v2 returns a fully validated JSON object that auto-fills the entire launch form.

**New structured output includes:**
- Complete raid targets (name, emoji, difficulty, loot, win chance, XP, lore sentence)
- Full question banks for puzzle/educational games (category, difficulty, 4 options, correct index, explanation, reward)
- Ponzi mechanics with mandatory transparency disclosure text
- Strategy game rules (map size, turn duration, victory conditions, unit types)
- NFT rarity tier table with mechanical stats (win bonus, reward multiplier, staking multiplier, trait arrays)
- Art direction (palette, style, banner color, character/environment descriptions)
- EV analysis and sustainability commentary
- Allocation reasoning (why each tokenomics choice was made)

**Auto-correction:** If Claude returns allocations that don't sum to 10,000 bps (can happen with complex games), the endpoint auto-rescales them proportionally before returning.

**Suggestion chips:** 6 pre-written prompts in the UI to help creators get started quickly.

---

### 3. Creator Dashboard

**Files:** `app/src/components/creator/CreatorDashboard.tsx`

Full analytics and management interface for game creators. Replaces the basic settings tab.

**Features:**
- **Overview tab:** 14-day charts (raids, players, rewards), live stats cards, win rate distribution histogram, LP lock status with Solscan link
- **Rewards tab:** Reward pool consumption bar, estimated runway at current burn rate, EV health check (house edge, player EV, skill cap EV, runway)
- **NFTs tab:** Mint progress, rarity distribution (common/rare/epic/legendary), secondary royalty revenue tracker
- **Tournaments tab:** List of active/upcoming/ended tournaments with entry counts and prize pools, Create Tournament modal (prize pool, entry fee, max entrants, duration, prize share split)
- **Settings tab:** Game metadata display, pause/unpause game (calls `game_state::set_paused`), export player data

**Tournament creation:** The Create Tournament modal builds and submits the `tournament::create_tournament` instruction, locking prize pool tokens in the smart contract immediately.

---

### 4. Liquidity Matching Program

**Files:** `programs/liquidity_matching/`, `app/src/components/LiquidityMatchingUI.tsx`

On-chain program that lets the protocol treasury match creator liquidity 1:1 (up to 5 SOL) for vetted games, removing the cold-start barrier for indie developers.

**On-chain flow:**
1. `initialize` — protocol sets committee keys (5 members) and per-game match cap
2. `apply_for_match` — creator deposits their SOL into PDA escrow; application created
3. `approve_match` — committee members vote; 3/5 threshold releases matching SOL from treasury
4. `deploy_liquidity` — both SOL amounts go into Raydium pool; LP tokens split 50/50, both halves locked
5. `reclaim_deposit` — creator gets SOL back if rejected or expired (7-day window)

**Alignment mechanic:** game.tok earns 10% of the matched game's protocol fees while match LP is active. Protocol only profits if the game succeeds — no grants, no equity.

**Vetting checklist:** EV+ compliance (required), liquidity lock 180+ days (required), security audit (recommended), no prior rug (required), working devnet build (recommended).

**UI tabs:**
- *How it works* — 4-step explainer + vetting criteria + alignment mechanic
- *Apply* — form with real-time match estimate, committee progress tracker
- *My Applications* — status tracker with committee vote breakdown, deploy button on approval

---

## Migration from v1

v2 programs are additive — v1 programs are unchanged. The VRF consumer program is a parallel path; `game_state::execute_raid` still works with slot-hash RNG for devnet testing. Before mainnet:

1. Deploy `vrf_consumer` program
2. Deploy your Switchboard function
3. Update all raid-initiating calls to use `vrf_consumer::request_raid_randomness` instead of `game_state::execute_raid`
4. Update `useVrfRaid` hook with real IDL and program calls

---

## Total program count: 6

| Program | Purpose | Status |
|---|---|---|
| token_factory | FT + NFT minting | v1 (stable) |
| liquidity_lock | LP token locking | v1 (stable) |
| game_state | Game loop, staking, EV enforcement | v1 (stable) |
| tournament | Prize pool tournaments | v1 (stable) |
| vrf_consumer | Verifiable randomness for raids | **v2 (new)** |
| liquidity_matching | Protocol liquidity matching | **v2 (new)** |
