use anchor_lang::prelude::*;
use tiny_keccak;
use anchor_spl::token::{self, Mint, Token, TokenAccount, MintTo, Transfer};


declare_id!("9WH3Zafz6kzyXVszw8mEftjYkrFZVZJAvW69N16e7q4");

pub const QUORUM_BPS:         u64 = 500;
pub const PASS_THRESHOLD_BPS: u64 = 6_000;
pub const VOTING_PERIOD_SECS: i64 = 259_200;
pub const TIMELOCK_SECS:      i64 = 172_800;
pub const TOTAL_SUPPLY:       u64 = 100_000_000_000_000;

#[program]
pub mod governance {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, params: InitParams) -> Result<()> {
        let gov = &mut ctx.accounts.governance_state;
        gov.authority          = ctx.accounts.authority.key();
        gov.gtok_mint          = ctx.accounts.gtok_mint.key();
        gov.treasury           = ctx.accounts.treasury.key();
        gov.protocol_fee_bps   = params.initial_fee_bps;
        gov.max_house_edge_bps = params.initial_max_house_edge;
        gov.match_cap_lamports = params.initial_match_cap;
        gov.proposal_count     = 0;
        gov.total_supply       = TOTAL_SUPPLY;
        gov.circulating        = 0;
        gov.bump               = ctx.bumps.governance_state;
        let seeds: &[&[&[u8]]] = &[&[b"governance", &[gov.bump]]];
        token::mint_to(CpiContext::new_with_signer(ctx.accounts.token_program.key(), MintTo { mint: ctx.accounts.gtok_mint.to_account_info(), to: ctx.accounts.supply_vault.to_account_info(), authority: ctx.accounts.governance_state.to_account_info() }, seeds), TOTAL_SUPPLY)?;
        emit!(GovernanceInitialized { gtok_mint: ctx.accounts.gtok_mint.key(), total_supply: TOTAL_SUPPLY });
        Ok(())
    }

    pub fn claim_player_airdrop(ctx: Context<ClaimPlayerAirdrop>, merkle_proof: Vec<[u8; 32]>, amount: u64) -> Result<()> {
        let airdrop = &mut ctx.accounts.airdrop_claim;
        require!(airdrop.claimed == false, GovError::AlreadyClaimed);
        require!(amount > 0, GovError::ZeroAmount);
        let leaf = keccak256(&[ctx.accounts.claimant.key().as_ref(), &amount.to_le_bytes()].concat());
        let root = ctx.accounts.governance_state.airdrop_merkle_root;
        require!(verify_merkle_proof(leaf, &merkle_proof, root), GovError::InvalidMerkleProof);
        airdrop.claimed    = true;
        airdrop.claimant   = ctx.accounts.claimant.key();
        airdrop.amount     = amount;
        airdrop.claimed_at = Clock::get()?.unix_timestamp;
        airdrop.bump       = ctx.bumps.airdrop_claim;
        let gov = &mut ctx.accounts.governance_state;
        gov.circulating   += amount;
        let bump = gov.bump;
        let seeds: &[&[&[u8]]] = &[&[b"governance", &[bump]]];
        token::transfer(CpiContext::new_with_signer(ctx.accounts.token_program.key(), Transfer { from: ctx.accounts.supply_vault.to_account_info(), to: ctx.accounts.claimant_ata.to_account_info(), authority: ctx.accounts.governance_state.to_account_info() }, seeds), amount)?;
        emit!(AirdropClaimed { claimant: ctx.accounts.claimant.key(), amount });
        Ok(())
    }

    pub fn create_proposal(ctx: Context<CreateProposal>, params: ProposalParams) -> Result<()> {
        let min_to_propose = ctx.accounts.governance_state.total_supply / 1000;
        require!(ctx.accounts.proposer_ata.amount >= min_to_propose, GovError::InsufficientTokens);
        let gov  = &mut ctx.accounts.governance_state;
        let prop = &mut ctx.accounts.proposal;
        let now  = Clock::get()?.unix_timestamp;
        prop.id            = gov.proposal_count;
        prop.proposer      = ctx.accounts.proposer.key();
        let db = params.description.as_bytes();
        let dc = db.len().min(256);
        prop.description[..dc].copy_from_slice(&db[..dc]);
        prop.action_tag    = params.action_tag;
        prop.action_u16    = params.action_u16;
        prop.action_u64    = params.action_u64;
        prop.action_pubkey = params.action_pubkey;
        prop.status        = 0;
        prop.votes_for     = 0;
        prop.votes_against = 0;
        prop.created_at    = now;
        prop.voting_ends   = now + VOTING_PERIOD_SECS;
        prop.executed_at   = 0;
        prop.bump          = ctx.bumps.proposal;
        gov.proposal_count += 1;
        emit!(ProposalCreated { id: prop.id, proposer: prop.proposer, voting_ends: prop.voting_ends });
        Ok(())
    }

    pub fn cast_vote(ctx: Context<CastVote>, support: bool) -> Result<()> {
        let prop    = &mut ctx.accounts.proposal;
        let receipt = &mut ctx.accounts.vote_receipt;
        let now     = Clock::get()?.unix_timestamp;
        require!(prop.status == 0, GovError::ProposalNotActive);
        require!(now < prop.voting_ends, GovError::VotingEnded);
        let voting_power = ctx.accounts.voter_ata.amount;
        require!(voting_power > 0, GovError::NoVotingPower);
        receipt.voter       = ctx.accounts.voter.key();
        receipt.proposal_id = prop.id;
        receipt.support     = support;
        receipt.power       = voting_power;
        receipt.voted_at    = now;
        receipt.bump        = ctx.bumps.vote_receipt;
        if support { prop.votes_for += voting_power; } else { prop.votes_against += voting_power; }
        emit!(VoteCast { proposal_id: prop.id, voter: ctx.accounts.voter.key(), support, power: voting_power });
        Ok(())
    }

    pub fn finalize_proposal(ctx: Context<FinalizeProposal>) -> Result<()> {
        let gov  = &ctx.accounts.governance_state;
        let prop = &mut ctx.accounts.proposal;
        let now  = Clock::get()?.unix_timestamp;
        require!(prop.status == 0, GovError::ProposalNotActive);
        require!(now >= prop.voting_ends, GovError::VotingNotEnded);
        let total_votes  = prop.votes_for + prop.votes_against;
        let quorum_votes = gov.circulating * QUORUM_BPS / 10_000;
        let passed = total_votes >= quorum_votes && prop.votes_for * 10_000 / total_votes.max(1) >= PASS_THRESHOLD_BPS;
        prop.status = if passed { 1 } else { 3 };
        emit!(ProposalFinalized { id: prop.id, passed, votes_for: prop.votes_for, votes_against: prop.votes_against });
        Ok(())
    }

    pub fn execute_proposal(ctx: Context<ExecuteProposal>) -> Result<()> {
        let prop = &mut ctx.accounts.proposal;
        let now  = Clock::get()?.unix_timestamp;
        require!(prop.status == 1, GovError::NotQueued);
        require!(now >= prop.voting_ends + TIMELOCK_SECS, GovError::TimelockNotExpired);
        let gov = &mut ctx.accounts.governance_state;
        match prop.action_tag {
            0 => { gov.protocol_fee_bps   = prop.action_u16; }
            1 => { gov.max_house_edge_bps = prop.action_u16; }
            2 => { gov.match_cap_lamports = prop.action_u64; }
            _ => {}
        }
        prop.status      = 2;
        prop.executed_at = now;
        emit!(ProposalExecuted { id: prop.id, action_tag: prop.action_tag });
        Ok(())
    }

    pub fn set_merkle_root(ctx: Context<SetMerkleRoot>, root: [u8; 32]) -> Result<()> {
        ctx.accounts.governance_state.airdrop_merkle_root = root;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, mint::decimals = 6, mint::authority = governance_state)]
    pub gtok_mint: Account<'info, Mint>,
    #[account(init, payer = authority, seeds = [b"governance"], bump, space = GovernanceState::LEN)]
    pub governance_state: Account<'info, GovernanceState>,
    #[account(init, payer = authority, token::mint = gtok_mint, token::authority = governance_state, seeds = [b"supply_vault"], bump)]
    pub supply_vault: Account<'info, TokenAccount>,
    /// CHECK: treasury
    pub treasury: AccountInfo<'info>,
    pub token_program:  Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent:           Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ClaimPlayerAirdrop<'info> {
    #[account(mut)] pub claimant: Signer<'info>,
    #[account(mut)] pub governance_state: Account<'info, GovernanceState>,
    #[account(init, payer = claimant, seeds = [b"airdrop_claim", claimant.key().as_ref()], bump, space = AirdropClaim::LEN)]
    pub airdrop_claim: Account<'info, AirdropClaim>,
    #[account(mut, seeds = [b"supply_vault"], bump)] pub supply_vault: Account<'info, TokenAccount>,
    #[account(mut)] pub claimant_ata: Account<'info, TokenAccount>,
    pub token_program:  Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateProposal<'info> {
    #[account(mut)] pub proposer: Signer<'info>,
    #[account(mut)] pub governance_state: Account<'info, GovernanceState>,
    #[account(init, payer = proposer, seeds = [b"proposal", governance_state.proposal_count.to_le_bytes().as_ref()], bump, space = Proposal::LEN)]
    pub proposal: Account<'info, Proposal>,
    pub proposer_ata:   Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CastVote<'info> {
    #[account(mut)] pub voter: Signer<'info>,
    #[account(mut)] pub proposal: Account<'info, Proposal>,
    #[account(init, payer = voter, seeds = [b"vote_receipt", proposal.key().as_ref(), voter.key().as_ref()], bump, space = VoteReceipt::LEN)]
    pub vote_receipt: Account<'info, VoteReceipt>,
    pub voter_ata:      Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FinalizeProposal<'info> {
    pub governance_state: Account<'info, GovernanceState>,
    #[account(mut)] pub proposal: Account<'info, Proposal>,
}

