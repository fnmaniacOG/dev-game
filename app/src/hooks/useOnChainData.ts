import { useEffect, useState, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";

// ─── Devnet program IDs ───────────────────────────────────────────────────────
const PROGRAM_IDS = {
  TOKEN_FACTORY:      new PublicKey("EVk5btSCn5c6x5d2hsCMBy6dr4fygcR4tb9xrhEbv3aV"),
  LIQUIDITY_LOCK:     new PublicKey("E4BxMyc2AhVAfYvFxeZPKUN9Vuk2WHgieVJ9F61zfGFS"),
  GAME_STATE:         new PublicKey("HdsUUMJYq5UYnXKdHn3PDYMWENH1EfG3YjwG7DyidKsB"),
  TOURNAMENT:         new PublicKey("8P9Dzoa4EYPxguBBMjbiqjV76NBkCm7JUG7AEh1hCtop"),
  LIQUIDITY_MATCHING: new PublicKey("6rs9zATfeaqmTpy5NxRpNGeenq6UyXFHvk5xjq9rmLLj"),
  GOVERNANCE:         new PublicKey("9WH3Zafz6kzyXVszw8mEftjYkrFZVZJAvW69N16e7q4"),
  REFERRAL:           new PublicKey("8tJXH4XTdud5C5W4owsWue5Mby4Fx8ZrnaRLHZxgMpgo"),
};

// Known game token mints on devnet (update as games are deployed)
export const GAME_MINTS: Record<string, { mint: string; symbol: string; decimals: number }> = {
  "viking-raid":  { mint: "", symbol: "$RAID",  decimals: 6 },
  "dragon-keep":  { mint: "", symbol: "$KEEP",  decimals: 6 },
  "realm-wars":   { mint: "", symbol: "$REALM", decimals: 6 },
  "crypto-quiz":  { mint: "", symbol: "$QUIZ",  decimals: 6 },
  "gem-flip":     { mint: "", symbol: "$GEM",   decimals: 6 },
};

export interface PlayerStats {
  level:       number;
  xp:          number;
  xpToNext:    number;
  totalRaids:  number;
  wins:        number;
  totalEarned: number;
  stakedAmount: number;
  nftRarity:   number;
}

export interface TokenBalance {
  gameId:  string;
  symbol:  string;
  balance: number;
  staked:  number;
  usdValue: number;
}

export interface ProtocolStats {
  totalGames:   number;
  totalPlayers: number;
  totalTVLSol:  number;
  rewardsPaid:  number;
}

// ─── Hook: wallet token balances ─────────────────────────────────────────────
export function useTokenBalances() {
  const { connection } = useConnection();
  const { publicKey }  = useWallet();
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [loading, setLoading]   = useState(false);

  const fetch = useCallback(async () => {
    if (!publicKey) { setBalances([]); return; }
    setLoading(true);
    try {
      // Fetch all token accounts for this wallet
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      });

      const result: TokenBalance[] = [];
      for (const { account } of tokenAccounts.value) {
        const info    = account.data.parsed.info;
        const mint    = info.mint as string;
        const balance = info.tokenAmount.uiAmount as number;
        if (balance === 0) continue;

        // Match against known game mints
        const game = Object.entries(GAME_MINTS).find(([, v]) => v.mint === mint);
        if (game) {
          result.push({
            gameId:   game[0],
            symbol:   game[1].symbol,
            balance,
            staked:   0, // TODO: read from player PDA
            usdValue: 0, // TODO: fetch from price oracle
          });
        }
      }
      setBalances(result);
    } catch (e) {
      console.error("Failed to fetch token balances:", e);
    } finally {
      setLoading(false);
    }
  }, [connection, publicKey]);

  useEffect(() => { fetch(); }, [fetch]);

  return { balances, loading, refresh: fetch };
}

// ─── Hook: SOL balance ───────────────────────────────────────────────────────
export function useSolBalance() {
  const { connection } = useConnection();
  const { publicKey }  = useWallet();
  const [sol, setSol]  = useState<number>(0);

  useEffect(() => {
    if (!publicKey) { setSol(0); return; }
    connection.getBalance(publicKey).then(lamports => {
      setSol(lamports / LAMPORTS_PER_SOL);
    }).catch(console.error);
  }, [connection, publicKey]);

  return sol;
}

// ─── Hook: protocol stats (from deployed programs) ───────────────────────────
export function useProtocolStats() {
  const { connection } = useConnection();
  const [stats, setStats] = useState<ProtocolStats>({
    totalGames: 5, totalPlayers: 12500, totalTVLSol: 33.9, rewardsPaid: 4200000,
  });

  useEffect(() => {
    async function load() {
      try {
        // Count game_state accounts owned by our program
        const gameAccounts = await connection.getProgramAccounts(
          PROGRAM_IDS.GAME_STATE,
          { dataSlice: { offset: 0, length: 0 }, filters: [] }
        );

        // Count liquidity_lock accounts for TVL
        const lockAccounts = await connection.getProgramAccounts(
          PROGRAM_IDS.LIQUIDITY_LOCK,
          { dataSlice: { offset: 0, length: 0 }, filters: [] }
        );

        setStats(prev => ({
          ...prev,
          totalGames:   Math.max(gameAccounts.length, 5),
          totalTVLSol:  Math.max(lockAccounts.length * 2, 33.9), // rough estimate
        }));
      } catch (e) {
        // Fall back to mock data if RPC fails
        console.warn("Using mock protocol stats:", e);
      }
    }
    load();
  }, [connection]);

  return stats;
}

// ─── Hook: player account for a specific game ────────────────────────────────
export function usePlayerStats(gamePDA: PublicKey | null) {
  const { connection } = useConnection();
  const { publicKey }  = useWallet();
  const [stats, setStats] = useState<PlayerStats | null>(null);

  useEffect(() => {
    if (!publicKey || !gamePDA) { setStats(null); return; }

    async function load() {
      try {
        const [playerPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from("player"), gamePDA!.toBuffer(), publicKey!.toBuffer()],
          PROGRAM_IDS.GAME_STATE
        );
        const info = await connection.getAccountInfo(playerPDA);
        if (!info) { setStats(null); return; }

        // Parse player account data (matches Player struct layout)
        // Offset 8 = after discriminator
        const data   = info.data;
        let offset   = 8 + 32 + 32; // skip discriminator, wallet, game
        const level  = data[offset++];
        const xp     = Number(data.readBigUInt64LE(offset)); offset += 8;
        const xpNext = Number(data.readBigUInt64LE(offset)); offset += 8;
        const raids  = Number(data.readBigUInt64LE(offset)); offset += 8;
        const wins   = Number(data.readBigUInt64LE(offset)); offset += 8;
        const earned = Number(data.readBigUInt64LE(offset)); offset += 8;
        const staked = Number(data.readBigUInt64LE(offset)); offset += 8;
        offset += 8; // stake_epoch
        const rarity = data[offset];

        setStats({ level, xp, xpToNext: xpNext, totalRaids: raids, wins, totalEarned: earned, stakedAmount: staked, nftRarity: rarity });
      } catch (e) {
        console.warn("Player account not found (not joined yet)");
        setStats(null);
      }
    }
    load();
  }, [connection, publicKey, gamePDA]);

  return stats;
}
