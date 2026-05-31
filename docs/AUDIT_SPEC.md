# game.tok — Smart Contract Audit Specification

**Submitted to:** Ottersec / Neodyme  
**Version:** 1.0  
**Date:** April 2025  
**Contact:** security@gametok.io  
**Repo:** github.com/game-tok/programs (private, access will be granted)

---

## Scope

Nine Anchor programs written in Rust, targeting Solana mainnet-beta. All programs use Anchor 0.30.0 and anchor-spl 0.30.0.

| Program | File | Lines (approx) | Priority |
|---|---|---|---|
| `token_factory` | programs/token_factory/src/lib.rs | ~320 | P1 |
| `liquidity_lock` | programs/liquidity_lock/src/lib.rs | ~250 | P1 |
| `game_state` | programs/game_state/src/lib.rs | ~480 | P1 |
| `tournament` | programs/tournament/src/lib.rs | ~420 | P1 |
| `vrf_consumer` | programs/vrf_consumer/src/lib.rs | ~380 | P1 |
| `liquidity_matching` | programs/liquidity_matching/src/lib.rs | ~360 | P2 |
| `governance` | programs/governance/src/lib.rs | ~440 | P2 |
| `clockwork_automation` | programs/clockwork_automation/src/lib.rs | ~280 | P3 |
| `referral` | programs/referral/src/lib.rs | ~310 | P3 |

**Total:** ~3,240 lines of Rust across all programs.

P1 programs handle user funds directly and must be audited before any mainnet deployment.  
P2 programs handle governance and matching funds — audit before governance launch.  
P3 programs are automation and referrals — lower risk, audit before full feature launch.

**Out of scope:** Frontend (Next.js), TypeScript SDK, scripts, test files.

---

## Architecture Overview

game.tok is a game launchpad on Solana. Each game has its own token economy managed by these programs. Programs communicate via CPI (cross-program invocation) rather than shared state.

```
Creator calls:
  token_factory::create_fungible_token
    → mints fixed supply, revokes mint authority
  game_state::register_game
    → validates EV+ params, creates game account
  [Raydium CPI] createPool
    → creates AMM pool
  liquidity_lock::lock_liquidity
    → locks LP tokens for minimum 180 days

Player calls:
  vrf_consumer::request_raid_randomness
    → escrows stake, requests Switchboard oracle
  vrf_consumer::settle_raid (called by Switchboard oracle)
    → resolves outcome, distributes rewards
  game_state::stake_tokens / claim_stake_yield
  tournament::enter_tournament / claim_prize

Governance:
  governance::claim_player_airdrop (merkle proof)
  governance::create_proposal / cast_vote / execute_proposal

Automation (Clockwork threads):
  clockwork_automation::execute_fee_sweep
  clockwork_automation::finalize_tournament_auto
```

---

## Program-by-Program Specification

---

### 1. `token_factory`

**Purpose:** Create fungible game tokens (SPL) and NFT collections.

#### Instruction: `create_fungible_token`

**Intent:** Mint the full token supply to a creator vault, then permanently revoke mint authority to ensure a fixed supply.

**Preconditions:**
- Caller is the transaction signer (creator)
- `mint` is a fresh Keypair with no prior state
- Allocations sum to exactly 10,000 basis points

**On-chain validation:**
```rust
require!(
    alloc_player_rewards + alloc_liquidity + alloc_dev + alloc_treasury + alloc_airdrop == 10_000,
    GameTokError::AllocationMismatch
);
```

**Post-conditions:**
- `mint.supply == params.total_supply`
- `mint.mint_authority == None` (revoked via `set_authority`)
- `creator_vault.amount == params.total_supply`
- `game_token` PDA exists and stores all allocation metadata

**Critical path:** The `set_authority(AuthorityType::MintTokens, None)` call must succeed. If it fails (e.g. due to CPI error), the supply is minted but mint authority is NOT revoked — a critical vulnerability that would allow unlimited minting. **Auditors: verify this cannot be exploited.**

**Known edge cases:**
- `total_supply == 0`: rejected by token program (mint_to with 0 should fail)
- Integer overflow in allocation sum: Rust u16 arithmetic, max value 65535, sum of five u16s max 50000 — no overflow risk at u32 level, but check that 10_000 comparison uses same type

#### Instruction: `create_nft_collection`

**Intent:** Create a Metaplex-compatible NFT collection with a capped max supply.

**Preconditions:** `max_supply > 0`

**Post-conditions:**
- `collection.minted == 0`
- `collection.max_supply == params.max_supply`
- Collection mint created with `decimals == 0`

#### Instruction: `mint_nft`

**Intent:** Mint one NFT into an existing collection, incrementing the minted counter.

