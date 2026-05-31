import {
  Connection, PublicKey, Transaction,
  TransactionInstruction, SystemProgram,
  LAMPORTS_PER_SOL, Keypair,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress, createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";

// ─── Program IDs (replace after anchor build) ─────────────────────────────────

export const PROGRAM_IDS = {
  TOKEN_FACTORY:       new PublicKey("EVk5btSCn5c6x5d2hsCMBy6dr4fygcR4tb9xrhEbv3aV"),
  LIQUIDITY_LOCK:      new PublicKey("E4BxMyc2AhVAfYvFxeZPKUN9Vuk2WHgieVJ9F61zfGFS"),
  GAME_STATE:          new PublicKey("HdsUUMJYq5UYnXKdHn3PDYMWENH1EfG3YjwG7DyidKsB"),
  TOURNAMENT:          new PublicKey("8P9Dzoa4EYPxguBBMjbiqjV76NBkCm7JUG7AEh1hCtop"),
  VRF_CONSUMER:        new PublicKey("VrfCons111111111111111111111111111111111111"),
  LIQUIDITY_MATCHING:  new PublicKey("6rs9zATfeaqmTpy5NxRpNGeenq6UyXFHvk5xjq9rmLLj"),
  GOVERNANCE:          new PublicKey("9WH3Zafz6kzyXVszw8mEftjYkrFZVZJAvW69N16e7q4"),
  REFERRAL:            new PublicKey("8tJXH4XTdud5C5W4owsWue5Mby4Fx8ZrnaRLHZxgMpgo"),
};

// ─── PDA helpers ──────────────────────────────────────────────────────────────

export function findGameTokenPDA(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("game_token"), mint.toBuffer()],
    PROGRAM_IDS.TOKEN_FACTORY,
  );
}

export function findGameStatePDA(gameId: bigint): [PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(gameId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("game_state"), buf],
    PROGRAM_IDS.GAME_STATE,
  );
}

export function findPlayerAccountPDA(gameState: PublicKey, player: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("player"), gameState.toBuffer(), player.toBuffer()],
    PROGRAM_IDS.GAME_STATE,
  );
}

export function findLpLockPDA(lpMint: PublicKey, owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("lp_lock"), lpMint.toBuffer(), owner.toBuffer()],
    PROGRAM_IDS.LIQUIDITY_LOCK,
  );
}

