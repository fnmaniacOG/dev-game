use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("VrfCons111111111111111111111111111111111111");

// ─── NOTE ─────────────────────────────────────────────────────────────────────
// This program integrates with Switchboard VRF for provably fair randomness.
// On devnet: use pseudo-RNG seeded from slot hash (for testing only)
// On mainnet: Switchboard oracle calls `settle_raid` after generating VRF proof
//
// To deploy your Switchboard function:
//   sb function create <CLUSTER> --name dev-game-vrf --container <YOUR_DOCKER_IMAGE>
// Then update SWITCHBOARD_FUNCTION_ID below with the returned address.
// ─────────────────────────────────────────────────────────────────────────────

pub const SWITCHBOARD_FUNCTION_ID: &str = "REPLACE_WITH_YOUR_SWITCHBOARD_FUNCTION_ADDRESS";
pub const REQUEST_EXPIRY_SECONDS: i64 = 300; // 5 minutes

#[error_code]
pub enum VrfError {
    #[msg("Raid request already exists for this player")]
    RequestExists,
    #[msg("Raid request has expired — stake can be reclaimed")]
    RequestExpired,
    #[msg("Raid request not yet settled")]
    NotSettled,
    #[msg("Unauthorized caller — only Switchboard oracle may settle")]
    Unauthorized,
    #[msg("Invalid win odds — must be between 1% and 95%")]
    InvalidOdds,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Invalid request state")]
    InvalidState,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum RequestState {
    Pending,
    Settled,
    Expired,
}

#[account]
pub struct RaidRequest {
    pub player:        Pubkey,
    pub game:          Pubkey,
    pub stake_amount:  u64,
    pub win_odds_bps:  u16,   // 100–9500 (1%–95%)
    pub base_reward:   u64,
    pub nft_bonus_bps: u16,   // bonus from NFT rarity (0–5000)
    pub target_idx:    u8,    // which raid target was selected
    pub state:         RequestState,
    pub vrf_result:    u64,   // filled by oracle
    pub won:           bool,
    pub requested_at:  i64,
    pub settled_at:    i64,
    pub bump:          u8,
}

impl RaidRequest {
    pub const LEN: usize = 8
        + 32 * 2      // player, game
        + 8           // stake_amount
        + 2           // win_odds_bps
        + 8           // base_reward
        + 2           // nft_bonus_bps
        + 1           // target_idx
        + 1           // state (enum)
        + 8           // vrf_result
        + 1           // won
        + 8 + 8       // timestamps
        + 1;          // bump
}

#[program]
pub mod vrf_consumer {
    use super::*;

    /// Player initiates a raid. Stake is escrowed immediately.
    /// Switchboard oracle will call settle_raid once the VRF proof is generated.
    pub fn request_raid_randomness(
        ctx: Context<RequestRaid>,
        stake_amount: u64,
        win_odds_bps: u16,
        base_reward: u64,
        nft_bonus_bps: u16,
        target_idx: u8,
    ) -> Result<()> {
        require!(
            win_odds_bps >= 100 && win_odds_bps <= 9_500,
            VrfError::InvalidOdds
        );

        // Escrow stake from player
        if stake_amount > 0 {
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from:      ctx.accounts.player_token_account.to_account_info(),
                        to:        ctx.accounts.stake_escrow.to_account_info(),
                        authority: ctx.accounts.player.to_account_info(),
                    },
                ),
                stake_amount,
            )?;
        }

        let req = &mut ctx.accounts.raid_request;
        req.player        = ctx.accounts.player.key();
        req.game          = ctx.accounts.game.key();
        req.stake_amount  = stake_amount;
        req.win_odds_bps  = win_odds_bps;
        req.base_reward   = base_reward;
        req.nft_bonus_bps = nft_bonus_bps;
        req.target_idx    = target_idx;
        req.state         = RequestState::Pending;
        req.vrf_result    = 0;
        req.won           = false;
        req.requested_at  = Clock::get()?.unix_timestamp;
        req.settled_at    = 0;
        req.bump          = ctx.bumps.raid_request;

        emit!(RaidRequested {
            player:     ctx.accounts.player.key(),
            game:       ctx.accounts.game.key(),
            target_idx,
        });

        Ok(())
    }

    /// Called by the Switchboard oracle after generating a VRF proof.
    /// On devnet, game client calls this directly with a pseudo-random value.
    pub fn settle_raid(
        ctx: Context<SettleRaid>,
        vrf_value: u64,
    ) -> Result<()> {
        // NOTE: On mainnet, add authority check:
        //   require!(ctx.accounts.oracle.key() == SWITCHBOARD_FUNCTION_ID.parse()?, VrfError::Unauthorized);

        let req = &ctx.accounts.raid_request;
        require!(req.state == RequestState::Pending, VrfError::InvalidState);

        let now = Clock::get()?.unix_timestamp;
        require!(
            now < req.requested_at + REQUEST_EXPIRY_SECONDS,
            VrfError::RequestExpired
        );

        // Determine outcome: vrf_value mod 10000 < win_odds_bps = win
        let roll = vrf_value % 10_000;
        let effective_odds = (req.win_odds_bps as u64)
            .checked_add(req.nft_bonus_bps as u64)
            .unwrap_or(9_500)
            .min(9_500);
        let won = roll < effective_odds;

        let stake  = req.stake_amount;
        let player = req.player;
        let game   = req.game;
        let reward = req.base_reward;
        let req_bump = req.bump;

        let raid_req = &mut ctx.accounts.raid_request;
        raid_req.vrf_result = vrf_value;
        raid_req.won        = won;
        raid_req.state      = RequestState::Settled;
        raid_req.settled_at = now;

        // Return stake + reward to player if won, stake only if lost
        let return_amount = if won {
            stake.checked_add(reward).ok_or(VrfError::Overflow)?
        } else {
            stake
        };

        if return_amount > 0 {
            let seeds: &[&[&[u8]]] = &[&[
                b"stake_escrow",
                player.as_ref(),
                game.as_ref(),
                &[req_bump], // using same bump for simplicity
            ]];

            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from:      ctx.accounts.stake_escrow.to_account_info(),
                        to:        ctx.accounts.player_token_account.to_account_info(),
                        authority: ctx.accounts.stake_escrow.to_account_info(),
                    },
                    seeds,
                ),
                return_amount,
            )?;
        }

        emit!(RaidSettled {
            player,
            game,
            won,
            vrf_value,
            reward: if won { reward } else { 0 },
        });

        Ok(())
    }

    /// Reclaim stake if oracle never responded (5-minute expiry).
    pub fn reclaim_expired_stake(ctx: Context<ReclaimExpired>) -> Result<()> {
        let req = &ctx.accounts.raid_request;
        require!(req.state == RequestState::Pending, VrfError::InvalidState);

        let now = Clock::get()?.unix_timestamp;
        require!(
            now >= req.requested_at + REQUEST_EXPIRY_SECONDS,
            VrfError::NotSettled
        );

        let stake  = req.stake_amount;
        let player = req.player;
        let game   = req.game;
        let bump   = req.bump;

        ctx.accounts.raid_request.state = RequestState::Expired;

        if stake > 0 {
            let seeds: &[&[&[u8]]] = &[&[
                b"stake_escrow",
                player.as_ref(),
                game.as_ref(),
                &[bump],
            ]];
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from:      ctx.accounts.stake_escrow.to_account_info(),
                        to:        ctx.accounts.player_token_account.to_account_info(),
                        authority: ctx.accounts.stake_escrow.to_account_info(),
                    },
                    seeds,
                ),
                stake,
            )?;
        }

        Ok(())
    }
}