#[derive(Accounts)]
pub struct ExecuteProposal<'info> {
    #[account(mut)] pub governance_state: Account<'info, GovernanceState>,
    #[account(mut)] pub proposal: Account<'info, Proposal>,
}

#[derive(Accounts)]
pub struct SetMerkleRoot<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [b"governance"], bump = governance_state.bump)]
    pub governance_state: Account<'info, GovernanceState>,
}

#[account]
pub struct GovernanceState {
    pub authority:           Pubkey,
    pub gtok_mint:           Pubkey,
    pub treasury:            Pubkey,
    pub protocol_fee_bps:    u16,
    pub max_house_edge_bps:  u16,
    pub match_cap_lamports:  u64,
    pub proposal_count:      u64,
    pub total_supply:        u64,
    pub circulating:         u64,
    pub airdrop_merkle_root: [u8; 32],
    pub bump:                u8,
}
impl GovernanceState {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 2 + 2 + 8 + 8 + 8 + 8 + 32 + 1;
}

#[account]
pub struct Proposal {
    pub id:            u64,
    pub proposer:      Pubkey,
    pub description:   [u8; 256],
    pub action_tag:    u8,
    pub action_u16:    u16,
    pub action_u64:    u64,
    pub action_pubkey: Pubkey,
    pub status:        u8,
    pub votes_for:     u64,
    pub votes_against: u64,
    pub created_at:    i64,
    pub voting_ends:   i64,
    pub executed_at:   i64,
    pub bump:          u8,
}
impl Proposal {
    pub const LEN: usize = 8 + 8 + 32 + 256 + 1 + 2 + 8 + 32 + 1 + 8 + 8 + 8 + 8 + 8 + 1;
}