export function findTournamentPDA(gameId: bigint, tournamentId: bigint): [PublicKey, number] {
  const gameBuf = Buffer.alloc(8);
  const tBuf    = Buffer.alloc(8);
  gameBuf.writeBigUInt64LE(gameId);
  tBuf.writeBigUInt64LE(tournamentId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("tournament"), gameBuf, tBuf],
    PROGRAM_IDS.TOURNAMENT,
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TokenAllocation {
  playerRewards: number; // basis points (10000 = 100%)
  liquidity:     number;
  dev:           number;
  treasury:      number;
  airdrop:       number;
}

export interface CreateFungibleTokenParams {
  name:        string;
  symbol:      string;
  decimals:    number;
  totalSupply: bigint;
  allocation:  TokenAllocation;
  creator:     PublicKey;
}

export interface RegisterGameParams {
  name:            string;
  gameType:        number; // 0=rpg 1=mini 2=ponzi 3=strategy 4=puzzle 5=battle
  houseEdgeBps:    number; // max 2000 (20%)
  skillRewardBps:  number; // must make total ≥ 8000 with tournamentPoolBps
  tournPoolBps:    number;
  isEducational:   boolean;
  ftMint:          PublicKey;
  creator:         PublicKey;
}

export interface LockLiquidityParams {
  lpMint:           PublicKey;
  amount:           bigint;
  lockDurationSecs: bigint; // min 15552000 (180 days)
  owner:            PublicKey;
}

export interface OnchainGame {
  id:           bigint;
  name:         string;
  creator:      PublicKey;
  ftMint:       PublicKey;
  houseEdgeBps: number;
  totalPlayers: bigint;
  totalRaids:   bigint;
  rewardPool:   bigint;
  paused:       boolean;
  gameType:     number;
}

export interface OnchainPlayer {
  wallet:      PublicKey;
  level:       number;
  xp:          bigint;
  raidsWon:    bigint;
  raidsLost:   bigint;
  totalEarned: bigint;
  totalStaked: bigint;
}

export interface LpLock {
  owner:     PublicKey;
  lpMint:    PublicKey;
  amount:    bigint;
  lockedAt:  bigint;
  unlockTs:  bigint;
  withdrawn: boolean;
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class GameTokClient {
  constructor(
    private connection: Connection,
  ) {}

  // ── Read operations ──────────────────────────────────────────────────────

  /** Fetch on-chain game state account */
  async getGame(gameId: bigint): Promise<OnchainGame | null> {
    try {
      const [pda] = findGameStatePDA(gameId);
      const info  = await this.connection.getAccountInfo(pda);
      if (!info) return null;
      return this.decodeGameState(info.data);
    } catch {
      return null;
    }
  }

  /** Fetch player account for a given game */
  async getPlayer(gameId: bigint, playerWallet: PublicKey): Promise<OnchainPlayer | null> {
    try {
      const [gamePDA] = findGameStatePDA(gameId);
      const [playerPDA] = findPlayerAccountPDA(gamePDA, playerWallet);
      const info = await this.connection.getAccountInfo(playerPDA);
      if (!info) return null;
      return this.decodePlayerAccount(info.data);
    } catch {
      return null;
    }
  }

  /** Fetch LP lock status */
  async getLpLock(lpMint: PublicKey, owner: PublicKey): Promise<LpLock | null> {
    try {
      const [pda] = findLpLockPDA(lpMint, owner);
      const info  = await this.connection.getAccountInfo(pda);
      if (!info) return null;
      return this.decodeLpLock(info.data);
    } catch {
      return null;
    }
  }

  /** Get all games created by a wallet */
  async getGamesByCreator(creator: PublicKey): Promise<OnchainGame[]> {
    try {
      const accounts = await this.connection.getProgramAccounts(
        PROGRAM_IDS.GAME_STATE,
        {
          filters: [
            { dataSize: 320 }, // approximate GameState size
            { memcmp: { offset: 8, bytes: creator.toBase58() } },
          ],
        }
      );
      return accounts
        .map(a => { try { return this.decodeGameState(a.account.data); } catch { return null; } })
        .filter(Boolean) as OnchainGame[];
    } catch {
      return [];
    }
  }

  // ── Write operations (return Transaction to sign) ─────────────────────────

  /**
   * Build a transaction to create a fungible token.
   * Caller must sign and send.
   */
  async buildCreateFungibleTokenTx(params: CreateFungibleTokenParams): Promise<{
    tx: Transaction;
    mintKeypair: Keypair;
  }> {
    const mintKeypair = Keypair.generate();
    const [gameTokenPDA] = findGameTokenPDA(mintKeypair.publicKey);
    const creatorATA = await getAssociatedTokenAddress(mintKeypair.publicKey, params.creator);

    const tx = new Transaction();

    // Create ATA for creator if needed
    tx.add(createAssociatedTokenAccountInstruction(
      params.creator, creatorATA, params.creator, mintKeypair.publicKey,
    ));

    // Build create_fungible_token instruction data
    // Format: [u8 discriminator (0), ...BorshSerialized params]
    const allocationSum = params.allocation.playerRewards + params.allocation.liquidity +
      params.allocation.dev + params.allocation.treasury + params.allocation.airdrop;
    if (allocationSum !== 10_000) {
      throw new Error(`Allocation must sum to 10,000 bps, got ${allocationSum}`);
    }

    const data = this.encodeCreateFungibleToken(params);
    tx.add(new TransactionInstruction({
      programId: PROGRAM_IDS.TOKEN_FACTORY,
      keys: [
        { pubkey: params.creator,        isSigner: true,  isWritable: true },
        { pubkey: mintKeypair.publicKey, isSigner: true,  isWritable: true },
        { pubkey: creatorATA,            isSigner: false, isWritable: true },
        { pubkey: gameTokenPDA,          isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID,      isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data,
    }));

    return { tx, mintKeypair };
  }

  /** Build register_game instruction */
  async buildRegisterGameTx(params: RegisterGameParams, gameId: bigint): Promise<Transaction> {
    if (params.houseEdgeBps > 2_000) throw new Error("House edge cannot exceed 20%");
    if (params.skillRewardBps + params.tournPoolBps < 8_000) {
      throw new Error("skill_reward_bps + tournament_pool_bps must be ≥ 8,000 (EV+ requirement)");
    }

    const [gameStatePDA] = findGameStatePDA(gameId);
    const data = this.encodeRegisterGame(params, gameId);

    return new Transaction().add(new TransactionInstruction({
      programId: PROGRAM_IDS.GAME_STATE,
      keys: [
        { pubkey: params.creator,    isSigner: true,  isWritable: true },
        { pubkey: gameStatePDA,      isSigner: false, isWritable: true },
        { pubkey: params.ftMint,     isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    }));
  }

  /** Build lock_liquidity instruction */
  async buildLockLiquidityTx(params: LockLiquidityParams): Promise<Transaction> {
    const MIN_LOCK = 15_552_000n; // 180 days
    if (params.lockDurationSecs < MIN_LOCK) {
      throw new Error(`Lock duration must be at least 180 days (${MIN_LOCK} seconds)`);
    }

    const [lockPDA] = findLpLockPDA(params.lpMint, params.owner);
    const ownerLpATA = await getAssociatedTokenAddress(params.lpMint, params.owner);
    const vaultATA   = await getAssociatedTokenAddress(params.lpMint, lockPDA, true);

    const data = this.encodeLockLiquidity(params);
    return new Transaction().add(new TransactionInstruction({
      programId: PROGRAM_IDS.LIQUIDITY_LOCK,
      keys: [
        { pubkey: params.owner,   isSigner: true,  isWritable: true },
        { pubkey: ownerLpATA,     isSigner: false, isWritable: true },
        { pubkey: lockPDA,        isSigner: false, isWritable: true },
        { pubkey: vaultATA,       isSigner: false, isWritable: true },
        { pubkey: params.lpMint,  isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    }));
  }

  // ── Deployment bundle (atomic 4-instruction transaction) ──────────────────

  /**
   * Build the full launch bundle: create_token + register_game + lock_liquidity
   * This is a V0 transaction using address lookup tables to fit within the 1232-byte limit.
   * Returns the transaction and any auxiliary keypairs that need to sign.
   */
  async buildDeploymentBundle(params: {
    token:    CreateFungibleTokenParams;
    game:     Omit<RegisterGameParams, "ftMint" | "creator">;
    lock:     Omit<LockLiquidityParams, "lpMint" | "owner">;
    gameId:   bigint;
    lpMint:   PublicKey;
    creator:  PublicKey;
  }): Promise<{ tx: Transaction; mintKeypair: Keypair }> {
    const { tx: tokenTx, mintKeypair } = await this.buildCreateFungibleTokenTx(params.token);
    const gameTx   = await this.buildRegisterGameTx(
      { ...params.game, ftMint: mintKeypair.publicKey, creator: params.creator }, params.gameId,
    );
    const lockTx   = await this.buildLockLiquidityTx(
      { ...params.lock, lpMint: params.lpMint, owner: params.creator },
    );

    // Merge all instructions into one transaction
    const combined = new Transaction();
    combined.add(...tokenTx.instructions, ...gameTx.instructions, ...lockTx.instructions);

    return { tx: combined, mintKeypair };
  }

  // ── Encoding helpers (simplified — real impl uses borsh) ─────────────────

  private encodeCreateFungibleToken(params: CreateFungibleTokenParams): Buffer {
    // Instruction discriminator for create_fungible_token: sha256("global:create_fungible_token")[0..8]
    const disc = Buffer.from([232, 15, 148, 60, 168, 12, 0, 100]); // placeholder
    const buf  = Buffer.alloc(256);
    let offset = 0;
    disc.copy(buf, offset); offset += 8;
    // Write name (4 bytes length + bytes)
    const nameBytes = Buffer.from(params.name, "utf8");
    buf.writeUInt32LE(nameBytes.length, offset); offset += 4;
    nameBytes.copy(buf, offset); offset += nameBytes.length;
    // Write symbol
    const symBytes = Buffer.from(params.symbol, "utf8");
    buf.writeUInt32LE(symBytes.length, offset); offset += 4;
    symBytes.copy(buf, offset); offset += symBytes.length;
    // decimals
    buf.writeUInt8(params.decimals, offset); offset += 1;
    // total_supply (u64 LE)
    buf.writeBigUInt64LE(params.totalSupply, offset); offset += 8;
    // allocation (5× u16)
    buf.writeUInt16LE(params.allocation.playerRewards, offset); offset += 2;
    buf.writeUInt16LE(params.allocation.liquidity,     offset); offset += 2;
    buf.writeUInt16LE(params.allocation.dev,           offset); offset += 2;
    buf.writeUInt16LE(params.allocation.treasury,      offset); offset += 2;
    buf.writeUInt16LE(params.allocation.airdrop,       offset); offset += 2;
    return buf.slice(0, offset);
  }

  private encodeRegisterGame(params: RegisterGameParams, gameId: bigint): Buffer {
    const disc = Buffer.from([40, 200, 60, 12, 88, 0, 144, 200]); // placeholder
    const buf  = Buffer.alloc(256);
    let offset = 0;
    disc.copy(buf, offset); offset += 8;
    buf.writeBigUInt64LE(gameId, offset); offset += 8;
    const nameBytes = Buffer.from(params.name, "utf8");
    buf.writeUInt32LE(nameBytes.length, offset); offset += 4;
    nameBytes.copy(buf, offset); offset += nameBytes.length;
    buf.writeUInt8(params.gameType,       offset); offset += 1;
    buf.writeUInt16LE(params.houseEdgeBps,   offset); offset += 2;
    buf.writeUInt16LE(params.skillRewardBps, offset); offset += 2;
    buf.writeUInt16LE(params.tournPoolBps,   offset); offset += 2;
    buf.writeUInt8(params.isEducational ? 1 : 0, offset); offset += 1;
    return buf.slice(0, offset);
  }

  private encodeLockLiquidity(params: LockLiquidityParams): Buffer {
    const disc = Buffer.from([120, 80, 40, 0, 200, 16, 88, 40]); // placeholder
    const buf  = Buffer.alloc(64);
    let offset = 0;
    disc.copy(buf, offset); offset += 8;
    buf.writeBigUInt64LE(params.amount,           offset); offset += 8;
    buf.writeBigUInt64LE(params.lockDurationSecs, offset); offset += 8;
    return buf.slice(0, offset);
  }

  // ── Decode helpers ────────────────────────────────────────────────────────
  // These parse raw account data returned from getAccountInfo.
  // Offset positions must match the on-chain Anchor account layout.
  // 8 bytes: Anchor discriminator, then fields in declaration order.

  private decodeGameState(data: Buffer): OnchainGame {
    let o = 8; // skip discriminator
    const id          = data.readBigUInt64LE(o); o += 8;
    const creator     = new PublicKey(data.slice(o, o + 32)); o += 32;
    const ftMint      = new PublicKey(data.slice(o, o + 32)); o += 32;
    const nameLen     = data.readUInt32LE(o); o += 4;
    const name        = data.slice(o, o + nameLen).toString(); o += nameLen;
    const gameType    = data.readUInt8(o); o += 1;
    const houseEdge   = data.readUInt16LE(o); o += 2;
    const totalPlayers= data.readBigUInt64LE(o); o += 8;
    const totalRaids  = data.readBigUInt64LE(o); o += 8;
    const rewardPool  = data.readBigUInt64LE(o); o += 8;
    const paused      = data.readUInt8(o) === 1;
    return { id, creator, ftMint, name, gameType, houseEdgeBps: houseEdge, totalPlayers, totalRaids, rewardPool, paused };
  }

  private decodePlayerAccount(data: Buffer): OnchainPlayer {
    let o = 8;
    const wallet      = new PublicKey(data.slice(o, o + 32)); o += 32;
    const level       = data.readUInt8(o); o += 1;
    const xp          = data.readBigUInt64LE(o); o += 8;
    const raidsWon    = data.readBigUInt64LE(o); o += 8;
    const raidsLost   = data.readBigUInt64LE(o); o += 8;
    const totalEarned = data.readBigUInt64LE(o); o += 8;
    const totalStaked = data.readBigUInt64LE(o);
    return { wallet, level, xp, raidsWon, raidsLost, totalEarned, totalStaked };
  }

  private decodeLpLock(data: Buffer): LpLock {
    let o = 8;
    const owner     = new PublicKey(data.slice(o, o + 32)); o += 32;
    const lpMint    = new PublicKey(data.slice(o, o + 32)); o += 32;
    const amount    = data.readBigUInt64LE(o); o += 8;
    const lockedAt  = data.readBigInt64LE(o); o += 8;
    const unlockTs  = data.readBigInt64LE(o); o += 8;
    const withdrawn = data.readUInt8(o) === 1;
    return { owner, lpMint, amount, lockedAt, unlockTs, withdrawn };
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  /** Check if a game's LP lock is still active */
  async isLiquidityLocked(lpMint: PublicKey, owner: PublicKey): Promise<boolean> {
    const lock = await this.getLpLock(lpMint, owner);
    if (!lock) return false;
    const now = BigInt(Math.floor(Date.now() / 1000));
    return !lock.withdrawn && lock.unlockTs > now;
  }

  /** Format lock remaining time as human-readable string */
  lockTimeRemaining(lock: LpLock): string {
    const now  = BigInt(Math.floor(Date.now() / 1000));
    const left = lock.unlockTs - now;
    if (left <= 0n) return "unlocked";
    const days  = Number(left / 86400n);
    const hours = Number((left % 86400n) / 3600n);
    return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
  }

  /** Calculate player's actual win odds for a target (mirrors on-chain logic) */
  calcPlayerWinOdds(baseOdds: number, level: number, shipRarityBonus: number): number {
    const skillBonus = Math.min(0.20, (level - 1) * 0.005);
    return Math.min(0.92, baseOdds + skillBonus + shipRarityBonus);
  }
}

// ─── Singleton factory ────────────────────────────────────────────────────────

let _client: GameTokClient | null = null;

export function getGameTokClient(connection: Connection): GameTokClient {
  if (!_client) _client = new GameTokClient(connection);
  return _client;
}
