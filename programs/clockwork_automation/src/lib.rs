use anchor_lang::prelude::*;

declare_id!("3QcgHvzA7mjiJNkKuFLoxyJhx6sNYuatjWCLHZx3wvMW");

pub const SWEEP_COOLDOWN: i64 = 24 * 60 * 60;
pub const LP_WARN_DAYS_1: i64 = 30 * 24 * 60 * 60;
pub const LP_WARN_DAYS_2: i64 = 7  * 24 * 60 * 60;
pub const MAX_KEEPERS: usize  = 10;

#[error_code]
pub enum AutomationError {
    #[msg("Unauthorized keeper")] Unauthorized,
    #[msg("Sweep on cooldown")]   SweepOnCooldown,
    #[msg("Arithmetic overflow")] Overflow,
}

#[account]
pub struct AutomationConfig {
    pub authority:     Pubkey,
    pub treasury:      Pubkey,
    pub keepers:       [Pubkey; 10],
    pub keeper_count:  u8,
    pub last_sweep_at: i64,
    pub total_swept:   u64,
    pub bump:          u8,
}
impl AutomationConfig {
    pub const LEN: usize = 8 + 32 + 32 + 32 * 10 + 1 + 8 + 8 + 1;
}

#[account]
pub struct PoolHealthState {
    pub game:            Pubkey,
    pub initial_pool:    u64,
    pub last_checked_at: i64,
    pub bump:            u8,
}
impl PoolHealthState {
    pub const LEN: usize = 8 + 32 + 8 + 8 + 1;
}

#[account]
pub struct LpLockState {
    pub creator:   Pubkey,
    pub unlock_at: i64,
    pub bump:      u8,
}
impl LpLockState {
    pub const LEN: usize = 8 + 32 + 8 + 1;
}

#[program]
pub mod clockwork_automation {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, keepers: Vec<Pubkey>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority    = ctx.accounts.authority.key();
        config.treasury     = ctx.accounts.treasury.key();
        config.keeper_count = keepers.len().min(MAX_KEEPERS) as u8;
        for (i, k) in keepers.iter().take(MAX_KEEPERS).enumerate() {
            config.keepers[i] = *k;
        }
        config.last_sweep_at = 0;
        config.total_swept   = 0;
        config.bump          = ctx.bumps.config;
        Ok(())
    }

    /// Keeper calls this daily — emits event for off-chain fee sweep handler
    pub fn trigger_fee_sweep(ctx: Context<TriggerSweep>) -> Result<()> {
        let config = &ctx.accounts.config;
        let keeper = ctx.accounts.keeper.key();
        let count  = config.keeper_count as usize;
        require!(config.keepers[..count].contains(&keeper), AutomationError::Unauthorized);

        let now = Clock::get()?.unix_timestamp;
        require!(now >= config.last_sweep_at + SWEEP_COOLDOWN, AutomationError::SweepOnCooldown);

        ctx.accounts.config.last_sweep_at = now;

        emit!(FeeSweepTriggered { triggered_by: keeper, triggered_at: now });
        Ok(())
    }

    /// Keeper calls this to record pool health and emit alert if needed
    pub fn check_pool_health(
        ctx: Context<CheckHealth>,
        current_pool: u64,
    ) -> Result<()> {
        let now          = Clock::get()?.unix_timestamp;
        let initial_pool = ctx.accounts.pool_health.initial_pool;
        let game         = ctx.accounts.pool_health.game;

        let pct_bps = if initial_pool == 0 { 10_000u64 } else {
            current_pool.checked_mul(10_000)
                .and_then(|v| v.checked_div(initial_pool))
                .ok_or(AutomationError::Overflow)?
        };

        ctx.accounts.pool_health.last_checked_at = now;

        if pct_bps <= 500 {
            emit!(PoolAlert { game, level: 0, pct_bps });
        } else if pct_bps <= 1_000 {
            emit!(PoolAlert { game, level: 1, pct_bps });
        }
        Ok(())
    }

    /// Keeper calls this to check LP lock expiry and emit warning
    pub fn check_lp_expiry(ctx: Context<CheckLpExpiry>) -> Result<()> {
        let state = &ctx.accounts.lp_lock_state;
        let now   = Clock::get()?.unix_timestamp;
        let remaining = state.unlock_at.saturating_sub(now);
        let days_left = (remaining / 86_400) as u8;

        if remaining <= LP_WARN_DAYS_2 {
            emit!(LpExpiryWarning { creator: state.creator, unlock_at: state.unlock_at, days_left, level: 2 });
        } else if remaining <= LP_WARN_DAYS_1 {
            emit!(LpExpiryWarning { creator: state.creator, unlock_at: state.unlock_at, days_left, level: 1 });
        }
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = AutomationConfig::LEN, seeds = [b"automation_config"], bump)]
    pub config: Account<'info, AutomationConfig>,
    /// CHECK: treasury wallet
    pub treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TriggerSweep<'info> {
    pub keeper: Signer<'info>,
    #[account(mut, seeds = [b"automation_config"], bump = config.bump)]
    pub config: Account<'info, AutomationConfig>,
}

#[derive(Accounts)]
pub struct CheckHealth<'info> {
    pub keeper: Signer<'info>,
    #[account(mut)]
    pub pool_health: Account<'info, PoolHealthState>,
}

#[derive(Accounts)]
pub struct CheckLpExpiry<'info> {
    pub keeper: Signer<'info>,
    #[account(mut)]
    pub lp_lock_state: Account<'info, LpLockState>,
}

#[event] pub struct FeeSweepTriggered { pub triggered_by: Pubkey, pub triggered_at: i64 }
#[event] pub struct PoolAlert          { pub game: Pubkey, pub level: u8, pub pct_bps: u64 }
#[event] pub struct LpExpiryWarning    { pub creator: Pubkey, pub unlock_at: i64, pub days_left: u8, pub level: u8 }
