# game.tok — Audit & Deployment Guide

## Smart Contract Architecture

Three Anchor programs on Solana:

| Program | ID (devnet) | Purpose |
|---|---|---|
| token_factory | TokFact111... | Mint FT + NFT collections |
| liquidity_lock | LiqLock111... | Lock LP tokens (immutable once locked) |
| game_state | GameState11... | Player accounts, raids, staking, EV enforcement |

---

## Pre-Audit Checklist

### 1. Code freeze
- [ ] All program logic finalized — no changes after submission
- [ ] Full test suite passing (`anchor test`)
- [ ] No `#[cfg(test)]` bypasses in production paths
- [ ] All `TODO` and `FIXME` comments resolved

### 2. Known risk areas to flag with auditors

**token_factory**
- Mint authority revocation: verify `set_authority(..., None)` succeeds atomically
- Allocation sum check: `alloc_* sum == 10_000` enforced on-chain
- NFT mint: ensure supply cap `minted < max_supply` is checked before CPI

**liquidity_lock**
- PDA owns the vault — verify signer seeds match across lock/withdraw
- `lock_duration_secs >= 15_552_000` — cannot be bypassed by creator
- `withdrawn` flag — prevent double-withdraw race condition

**game_state**
- `house_edge_bps <= 2000` enforced on-chain (auditors: verify this cannot overflow)
- `skill_reward_bps + tournament_pool_bps >= 8000` — EV+ guarantee
- Pseudo-RNG (slot hash) — flag for Switchboard VRF upgrade before mainnet
- CPI reward transfer: verify PDA seeds in `execute_raid` match `register_game`
- Player level overflow: `level < MAX_LEVEL` (100) check before increment

---

## Recommended Audit Firms (Solana)

### Tier 1 — Full manual audit
| Firm | Contact | Est. Cost | Timeline |
|---|---|---|---|
| **Ottersec** | security@ottersec.io | $40K–$80K | 4–8 weeks |
| **Neodyme** | contact@neodyme.io | $35K–$70K | 4–6 weeks |
| **Halborn** | halborn.com/contact | $50K–$100K | 6–10 weeks |

### Tier 2 — Automated + manual (good for first pass)
| Firm | Contact | Est. Cost |
|---|---|---|
| **Sec3 (Soteria)** | sec3.dev | $8K–$20K |
| **OShield** | oshield.io | $10K–$25K |

### Recommended sequence
1. Run Sec3 automated scan immediately (fast, cheap, catches common issues)
2. Fix all findings
3. Submit to Ottersec or Neodyme for full manual audit
4. Fix critical + high findings
5. Re-review by same firm
6. Publish audit report publicly

---

## Switchboard VRF Integration (replace slot-hash RNG)

```rust
// Replace execute_raid pseudo-RNG with Switchboard VRF
// 1. Add to Cargo.toml:
//    switchboard-solana = "0.29"

use switchboard_solana::prelude::*;

pub fn request_randomness(ctx: Context<RequestRandomness>) -> Result<()> {
    let request = &mut ctx.accounts.vrf_request;
    // Request randomness — callback fires consume_randomness
    SwitchboardRandomnessRequest::request(
        &request.to_account_info(),
        &ctx.accounts.switchboard_program,
        // ... accounts
    )?;
    Ok(())
}

pub fn consume_randomness(ctx: Context<ConsumeRandomness>, result: u64) -> Result<()> {
    let roll = (result % 100) as u8;
    // resolve raid outcome with roll
    Ok(())
}
```

**Note:** VRF adds 1–2 slot latency to raid resolution. Build UI to handle
the async pattern: "raid submitted" → spinner → "result ready."

---

## Deployment Sequence (Mainnet)

```bash
# 1. Build all programs
anchor build

# 2. Run full test suite on devnet
anchor test --provider.cluster devnet

# 3. Deploy to devnet first
anchor deploy --provider.cluster devnet

# 4. Verify program IDs match Anchor.toml
solana program show TokFact111...

# 5. After successful audit, deploy to mainnet-beta
anchor deploy --provider.cluster mainnet-beta

# 6. Verify on Solscan
open https://solscan.io/account/TokFact111...

# 7. Lock upgrade authority (optional — prevents all future upgrades)
solana program set-upgrade-authority TokFact111... --final
```

### Upgrade Authority Strategy
- **Before audit:** keep upgrade authority with multisig (3/5 team keys)
- **After 6 months live:** consider removing upgrade authority to maximize trust
- Use Squads Protocol for multisig: https://squads.so

---

## Bug Bounty (Post-Launch)

Set up on **Immunefi** (https://immunefi.com):

| Severity | Payout |
|---|---|
| Critical (fund drain) | $50,000 |
| High (logic exploit) | $10,000 |
| Medium | $2,500 |
| Low / informational | $500 |

---

## Infrastructure Stack

```
Frontend:    Next.js 14 → Vercel (automatic preview deploys)
RPC:         Helius (https://helius.dev) — dedicated Solana node, 99.9% uptime
Indexer:     Helius Webhooks — emit events to backend on-chain
Database:    Supabase (PostgreSQL) — off-chain leaderboards, game metadata
Storage:     NFT metadata + art → Arweave (permanent) via Bundlr
CDN:         Cloudflare
Monitoring:  Datadog + PagerDuty for RPC errors
```

### Environment variables (.env.local)
```
NEXT_PUBLIC_SOLANA_NETWORK=mainnet-beta
NEXT_PUBLIC_RPC_URL=https://rpc.helius.xyz/?api-key=YOUR_KEY
ANTHROPIC_API_KEY=your_key_here  # used in /api/generate-game
```

---

## Domain Setup

### Web3 (recommended — native to Solana audience)
- Register `game.tok` on **Solana Name Service** (https://naming.bonfida.org)
- Cost: ~$20/year in SOL
- Resolves as a Solana wallet address + dApp URL

### Traditional (required for general public)
- `gametok.io` — likely available, ~$12/year on Namecheap/Cloudflare Registrar
- `gametok.xyz` — alternative
- `game-tok.com` — hyphenated fallback

### Recommended: own both
Point `gametok.io` to your Vercel deployment.
Set up `game.tok` SNS for the crypto-native crowd.

---

## Timeline

| Milestone | Duration |
|---|---|
| MVP programs + frontend | 8 weeks |
| Devnet testing + fixes | 2 weeks |
| Sec3 automated scan | 1 week |
| Ottersec/Neodyme audit | 6 weeks |
| Fix findings | 2 weeks |
| Re-review | 2 weeks |
| Mainnet launch | — |
| **Total** | **~21 weeks** |

---

## Cost Estimate

| Item | Cost |
|---|---|
| Anchor program development | $40K–$80K (team) |
| Tier 1 audit (Ottersec) | $50K–$80K |
| Sec3 automated scan | $10K |
| Helius RPC (annual) | $2,400 |
| Arweave NFT storage | $0.01/KB (one-time) |
| Vercel Pro | $240/year |
| Immunefi bug bounty reserve | $65K |
| **Total (conservative)** | **~$170K** |