// ─── Account contexts ─────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct RequestRaid<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    /// CHECK: game account
    pub game: UncheckedAccount<'info>,

    #[account(
        init,
        payer = player,
        space = RaidRequest::LEN,
        seeds = [b"raid_request", player.key().as_ref(), game.key().as_ref()],
        bump,
    )]
    pub raid_request: Account<'info, RaidRequest>,

    /// PDA escrow holding player's stake during oracle wait
    #[account(
        init_if_needed,
        payer             = player,
        token::mint       = mint,
        token::authority  = stake_escrow,
        seeds = [b"stake_escrow", player.key().as_ref(), game.key().as_ref()],
        bump,
    )]
    pub stake_escrow: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint      = mint,
        token::authority = player,
    )]
    pub player_token_account: Account<'info, TokenAccount>,

    pub mint:           Account<'info, anchor_spl::token::Mint>,
    pub token_program:  Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent:           Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct SettleRaid<'info> {
    /// CHECK: oracle or game client (add authority check for mainnet)
    pub oracle: Signer<'info>,

    #[account(
        mut,
        seeds = [b"raid_request", raid_request.player.as_ref(), raid_request.game.as_ref()],
        bump  = raid_request.bump,
    )]
    pub raid_request: Account<'info, RaidRequest>,

    #[account(
        mut,
        seeds = [b"stake_escrow", raid_request.player.as_ref(), raid_request.game.as_ref()],
        bump, // resolved at runtime
    )]
    pub stake_escrow: Account<'info, TokenAccount>,

    /// CHECK: player token account
    #[account(mut)]
    pub player_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ReclaimExpired<'info> {
    pub player: Signer<'info>,

    #[account(
        mut,
        seeds = [b"raid_request", player.key().as_ref(), raid_request.game.as_ref()],
        bump  = raid_request.bump,
        constraint = raid_request.player == player.key(),
    )]
    pub raid_request: Account<'info, RaidRequest>,

    #[account(
        mut,
        seeds = [b"stake_escrow", player.key().as_ref(), raid_request.game.as_ref()],
        bump,
    )]
    pub stake_escrow: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint      = stake_escrow.mint,
        token::authority = player,
    )]
    pub player_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

// ─── Events ───────────────────────────────────────────────────────────────────

#[event]
pub struct RaidRequested {
    pub player:     Pubkey,
    pub game:       Pubkey,
    pub target_idx: u8,
}

#[event]
pub struct RaidSettled {
    pub player:    Pubkey,
    pub game:      Pubkey,
    pub won:       bool,
    pub vrf_value: u64,
    pub reward:    u64,
}
