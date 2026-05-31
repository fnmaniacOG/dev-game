use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, MintTo, Token, TokenAccount},
};

declare_id!("EVk5btSCn5c6x5d2hsCMBy6dr4fygcR4tb9xrhEbv3aV");

pub const TOTAL_BPS: u64 = 10_000;
pub const MIN_PLAYER_REWARD_BPS: u64 = 2_000;
pub const MAX_DEV_BPS: u64 = 3_000;

#[error_code]
pub enum TokenFactoryError {
    #[msg("Allocations must sum to 10,000 bps")] AllocationMismatch,
    #[msg("Player reward too low (min 20%)")] PlayerRewardTooLow,
    #[msg("Dev allocation too high (max 30%)")] DevAllocTooHigh,
    #[msg("Supply must be 1M-10B")] InvalidSupply,
    #[msg("Arithmetic overflow")] Overflow,
}

#[account]
pub struct GameToken {
    pub creator:           Pubkey,
    pub mint:              Pubkey,
    pub game_state:        Pubkey,
    pub total_supply:      u64,
    pub player_rewards:    u64,
    pub liquidity:         u64,
    pub dev_allocation:    u64,
    pub treasury:          u64,
    pub airdrop:           u64,
    pub player_reward_bps: u16,
    pub liquidity_bps:     u16,
    pub dev_bps:           u16,
    pub treasury_bps:      u16,
    pub airdrop_bps:       u16,
    pub mint_revoked:      bool,
    pub created_at:        i64,
    pub bump:              u8,
}
impl GameToken {
    pub const LEN: usize = 8 + 32*3 + 8*5 + 2*5 + 1 + 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateTokenParams {
    pub name:              String,
    pub symbol:            String,
    pub metadata_uri:      String,
    pub total_supply:      u64,
    pub player_reward_bps: u16,
    pub liquidity_bps:     u16,
    pub dev_bps:           u16,
    pub treasury_bps:      u16,
    pub airdrop_bps:       u16,
}

#[program]
pub mod token_factory {
    use super::*;

    pub fn create_fungible_token(ctx: Context<CreateFungibleToken>, params: CreateTokenParams) -> Result<()> {
        require!(params.total_supply >= 1_000_000 && params.total_supply <= 10_000_000_000, TokenFactoryError::InvalidSupply);

        let alloc_sum = (params.player_reward_bps as u64)
            .checked_add(params.liquidity_bps as u64)
            .and_then(|s| s.checked_add(params.dev_bps as u64))
            .and_then(|s| s.checked_add(params.treasury_bps as u64))
            .and_then(|s| s.checked_add(params.airdrop_bps as u64))
            .ok_or(TokenFactoryError::Overflow)?;
        require!(alloc_sum == TOTAL_BPS, TokenFactoryError::AllocationMismatch);
        require!(params.player_reward_bps as u64 >= MIN_PLAYER_REWARD_BPS, TokenFactoryError::PlayerRewardTooLow);
        require!(params.dev_bps as u64 <= MAX_DEV_BPS, TokenFactoryError::DevAllocTooHigh);

        let supply = params.total_supply;
        // K-01 fix: use u128 for intermediate to prevent overflow with large supplies
        let bps_calc = |bps: u16| -> Result<u64> {
            let result = (supply as u128)
                .checked_mul(bps as u128)
                .and_then(|v| v.checked_div(TOTAL_BPS as u128))
                .ok_or(error!(TokenFactoryError::Overflow))?;
            u64::try_from(result).map_err(|_| error!(TokenFactoryError::Overflow))
        };
        let player_rewards = bps_calc(params.player_reward_bps)?;
        let liquidity      = bps_calc(params.liquidity_bps)?;
        let dev_alloc      = bps_calc(params.dev_bps)?;
        let treasury       = bps_calc(params.treasury_bps)?;
        let airdrop        = bps_calc(params.airdrop_bps)?;

        // Mint full supply using anchor-spl
        anchor_spl::token::mint_to(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                anchor_spl::token::MintTo {
                    mint:      ctx.accounts.mint.to_account_info(),
                    to:        ctx.accounts.creator_vault.to_account_info(),
                    authority: ctx.accounts.creator.to_account_info(),
                },
            ),
            supply,
        )?;

        // Revoke mint authority
        anchor_spl::token::set_authority(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                anchor_spl::token::SetAuthority {
                    account_or_mint: ctx.accounts.mint.to_account_info(),
                    current_authority: ctx.accounts.creator.to_account_info(),
                },
            ),
            anchor_spl::token::spl_token::instruction::AuthorityType::MintTokens,
            None,
        )?;

        let game_token = &mut ctx.accounts.game_token;
        game_token.creator        = ctx.accounts.creator.key();
        game_token.mint           = ctx.accounts.mint.key();
        game_token.game_state     = Pubkey::default();
        game_token.total_supply   = supply;
        game_token.player_rewards = player_rewards;
        game_token.liquidity      = liquidity;
        game_token.dev_allocation = dev_alloc;
        game_token.treasury       = treasury;
        game_token.airdrop        = airdrop;
        game_token.player_reward_bps = params.player_reward_bps;
        game_token.liquidity_bps     = params.liquidity_bps;
        game_token.dev_bps           = params.dev_bps;
        game_token.treasury_bps      = params.treasury_bps;
        game_token.airdrop_bps       = params.airdrop_bps;
        game_token.mint_revoked   = true;
        game_token.created_at     = Clock::get()?.unix_timestamp;
        game_token.bump           = ctx.bumps.game_token;

        emit!(TokenCreated { creator: ctx.accounts.creator.key(), mint: ctx.accounts.mint.key(), supply, symbol: params.symbol });
        Ok(())
    }

    pub fn link_game_state(ctx: Context<LinkGameState>, game_state_key: Pubkey) -> Result<()> {
        ctx.accounts.game_token.game_state = game_state_key;
        Ok(())
    }
}


#[derive(Accounts)]
#[instruction(params: CreateTokenParams)]
pub struct CreateFungibleToken<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(init, payer = creator, mint::decimals = 6, mint::authority = creator)]
    pub mint: Account<'info, Mint>,
    #[account(init, payer = creator, space = GameToken::LEN, seeds = [b"game_token", creator.key().as_ref(), mint.key().as_ref()], bump)]
    pub game_token: Account<'info, GameToken>,
    #[account(init_if_needed, payer = creator, associated_token::mint = mint, associated_token::authority = creator)]
    pub creator_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct LinkGameState<'info> {
    pub creator: Signer<'info>,
    #[account(mut, seeds = [b"game_token", creator.key().as_ref(), game_token.mint.as_ref()], bump = game_token.bump, constraint = game_token.creator == creator.key())]
    pub game_token: Account<'info, GameToken>,
}

#[event]
pub struct TokenCreated {
    pub creator: Pubkey,
    pub mint:    Pubkey,
    pub supply:  u64,
    pub symbol:  String,
}
