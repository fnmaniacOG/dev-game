export type GameType = "rpg" | "strategy" | "quiz" | "minigame" | "ponzi";

export interface TokenAllocation {
  playerRewardBps: number;
  liquidityBps: number;
  devBps: number;
  treasuryBps: number;
  airdropBps: number;
}

export const GAME_TYPE_LABELS: Record<GameType, string> = {
  rpg: "RPG / Adventure",
  strategy: "Strategy",
  quiz: "Quiz / Educational",
  minigame: "Mini Game",
  ponzi: "Transparent Ponzi",
};

export const DEFAULT_ALLOCATIONS: Record<GameType, TokenAllocation> = {
  rpg:      { playerRewardBps: 4000, liquidityBps: 2000, devBps: 1500, treasuryBps: 1500, airdropBps: 1000 },
  strategy: { playerRewardBps: 4000, liquidityBps: 2000, devBps: 1500, treasuryBps: 1500, airdropBps: 1000 },
  quiz:     { playerRewardBps: 6000, liquidityBps: 2000, devBps: 1000, treasuryBps:  500, airdropBps:  500 },
  minigame: { playerRewardBps: 4000, liquidityBps: 2000, devBps: 1500, treasuryBps: 1500, airdropBps: 1000 },
  ponzi:    { playerRewardBps: 3000, liquidityBps: 3000, devBps: 2000, treasuryBps: 1500, airdropBps:  500 },
};