#[account]
pub struct VoteReceipt {
    pub voter:       Pubkey,
    pub proposal_id: u64,
    pub support:     bool,
    pub power:       u64,
    pub voted_at:    i64,
    pub bump:        u8,
}
impl VoteReceipt {
    pub const LEN: usize = 8 + 32 + 8 + 1 + 8 + 8 + 1;
}

#[account]
pub struct AirdropClaim {
    pub claimant:   Pubkey,
    pub amount:     u64,
    pub claimed:    bool,
    pub claimed_at: i64,
    pub bump:       u8,
}
impl AirdropClaim {
    pub const LEN: usize = 8 + 32 + 8 + 1 + 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitParams {
    pub initial_fee_bps:        u16,
    pub initial_max_house_edge: u16,
    pub initial_match_cap:      u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ProposalParams {
    pub description:   String,
    pub action_tag:    u8,
    pub action_u16:    u16,
    pub action_u64:    u64,
    pub action_pubkey: Pubkey,
}

#[event] pub struct GovernanceInitialized { pub gtok_mint: Pubkey, pub total_supply: u64 }
#[event] pub struct AirdropClaimed        { pub claimant: Pubkey, pub amount: u64 }
#[event] pub struct ProposalCreated       { pub id: u64, pub proposer: Pubkey, pub voting_ends: i64 }
#[event] pub struct VoteCast              { pub proposal_id: u64, pub voter: Pubkey, pub support: bool, pub power: u64 }
#[event] pub struct ProposalFinalized     { pub id: u64, pub passed: bool, pub votes_for: u64, pub votes_against: u64 }
#[event] pub struct ProposalExecuted      { pub id: u64, pub action_tag: u8 }

#[error_code]
pub enum GovError {
    #[msg("Airdrop already claimed")]               AlreadyClaimed,
    #[msg("Invalid merkle proof")]                  InvalidMerkleProof,
    #[msg("Zero amount")]                           ZeroAmount,
    #[msg("Proposal is not active")]                ProposalNotActive,
    #[msg("Voting period has ended")]               VotingEnded,
    #[msg("Voting period has not ended yet")]       VotingNotEnded,
    #[msg("No voting power")]                       NoVotingPower,
    #[msg("Proposal not queued")]                   NotQueued,
    #[msg("Timelock has not expired")]              TimelockNotExpired,
    #[msg("Insufficient tokens")]                   InsufficientTokens,
    #[msg("Unauthorized")]                          Unauthorized,
}


fn keccak256(data: &[u8]) -> [u8; 32] {
    use tiny_keccak::{Hasher, Keccak};
    let mut hasher = Keccak::v256();
    let mut output = [0u8; 32];
    hasher.update(data);
    hasher.finalize(&mut output);
    output
}

fn verify_merkle_proof(leaf: [u8; 32], proof: &[[u8; 32]], root: [u8; 32]) -> bool {
    let mut current = leaf;
    for sibling in proof {
        current = if current <= *sibling {
            keccak256(&[current.as_ref(), sibling.as_ref()].concat())
        } else {
            keccak256(&[sibling.as_ref(), current.as_ref()].concat())
        };
    }
    current == root
}