**Critical:** `require!(coll.minted < coll.max_supply)` must be checked **before** the mint CPI, not after. Current code does this correctly, but auditors should verify there is no re-entrancy path where `minted` is read, CPI fires, and then checked again.

**Post-conditions:**
- `collection.minted == old_minted + 1`
- `nft_record` PDA exists with correct fields
- Recipient's ATA holds exactly 1 token

---

### 2. `liquidity_lock`

**Purpose:** Lock LP tokens from a Raydium/Orca pool for a minimum duration. This is the primary anti-rug mechanism. No instruction exists to unlock early — the only way out is `withdraw_liquidity` after `unlock_ts`.

#### Instruction: `lock_liquidity`

**Intent:** Transfer LP tokens from creator's ATA into a PDA vault where they are locked until `unlock_ts`.

**Preconditions:**
```rust
require!(params.lock_duration_secs >= 15_552_000, LockError::LockTooShort); // 180 days
require!(params.amount > 0, LockError::ZeroAmount);
```

**Post-conditions:**
- `lp_lock.amount == params.amount`
- `lp_lock.unlock_ts == Clock::get()?.unix_timestamp + params.lock_duration_secs`
- `lp_lock.withdrawn == false`
- `lock_vault.amount == params.amount` (tokens transferred in)
- Creator's ATA decreased by `params.amount`

**Critical — PDA owns vault:** `lock_vault` is initialized with `token::authority = lp_lock` (the PDA). The PDA signer seeds are `[b"lp_lock", game_id.to_le_bytes()]`. **Auditors: verify that the PDA cannot be spoofed by passing a different game_id that happens to have the same PDA address.**

**There is no admin override.** There is no `set_authority`, `emergency_withdraw`, or owner-privileged instruction. This is intentional and must remain true. If auditors find any path by which tokens can be transferred out before `unlock_ts`, this is a critical finding.

#### Instruction: `withdraw_liquidity`

**Preconditions:**
```rust
require!(!lock.withdrawn, LockError::AlreadyWithdrawn);
require!(Clock::get()?.unix_timestamp >= lock.unlock_ts, LockError::StillLocked);
require!(ctx.accounts.owner.key() == lock.owner, LockError::Unauthorized);
```

**Double-withdraw prevention:** `lock.withdrawn = true` is set before the token transfer CPI. **Auditors: verify this prevents any re-entrancy or double-spend path.**

**Post-conditions:**
- `lp_lock.withdrawn == true`
- Owner's ATA increased by `lock.amount`
- `lock_vault.amount == 0`

---

### 3. `game_state`

**Purpose:** Core game logic. Player accounts, raid resolution, staking, EV+ enforcement.

#### Critical invariant: EV+ enforcement

**This invariant must hold for every registered game:**
```rust
require!(
    params.min_skill_reward_bps + params.tournament_pool_bps >= 8_000,
    GameError::InsufficientPlayerRewards
);
require!(
    params.house_edge_bps <= MAX_HOUSE_EDGE_BPS, // 2000
    GameError::HouseEdgeTooHigh
);
```

**Auditors: verify these checks cannot be bypassed.** If a creator can register a game that violates EV+, players will be deceived about the odds.

#### Instruction: `execute_raid`

**Intent:** Resolve a raid using slot-hash pseudo-RNG (devnet only — mainnet uses vrf_consumer). Distribute rewards from the game reward vault.

**RNG note:** The current `slot_hash ^ (raids_won * 7919) ^ seed` is NOT secure randomness. It is manipulable by a validator who can influence their own slot hash. This is explicitly marked as devnet-only. **The vrf_consumer program must be used on mainnet. Auditors: verify no production deployment path accidentally uses slot-hash RNG.**

**Reward calculation:**
```rust
let net_bps = base_mult_bps + level_bonus_bps - house_edge_bps;
let reward  = stake * net_bps / 10_000;
```
**Auditors: check for overflow.** `stake` is u64, `net_bps` max ~20000. Product `stake * 20000` can overflow u64 if `stake > u64::MAX / 20000 ≈ 922 trillion`. In practice max stake is bounded by token supply, but an explicit `checked_mul` is safer.

**Player level-up:**
```rust
let xp_threshold = (player.level as u64).pow(2) * 1000;
if player.xp >= xp_threshold && player.level < MAX_LEVEL {
    player.level += 1;
}
```
**Auditors: verify `player.level < MAX_LEVEL` (100) prevents overflow on `level as u64 * level as u64`.**

#### Instruction: `stake_tokens`

**Post-conditions:**
- `stake_record` PDA created with `amount`, `staked_at`, `last_claim`
- Player's ATA decreased by `amount`
- `stake_vault.amount` increased by `amount`

#### Instruction: `claim_stake_yield`

