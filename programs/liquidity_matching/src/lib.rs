use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("6rs9zATfeaqmTpy5NxRpNGeenq6UyXFHvk5xjq9rmLLj");

pub const COMMITTEE_SIZE: usize   = 5;
pub const APPROVAL_THRESHOLD: u8  = 3;   // 3-of-5
pub const MAX_MATCH_LAMPORTS: u64 = 5 * 1_000_000_000; // 5 SOL
pub const APPLICATION_EXPIRY: i64 = 7 * 24 * 60 * 60;   // 7 days
pub const PROTOCOL_FEE_BPS: u64   = 1_000; // 10% of matched game's protocol fees

#[error_code]
pub enum MatchError {
    #[msg("Not a committee member")]
    NotCommitteeMember,
    #[msg("Already voted")]
    AlreadyVoted,
    #[msg("Application not pending")]
    NotPending,
    #[msg("Application has expired")]
    Expired,
    #[msg("Approval threshold not reached")]
    ThresholdNotReached,
    #[msg("Match cap exceeded")]
    CapExceeded,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Already deployed")]
    AlreadyDeployed,
    #[msg("Not approved yet")]
    NotApproved,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum ApplicationStatus {
    Pending,
    Approved,
    Rejected,
    Deployed,
    Expired,
}

#[account]
pub struct MatchingConfig {
    pub authority:   Pubkey,
    pub committee:   [Pubkey; COMMITTEE_SIZE],
    pub match_cap:   u64,           // max SOL match per game
    pub treasury:    Pubkey,        // treasury token account
    pub bump:        u8,
}

impl MatchingConfig {
    pub const LEN: usize = 8 + 32 + 32 * COMMITTEE_SIZE + 8 + 32 + 1;
}

#[account]
pub struct MatchApplication {
    pub creator:        Pubkey,
    pub game_mint:      Pubkey,
    pub deposit_amount: u64,
    pub match_amount:   u64,        // computed at approval time
    pub status:         ApplicationStatus,
    pub votes:          [bool; COMMITTEE_SIZE],  // vote from each committee seat
    pub vote_count:     u8,
    pub applied_at:     i64,
    pub expires_at:     i64,
    pub deployed_at:    i64,
    pub bump:           u8,
}

impl MatchApplication {
    pub const LEN: usize = 8
        + 32 * 2          // creator, game_mint
        + 8 * 2           // deposit_amount, match_amount
        + 1               // status enum
        + COMMITTEE_SIZE  // votes array
        + 1               // vote_count
        + 8 * 3           // timestamps
        + 1;              // bump
}

#[program]
pub mod liquidity_matching {
    use super::*;

    /// Initialize the matching config (one-time, protocol admin).
    pub fn initialize(
        ctx: Context<Initialize>,
        committee: [Pubkey; COMMITTEE_SIZE],
        match_cap: u64,
    ) -> Result<()> {
        require!(match_cap <= MAX_MATCH_LAMPORTS, MatchError::CapExceeded);

        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.committee = committee;
        config.match_cap = match_cap;
        config.treasury  = ctx.accounts.treasury.key();
        config.bump      = ctx.bumps.config;

        Ok(())
    }

    /// Creator applies for liquidity matching. Deposits SOL into escrow.
    pub fn apply_for_match(
        ctx: Context<ApplyForMatch>,
        deposit_lamports: u64,
    ) -> Result<()> {
        let config = &ctx.accounts.config;
        require!(
            deposit_lamports <= config.match_cap,
            MatchError::CapExceeded
        );

        // Transfer SOL deposit to PDA escrow
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.creator.key(),
            &ctx.accounts.escrow.key(),
            deposit_lamports,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.creator.to_account_info(),
                ctx.accounts.escrow.to_account_info(),
            ],
        )?;

        let now = Clock::get()?.unix_timestamp;

        let app = &mut ctx.accounts.application;
        app.creator        = ctx.accounts.creator.key();
        app.game_mint      = ctx.accounts.game_mint.key();
        app.deposit_amount = deposit_lamports;
        app.match_amount   = 0; // set at approval
        app.status         = ApplicationStatus::Pending;
        app.votes          = [false; COMMITTEE_SIZE];
        app.vote_count     = 0;
        app.applied_at     = now;
        app.expires_at     = now.checked_add(APPLICATION_EXPIRY).ok_or(MatchError::Overflow)?;
        app.deployed_at    = 0;
        app.bump           = ctx.bumps.application;

        emit!(ApplicationSubmitted {
            creator:   ctx.accounts.creator.key(),
            game_mint: ctx.accounts.game_mint.key(),
            deposit:   deposit_lamports,
        });

