use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("E4BxMyc2AhVAfYvFxeZPKUN9Vuk2WHgieVJ9F61zfGFS");

pub const MIN_LOCK_SECONDS: i64 = 180 * 24 * 60 * 60; // 180 days
pub const MAX_LOCK_SECONDS: i64 = 4 * 365 * 24 * 60 * 60; // 4 years

#[error_code]
pub enum LockError {
    #[msg("Lock duration below minimum (180 days)")]
    LockTooShort,
    #[msg("Lock duration above maximum (4 years)")]
    LockTooLong,
    #[msg("LP tokens are still locked")]
    StillLocked,
    #[msg("Only the original depositor can withdraw")]
    Unauthorized,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
}

#[account]
pub struct LpLock {
    pub creator:       Pubkey,  // who deposited
    pub mint:          Pubkey,  // LP token mint
    pub vault:         Pubkey,  // PDA token account holding LP
    pub game_mint:     Pubkey,  // game token mint (for indexing)
    pub amount:        u64,     // LP tokens locked
    pub locked_at:     i64,
    pub unlock_at:     i64,     // creator cannot withdraw before this
    pub withdrawn:     bool,
    pub bump:          u8,
    pub vault_bump:    u8,
}

impl LpLock {
    pub const LEN: usize = 8
        + 32 * 4  // creator, mint, vault, game_mint
        + 8       // amount
        + 8 + 8   // locked_at, unlock_at
        + 1       // withdrawn
        + 1 + 1;  // bumps
}

#[program]
pub mod liquidity_lock {
    use super::*;

    /// Deposit LP tokens into a time-locked PDA vault.
    /// No admin can override — the unlock timestamp is enforced on-chain.
    pub fn lock_liquidity(
        ctx: Context<LockLiquidity>,
        amount: u64,
        lock_seconds: i64,
    ) -> Result<()> {
        require!(amount > 0, LockError::ZeroAmount);
        require!(lock_seconds >= MIN_LOCK_SECONDS, LockError::LockTooShort);
        require!(lock_seconds <= MAX_LOCK_SECONDS, LockError::LockTooLong);

        let now = Clock::get()?.unix_timestamp;
        let unlock_at = now.checked_add(lock_seconds).ok_or(LockError::Overflow)?;

        // Transfer LP tokens from creator → PDA vault
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from:      ctx.accounts.creator_lp_account.to_account_info(),
                    to:        ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.creator.to_account_info(),
                },
            ),
            amount,
        )?;

        let lock = &mut ctx.accounts.lp_lock;
        lock.creator    = ctx.accounts.creator.key();
        lock.mint       = ctx.accounts.lp_mint.key();
        lock.vault      = ctx.accounts.vault.key();
        lock.game_mint  = ctx.accounts.game_mint.key();
        lock.amount     = amount;
        lock.locked_at  = now;
        lock.unlock_at  = unlock_at;
        lock.withdrawn  = false;
        lock.bump       = ctx.bumps.lp_lock;
        lock.vault_bump = ctx.bumps.vault;

        emit!(LiquidityLocked {
            creator:   ctx.accounts.creator.key(),
            mint:      ctx.accounts.lp_mint.key(),
            amount,
            unlock_at,
        });

        Ok(())
    }

    /// Withdraw LP tokens after the lock has expired.
    /// Only the original depositor can call this.
    pub fn withdraw_liquidity(ctx: Context<WithdrawLiquidity>) -> Result<()> {
        let lock = &ctx.accounts.lp_lock;

        require!(
            ctx.accounts.creator.key() == lock.creator,
            LockError::Unauthorized
        );

        let now = Clock::get()?.unix_timestamp;
        require!(now >= lock.unlock_at, LockError::StillLocked);

        let amount = lock.amount;
        let creator_key = lock.creator;
        let lp_mint_key = lock.mint;

        let seeds: &[&[&[u8]]] = &[&[
            b"lp_vault",
            creator_key.as_ref(),
            lp_mint_key.as_ref(),
            &[lock.vault_bump],
        ]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from:      ctx.accounts.vault.to_account_info(),
                    to:        ctx.accounts.creator_lp_account.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                seeds,
            ),
            amount,
        )?;

        ctx.accounts.lp_lock.withdrawn = true;

        emit!(LiquidityWithdrawn {
            creator: creator_key,
            mint:    lp_mint_key,
            amount,
        });

        Ok(())
    }
}

// ─── Account contexts ─────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct LockLiquidity<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    /// The LP token mint (from Raydium/Orca pool)
    pub lp_mint: Account<'info, anchor_spl::token::Mint>,

    /// The game token mint (for indexing)
    pub game_mint: Account<'info, anchor_spl::token::Mint>,

    #[account(
        init,
        payer = creator,
        space = LpLock::LEN,
        seeds = [b"lp_lock", creator.key().as_ref(), lp_mint.key().as_ref()],
        bump,
    )]
    pub lp_lock: Account<'info, LpLock>,

    /// PDA token account that holds the LP tokens
    #[account(
        init,
        payer             = creator,
        token::mint       = lp_mint,
        token::authority  = vault,
        seeds = [b"lp_vault", creator.key().as_ref(), lp_mint.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// Creator's LP token account (source of transfer)
    #[account(
        mut,
        token::mint      = lp_mint,
        token::authority = creator,
    )]
    pub creator_lp_account: Account<'info, TokenAccount>,

    pub token_program:  Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent:           Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct WithdrawLiquidity<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"lp_lock", creator.key().as_ref(), lp_lock.mint.as_ref()],
        bump  = lp_lock.bump,
        constraint = !lp_lock.withdrawn,
    )]
    pub lp_lock: Account<'info, LpLock>,

    #[account(
        mut,
        seeds = [b"lp_vault", creator.key().as_ref(), lp_lock.mint.as_ref()],
        bump  = lp_lock.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint      = lp_lock.mint,
        token::authority = creator,
    )]
    pub creator_lp_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

// ─── Events ───────────────────────────────────────────────────────────────────

#[event]
pub struct LiquidityLocked {
    pub creator:   Pubkey,
    pub mint:      Pubkey,
    pub amount:    u64,
    pub unlock_at: i64,
}

#[event]
pub struct LiquidityWithdrawn {
    pub creator: Pubkey,
    pub mint:    Pubkey,
    pub amount:  u64,
}