**Yield formula:**
```rust
let yield_amount = stake.amount * yield_rate_bps * days_elapsed / 10_000;
```
**Auditors: check overflow.** If `stake.amount` is near u64::MAX and `days_elapsed` is large, this can overflow. Should use `checked_mul` with u128 intermediate.

**`last_claim` update:** `stake.last_claim = now` must be set before the transfer CPI to prevent re-entrancy. **Auditors: verify ordering.**

---

### 4. `tournament`

**Purpose:** Trustless prize pool tournaments. Creator funds pool; players enter; on-chain rankings; winners claim.

#### Instruction: `create_tournament`

**Preconditions:**
```rust
require!(params.prize_pool > 0, TournamentError::ZeroPrizePool);
require!(params.start_ts > Clock::get()?.unix_timestamp, TournamentError::StartInPast);
require!(params.end_ts > params.start_ts, TournamentError::InvalidTimeRange);
require!(params.winner_count <= MAX_WINNERS as u8, TournamentError::TooManyWinners);
```

**Prize shares:** `prize_shares` is a Vec<u16> (bps). **Auditors: verify the program rejects prize_shares that sum to > 10,000. Currently there is no such check — if prize_shares sum to 20,000, winners can drain 2× the prize pool. This is a HIGH severity finding to address.**

Recommended fix:
```rust
let total_shares: u32 = params.prize_shares.iter().map(|&s| s as u32).sum();
require!(total_shares <= 10_000, TournamentError::InvalidPrizeShares);
```

#### Instruction: `claim_prize`

**Double-claim prevention:** `entry.claimed = true` is set before the token transfer CPI. **Auditors: verify this prevents double-claim in any re-entrancy scenario.**

**Rank lookup:** The winning check uses `Vec::position` on `final_rankings`. If `final_rankings` contains duplicate entries (same wallet twice), a player could claim twice with different `entry` accounts. **Auditors: verify `finalize_tournament` prevents duplicate wallet entries in `final_rankings`.**

---

### 5. `vrf_consumer`

**Purpose:** Replace slot-hash RNG with Switchboard VRF for provably-fair raid resolution.

#### Instruction: `request_raid_randomness`

**Stake escrow:** Player's stake is transferred to a PDA vault (`stake_escrow`) at request time. The PDA is derived from `[b"stake_escrow", raid_request_pubkey]`. The `raid_request` PDA itself is derived from `[b"raid_request", player, game_id, slot]`.

**Expiry protection:** If the oracle doesn't respond within `REQUEST_EXPIRY_SECS` (300s), the player can call `reclaim_expired_stake`. **Auditors: verify the expiry check in `reclaim_expired_stake` cannot be bypassed by clock manipulation.**

#### Instruction: `settle_raid`

**Oracle authentication:**
```rust
require!(
    ctx.accounts.function_request.load()?.function == ctx.accounts.switchboard_function.key(),
    VrfError::UnauthorizedSettler
);
```
**This is the most critical security check in the entire codebase.** If this can be bypassed, anyone could call `settle_raid` with a manipulated VRF result and steal from the reward vault.

**Auditors: verify:**
1. `function_request` is a valid Switchboard `FunctionRequestAccountData` account
2. The `is_triggered == 1` constraint actually proves the oracle ran the computation
3. The Switchboard program ID constraint is correctly enforced (should be checked against a hardcoded trusted pubkey, not passed as an account)

**Reward vault authority:** The reward vault is owned by a PDA `[b"reward_vault_authority", game_id]`. The `settle_raid` instruction transfers from this vault using PDA signer seeds. **Auditors: verify the seeds match exactly — a mismatch would mean the instruction always fails silently.**

---

### 6. `liquidity_matching`

**Purpose:** Protocol treasury matches creator liquidity 1:1 for vetted games.

#### Instruction: `approve_match`

**Committee voting:** Requires 3 of 5 committee members to approve. Each member can only vote once (tracked in `app.approvers`).

**Double-vote prevention:**
```rust
require!(!app.approvers.contains(&voter), MatchError::AlreadyVoted);
```
**Auditors: verify `approvers` array is properly initialized (all Pubkey::default()) and that `contains` correctly identifies non-default entries.**

**Treasury CPI on approval:**
```rust
if app.approvals >= COMMITTEE_THRESHOLD {
    // Transfer matching SOL from treasury to escrow
}
```
**Auditors: verify this cannot be triggered multiple times.** If approval check is >=3 rather than ==3, a 4th vote would trigger another transfer. The `status` check (`require!(app.status == Pending)`) prevents this, but verify the ordering.

---

### 7. `governance`

**Purpose:** $GTOK DAO. Merkle-proof airdrop, proposal creation, voting, timelock execution.

#### Instruction: `claim_player_airdrop`

