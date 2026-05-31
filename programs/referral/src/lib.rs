use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("8tJXH4XTdud5C5W4owsWue5Mby4Fx8ZrnaRLHZxgMpgo");

pub const REFEREE_BONUS_BPS: u64   = 1_000;
pub const REFERRER_REWARD_BPS: u64 = 500;
pub const REFEREE_RAID_CAP: u32    = 10;
pub const REFERRAL_WINDOW_DAYS: i64 = 30;
pub const CREATOR_WINDOW_DAYS: i64  = 365;

#[error_code]
pub enum ReferralError {
    #[msg("Cannot refer yourself")]       SelfReferral,
    #[msg("Referral window has expired")] WindowExpired,
    #[msg("Arithmetic overflow")]         Overflow,
}

#[account]
pub struct ReferralLink {
    pub referrer:      Pubkey,
    pub referee:       Pubkey,
    pub game:          Pubkey,
    pub created_at:    i64,
    pub expires_at:    i64,
    pub referee_raids: u32,
    pub total_earned:  u64,
    pub vault_bump:    u8,
    pub bump:          u8,
}
impl ReferralLink {
    pub const LEN: usize = 8 + 32*3 + 8*3 + 4 + 8 + 1 + 1;
}

#[account]
pub struct CreatorReferral {
    pub referrer:    Pubkey,
    pub new_creator: Pubkey,
    pub game_mint:   Pubkey,
    pub created_at:  i64,
    pub expires_at:  i64,
    pub total_earned: u64,
    pub bump:        u8,
}
impl CreatorReferral {
    pub const LEN: usize = 8 + 32*3 + 8*3 + 8 + 1;
}

#[program]
pub mod referral {
    use super::*;

    pub fn register_player_referral(ctx: Context<RegisterPlayerReferral>) -> Result<()> {
        require!(ctx.accounts.referrer.key() != ctx.accounts.referee.key(), ReferralError::SelfReferral);

        let now = Clock::get()?.unix_timestamp;
        let link = &mut ctx.accounts.referral_link;
        link.referrer      = ctx.accounts.referrer.key();
        link.referee       = ctx.accounts.referee.key();
        link.game          = ctx.accounts.game.key();
        link.created_at    = now;
        link.expires_at    = now.checked_add(REFERRAL_WINDOW_DAYS * 86_400).ok_or(ReferralError::Overflow)?;
        link.referee_raids = 0;
        link.total_earned  = 0;
        link.vault_bump    = ctx.bumps.referral_vault;
        link.bump          = ctx.bumps.referral_link;

        emit!(PlayerReferred { referrer: link.referrer, referee: link.referee, game: link.game });
        Ok(())
    }

    pub fn distribute_referral_bonus(ctx: Context<DistributeBonus>, base_reward: u64) -> Result<()> {
        let now          = Clock::get()?.unix_timestamp;
        let raids        = ctx.accounts.referral_link.referee_raids;
        let expires_at   = ctx.accounts.referral_link.expires_at;
        let referrer     = ctx.accounts.referral_link.referrer;
        let referee      = ctx.accounts.referral_link.referee;
        let game         = ctx.accounts.referral_link.game;
        let vault_bump   = ctx.accounts.referral_link.vault_bump;

        let referee_bonus = if raids < REFEREE_RAID_CAP {
            base_reward.checked_mul(REFEREE_BONUS_BPS).and_then(|v| v.checked_div(10_000)).ok_or(ReferralError::Overflow)?
        } else { 0 };

        let referrer_reward = if now < expires_at {
            base_reward.checked_mul(REFERRER_REWARD_BPS).and_then(|v| v.checked_div(10_000)).ok_or(ReferralError::Overflow)?
        } else { 0 };

        let seeds: &[&[&[u8]]] = &[&[b"referral_vault", game.as_ref(), &[vault_bump]]];

        if referee_bonus > 0 {
            token::transfer(CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer { from: ctx.accounts.referral_vault.to_account_info(), to: ctx.accounts.referee_token_account.to_account_info(), authority: ctx.accounts.referral_vault.to_account_info() },
                seeds,
            ), referee_bonus)?;
        }

        if referrer_reward > 0 {
            token::transfer(CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer { from: ctx.accounts.referral_vault.to_account_info(), to: ctx.accounts.referrer_token_account.to_account_info(), authority: ctx.accounts.referral_vault.to_account_info() },
                seeds,
            ), referrer_reward)?;
        }

        ctx.accounts.referral_link.referee_raids = raids.saturating_add(1);
        ctx.accounts.referral_link.total_earned = ctx.accounts.referral_link.total_earned.checked_add(referrer_reward).ok_or(ReferralError::Overflow)?;

        Ok(())
    }

    pub fn register_creator_referral(ctx: Context<RegisterCreatorReferral>, game_mint: Pubkey) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let cr = &mut ctx.accounts.creator_referral;
        cr.referrer     = ctx.accounts.referrer.key();
        cr.new_creator  = ctx.accounts.new_creator.key();
        cr.game_mint    = game_mint;
        cr.created_at   = now;
        cr.expires_at   = now.checked_add(CREATOR_WINDOW_DAYS * 86_400).ok_or(ReferralError::Overflow)?;
        cr.total_earned = 0;
        cr.bump         = ctx.bumps.creator_referral;
        emit!(CreatorReferred { referrer: cr.referrer, new_creator: cr.new_creator, game_mint });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct RegisterPlayerReferral<'info> {
    #[account(mut)] pub referee: Signer<'info>,
    /// CHECK: referrer wallet
    pub referrer: UncheckedAccount<'info>,
    /// CHECK: game account
    pub game: UncheckedAccount<'info>,
    #[account(init, payer = referee, space = ReferralLink::LEN, seeds = [b"referral", referrer.key().as_ref(), referee.key().as_ref(), game.key().as_ref()], bump)]
    pub referral_link: Account<'info, ReferralLink>,
    /// CHECK: PDA vault for referral bonuses
    #[account(seeds = [b"referral_vault", game.key().as_ref()], bump)]
    pub referral_vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DistributeBonus<'info> {
    pub authority: Signer<'info>,
    /// CHECK: game account
    pub game: UncheckedAccount<'info>,
    #[account(mut, seeds = [b"referral", referral_link.referrer.as_ref(), referral_link.referee.as_ref(), game.key().as_ref()], bump = referral_link.bump)]
    pub referral_link: Account<'info, ReferralLink>,
    #[account(mut)] pub referral_vault: Account<'info, TokenAccount>,
    #[account(mut)] pub referee_token_account: Account<'info, TokenAccount>,
    #[account(mut)] pub referrer_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RegisterCreatorReferral<'info> {
    #[account(mut)] pub new_creator: Signer<'info>,
    /// CHECK: referrer
    pub referrer: UncheckedAccount<'info>,
    #[account(init, payer = new_creator, space = CreatorReferral::LEN, seeds = [b"creator_referral", referrer.key().as_ref(), new_creator.key().as_ref()], bump)]
    pub creator_referral: Account<'info, CreatorReferral>,
    pub system_program: Program<'info, System>,
}

#[event] pub struct PlayerReferred  { pub referrer: Pubkey, pub referee: Pubkey, pub game: Pubkey }
#[event] pub struct CreatorReferred { pub referrer: Pubkey, pub new_creator: Pubkey, pub game_mint: Pubkey }
