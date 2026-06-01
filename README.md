# devgame

**The first AI-powered game launchpad on Solana.**  
Launch games. Launch tokens. Win together.

---

## What this is

devgame lets anyone deploy a blockchain game with its own token economy in minutes. Every game gets:
- A fungible token (FT) and/or NFT collection minted on Solana
- Locked liquidity (no rug pulls — enforced on-chain)
- An AI-designed game loop and tokenomics
- An EV+ reward system (players win on average for skill-based games)
- Full gameplay on-chain via the `game_state` program

---

## Project structure

```
dev-game/
├── programs/
│   ├── token_factory/      Mint FT + NFT collections (Anchor/Rust)
│   ├── liquidity_lock/     Lock LP tokens immutably at launch (Anchor/Rust)
│   └── game_state/         Player accounts, raids, staking, EV enforcement (Anchor/Rust)
├── app/
│   └── src/
│       ├── pages/          Next.js pages (index, API routes)
│       ├── components/     ExplorePanel, LaunchPanel, PortfolioPanel, GameDetail
│       ├── lib/            DevGameClient SDK, types
│       └── styles/         Global CSS (orange design system)
├── tests/                  Anchor test suite (TypeScript)
├── scripts/                deploy.ts
└── docs/
    └── AUDIT_AND_DEPLOYMENT.md
```

---

## Programs

### token_factory
- `create_fungible_token` — mints full supply, revokes mint authority, validates allocations sum to 10,000 bps
- `create_nft_collection` — creates Metaplex collection with max supply cap
- `mint_nft` — mints individual NFTs into a collection, tracks rarity and traits

### liquidity_lock
- `lock_liquidity` — transfers LP tokens to PDA vault; minimum 180-day lock enforced
- `withdraw_liquidity` — only callable after `unlock_ts` by original owner
- `get_lock_status` — returns seconds remaining, amount, withdrawal status

### game_state
- `register_game` — validates house edge ≤ 20%, player rewards ≥ 80% (EV+ enforcement)
- `join_game` — creates player account (level, XP, raid stats)
- `execute_raid` — resolves raid with skill-scaled odds, distributes rewards via CPI
- `stake_tokens` — locks tokens in staking vault
- `claim_stake_yield` — claims daily yield at configurable rate

---

## Getting started

### Prerequisites
- Rust + Cargo
- Solana CLI >= 1.18
- Anchor CLI >= 0.30
- Node.js >= 20

### Build programs
```bash
anchor build
anchor test
```

### Run frontend
```bash
cd app
npm install
cp .env.example .env.local    # set RPC URL and ANTHROPIC_API_KEY
npm run dev
```

### Deploy to devnet
```bash
anchor deploy --provider.cluster devnet
npx ts-node scripts/deploy.ts --cluster devnet
```

---

## Security

- All fungible token liquidity is locked at mint — no admin override
- House edge capped at 20% in-program — cannot be bypassed by creator
- EV+ enforcement: skill_reward_bps + tournament_pool_bps must be ≥ 8,000
- Mint authority revoked immediately after initial supply mint
- Pseudo-RNG (slot hash) for devnet — **replace with Switchboard VRF before mainnet**
- Full test suite in `tests/dev_game.ts` covering error cases

See `docs/AUDIT_AND_DEPLOYMENT.md` for audit firm contacts, timeline, and mainnet checklist.

---

## License

MIT — see LICENSE