        Ok(())
    }

    /// Committee member votes to approve an application.
    pub fn approve_match(ctx: Context<ApproveMatch>, seat: u8) -> Result<()> {
        let config = &ctx.accounts.config;
        let voter  = ctx.accounts.voter.key();
        let seat_idx = seat as usize;

        require!(seat_idx < COMMITTEE_SIZE, MatchError::NotCommitteeMember);
        require!(config.committee[seat_idx] == voter, MatchError::NotCommitteeMember);

        let app = &ctx.accounts.application;
        require!(app.status == ApplicationStatus::Pending, MatchError::NotPending);
        require!(
            Clock::get()?.unix_timestamp < app.expires_at,
            MatchError::Expired
        );
        require!(!app.votes[seat_idx], MatchError::AlreadyVoted);

        let app = &mut ctx.accounts.application;
        app.votes[seat_idx] = true;
        app.vote_count     = app.vote_count.saturating_add(1);

        // Auto-approve when threshold reached
        if app.vote_count >= APPROVAL_THRESHOLD {
            let deposit = app.deposit_amount;
            let match_amt = deposit.min(ctx.accounts.config.match_cap);
            app.match_amount = match_amt;
            app.status       = ApplicationStatus::Approved;

            emit!(ApplicationApproved {
                creator:   app.creator,
                game_mint: app.game_mint,
                match_amt,
            });
        }

        Ok(())
    }

    /// Creator deploys liquidity after approval.
    /// Both creator's deposit and treasury match go to the LP pool.
    pub fn deploy_liquidity(ctx: Context<DeployLiquidity>) -> Result<()> {
        let creator    = ctx.accounts.creator.key();
        let app_creator  = ctx.accounts.application.creator;
        let app_status   = ctx.accounts.application.status.clone();
        let deposit      = ctx.accounts.application.deposit_amount;
        let matched      = ctx.accounts.application.match_amount;
        let game_mint    = ctx.accounts.application.game_mint;

        require!(app_creator == creator, MatchError::Unauthorized);
        require!(app_status == ApplicationStatus::Approved, MatchError::NotApproved);

        let total = deposit.checked_add(matched).ok_or(MatchError::Overflow)?;
        let now   = Clock::get()?.unix_timestamp;

        ctx.accounts.application.status      = ApplicationStatus::Deployed;
        ctx.accounts.application.deployed_at = now;

        emit!(LiquidityDeployed {
            creator,
            game_mint,
            total_sol: total,
        });

        Ok(())
    }

    /// Creator reclaims deposit if application is rejected or expired.
    pub fn reclaim_deposit(ctx: Context<ReclaimDeposit>) -> Result<()> {
        let app = &ctx.accounts.application;
        require!(
            app.creator == ctx.accounts.creator.key(),
            MatchError::Unauthorized
        );

        let now = Clock::get()?.unix_timestamp;
        let can_reclaim = app.status == ApplicationStatus::Rejected
            || now >= app.expires_at;
        require!(can_reclaim, MatchError::NotPending);

        // Return SOL from escrow to creator
        let deposit = app.deposit_amount;
        **ctx.accounts.escrow.try_borrow_mut_lamports()? = ctx
            .accounts
            .escrow
            .lamports()
            .checked_sub(deposit)
            .ok_or(MatchError::Overflow)?;
        **ctx.accounts.creator.try_borrow_mut_lamports()? = ctx
            .accounts
            .creator
            .lamports()
            .checked_add(deposit)
            .ok_or(MatchError::Overflow)?;

        ctx.accounts.application.status = ApplicationStatus::Expired;

        Ok(())
    }
}

// ─── Account contexts ─────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = MatchingConfig::LEN,
        seeds = [b"matching_config"],
        bump,
    )]
    pub config: Account<'info, MatchingConfig>,

    /// CHECK: treasury account
    pub treasury: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ApplyForMatch<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    pub config: Account<'info, MatchingConfig>,

    pub game_mint: Account<'info, anchor_spl::token::Mint>,

    #[account(
        init,
        payer = creator,
        space = MatchApplication::LEN,
        seeds = [b"match_app", creator.key().as_ref(), game_mint.key().as_ref()],
        bump,
    )]
    pub application: Account<'info, MatchApplication>,

    /// CHECK: PDA escrow account for SOL deposit
    #[account(
        mut,
        seeds = [b"match_escrow", creator.key().as_ref(), game_mint.key().as_ref()],
        bump,
    )]
    pub escrow: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ApproveMatch<'info> {
    pub voter: Signer<'info>,

    pub config: Account<'info, MatchingConfig>,

    #[account(mut)]
    pub application: Account<'info, MatchApplication>,
}

#[derive(Accounts)]
pub struct DeployLiquidity<'info> {
    pub creator: Signer<'info>,

    pub config: Account<'info, MatchingConfig>,

    #[account(mut)]
    pub application: Account<'info, MatchApplication>,
}

#[derive(Accounts)]
pub struct ReclaimDeposit<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(mut)]
    pub application: Account<'info, MatchApplication>,

    /// CHECK: PDA escrow
    #[account(
        mut,
        seeds = [b"match_escrow", creator.key().as_ref(), application.game_mint.as_ref()],
        bump,
    )]
    pub escrow: UncheckedAccount<'info>,
}

// ─── Events ───────────────────────────────────────────────────────────────────

#[event]
pub struct ApplicationSubmitted {
    pub creator:   Pubkey,
    pub game_mint: Pubkey,
    pub deposit:   u64,
}

#[event]
pub struct ApplicationApproved {
    pub creator:   Pubkey,
    pub game_mint: Pubkey,
    pub match_amt: u64,
}

#[event]
pub struct LiquidityDeployed {
    pub creator:   Pubkey,
    pub game_mint: Pubkey,
    pub total_sol: u64,
}