**Merkle proof verification:**
```rust
fn verify_merkle_proof(leaf: [u8; 32], proof: &[[u8; 32]], root: [u8; 32]) -> bool {
    // ... standard binary merkle verification
}
```
**Auditors: verify the leaf construction is pre-image resistant.** Current construction:
```rust
let leaf = keccak::hashv(&[claimant.key().as_ref(), &amount.to_le_bytes()]).0;
```
This is standard. Verify there is no second pre-image attack where a different (wallet, amount) pair produces the same leaf.

**Double-claim prevention:** `airdrop_claim` PDA derived from `[b"airdrop_claim", claimant]`. Since each wallet maps to exactly one PDA, and `init` will fail if the account exists, double-claiming via two transactions is impossible. **Auditors: confirm this PDA derivation is correct and unique per wallet.**

#### Instruction: `execute_proposal`

**Timelock:**
```rust
require!(
    now >= prop.voting_ends + TIMELOCK_SECS, // 48 hours
    GovError::TimelockNotExpired
);
```

**Parameter bounds:**
```rust
GovernanceAction::SetProtocolFeeBps(bps) => require!(bps <= 500), // max 5%
GovernanceAction::SetMaxHouseEdgeBps(bps) => require!(bps <= 3000), // max 30%
GovernanceAction::SetMatchCap(lamports) => require!(lamports <= 50_000_000_000), // max 50 SOL
```
**Auditors: verify these bounds are appropriate and cannot be changed by governance (circular dependency risk — governance voting to raise its own bounds).**

---

## Known Issues (Pre-Audit Self-Assessment)

The following are issues the team has already identified. They are listed here so auditors can verify fixes rather than discover them:

| ID | Program | Severity | Description | Status |
|---|---|---|---|---|
| K-01 | `game_state::claim_stake_yield` | Medium | Potential overflow in yield calculation — `stake.amount * days_elapsed` | Needs `checked_mul` with u128 |
| K-02 | `game_state::execute_raid` | Medium | Potential overflow in `stake * net_bps` if stake is near u64::MAX | Needs checked arithmetic |
| K-03 | `tournament::create_tournament` | High | No validation that `prize_shares` sum ≤ 10,000 | Needs sum check |
| K-04 | `vrf_consumer` | Critical | Uses devnet slot-hash RNG; must not be deployed to mainnet | VRF integration required; not in scope for devnet audit |
| K-05 | `governance` | Low | `GovernanceAction` enum uses `Copy` — verify this doesn't cause issues with Vec storage | Needs verification |

---

## Test Coverage

Tests are in `tests/game_tok.ts` and `tests/vrf_and_matching.ts`.

Current coverage:
- `token_factory`: allocation validation, NFT collection creation, mint authority revocation
- `liquidity_lock`: lock creation, duration enforcement, double-withdrawal prevention
- `game_state`: EV+ enforcement, house edge cap, player join, level-up
- `tournament`: prize pool creation, entry, finalization, claim
- `liquidity_matching`: committee voting, threshold, unauthorized voter rejection

**Gaps (auditors may wish to add):**
- `governance` claim with invalid merkle proof
- `vrf_consumer` settlement with non-oracle caller
- Clock manipulation edge cases (near-boundary timestamps)
- All instructions with zero-balance accounts
- All instructions with wrong PDA seeds

---

## Deployment Checklist (Pre-Mainnet)

Before requesting mainnet deployment approval, the following must be true:

- [ ] All P1 programs pass audit with no critical or high findings outstanding
- [ ] K-03 (prize_shares sum check) fixed and re-tested
- [ ] K-01, K-02 arithmetic overflow fixed and re-tested
- [ ] `vrf_consumer` Switchboard function deployed and verified on devnet
- [ ] Slot-hash RNG path removed or gated behind a devnet-only feature flag
- [ ] Upgrade authority transferred to 3-of-5 multisig (Squads)
- [ ] All program IDs updated from placeholders to real deployed addresses
- [ ] `token_factory` compile-verified: `set_authority(None)` call succeeds in integration test
- [ ] Bug bounty program live on Immunefi before public launch

---

## Questions for Auditors

1. Is the Switchboard oracle authentication in `vrf_consumer::settle_raid` sufficient, or does it need additional checks?
2. Are there any known attacks on the binary merkle tree implementation in `governance`?
3. Is the PDA ownership pattern (using `Account<'info, TokenAccount>` with `token::authority = pda`) the correct pattern for PDA-owned vaults, or should we use `init` constraints differently?
4. Does the `lp_lock` double-withdraw prevention hold under concurrent transaction scenarios, given Solana's parallel execution model?
5. Are there any account confusion attacks where an attacker could pass a valid but unexpected account for any `AccountInfo<'info>` (unchecked) field?

---

*All programs are subject to the Apache 2.0 license. Audit report will be published publicly on the game.tok website and Discord before mainnet launch.*
