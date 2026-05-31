import type { NextApiRequest, NextApiResponse } from "next";

interface RaidTarget {
  name: string; emoji: string; region: string; difficulty: number;
  baseReward: number; winOdds: number; lore: string; historicalFact: string;
}
interface QuizQuestion {
  question: string; options: string[]; correct: number;
  explanation: string; difficulty: "easy"|"medium"|"hard"; reward: number;
}
interface NFTRarityTier {
  name: string; pct: number; winBonus: number;
  rewardMult: number; stakingMult: number; description: string;
}
interface TokenomicsAllocation {
  playerRewards: number; liquidity: number; dev: number; treasury: number; airdrop: number;
}
export interface GeneratedGame {
  name: string; description: string; tokenSymbol: string; tagline: string;
  gameType: number; isEducational: boolean; color: string; emoji: string;
  tokenomics: {
    totalSupply: number; allocation: TokenomicsAllocation; lockDays: number;
    houseEdgeBps: number; skillRewardBps: number; tournamentPoolBps: number;
    evAnalysis: string; reasoning: string;
  };
  nftTiers: NFTRarityTier[];
  raidTargets?: RaidTarget[];
  questions?: QuizQuestion[];
  territories?: { name: string; resource: string; yield: number }[];
  artDirection: string; loreBackground: string; targetAudience: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GeneratedGame | { error: string }>,
) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { description, gameType, isEducational } = req.body as {
    description: string; gameType: string; isEducational: boolean;
  };

  if (!description || description.trim().length < 5)
    return res.status(400).json({ error: "Please provide a game description" });

  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GOOGLE_AI_API_KEY not configured — get a free key at aistudio.google.com/apikey" });

  try {
    const typeMap: Record<string, number> = { rpg: 0, minigame: 1, ponzi: 2, strategy: 3, quiz: 4 };
    const allocMap: Record<string, string> = {
      rpg:      "playerRewards:4000,liquidity:2000,dev:1500,treasury:1500,airdrop:1000,skillRewardBps:6000,tournamentPoolBps:2000,houseEdgeBps:1500",
      strategy: "playerRewards:4500,liquidity:2000,dev:1000,treasury:2000,airdrop:500,skillRewardBps:5500,tournamentPoolBps:2500,houseEdgeBps:1000",
      quiz:     "playerRewards:6000,liquidity:2000,dev:1000,treasury:500,airdrop:500,skillRewardBps:7000,tournamentPoolBps:1000,houseEdgeBps:500",
      ponzi:    "playerRewards:3000,liquidity:3000,dev:2000,treasury:1500,airdrop:500,skillRewardBps:0,tournamentPoolBps:0,houseEdgeBps:1500",
      minigame: "playerRewards:5500,liquidity:2500,dev:1000,treasury:500,airdrop:500,skillRewardBps:5000,tournamentPoolBps:3000,houseEdgeBps:1000",
    };

    const gt = gameType || "rpg";
    const gtNum = typeMap[gt] ?? 0;
    const alloc = allocMap[gt] ?? allocMap.rpg;

    const extraFields = gt === "quiz"
      ? `"questions":[{"question":"string","options":["a","b","c","d"],"correct":0,"explanation":"string","difficulty":"easy","reward":100}],`
      : gt === "rpg"
      ? `"raidTargets":[{"name":"string","emoji":"⚔️","region":"string","difficulty":1,"baseReward":100,"winOdds":0.55,"lore":"string","historicalFact":"string"}],`
      : gt === "strategy"
      ? `"territories":[{"name":"string","resource":"gold","yield":10}],`
      : "";

    const prompt = `You are a blockchain game designer. Generate a Dev Game (Solana launchpad) game based on: "${description}"
Game type number: ${gtNum}. Educational: ${isEducational}. Tokenomics guide: ${alloc}.
ALL allocation values must sum to exactly 10000. Return ONLY this JSON, no extra text:
{"name":"string","description":"string","tokenSymbol":"TICK","tagline":"string","gameType":${gtNum},"isEducational":${isEducational},"color":"#hex","emoji":"🎮","tokenomics":{"totalSupply":1000000000,"allocation":{"playerRewards":0,"liquidity":0,"dev":0,"treasury":0,"airdrop":0},"lockDays":365,"houseEdgeBps":0,"skillRewardBps":0,"tournamentPoolBps":0,"evAnalysis":"string","reasoning":"string"},"nftTiers":[{"name":"Common","pct":60,"winBonus":0,"rewardMult":1,"stakingMult":1,"description":"string"},{"name":"Rare","pct":25,"winBonus":5,"rewardMult":1.25,"stakingMult":1.5,"description":"string"},{"name":"Epic","pct":10,"winBonus":10,"rewardMult":1.5,"stakingMult":2,"description":"string"},{"name":"Legendary","pct":5,"winBonus":20,"rewardMult":2,"stakingMult":3,"description":"string"}],${extraFields}"artDirection":"string","loreBackground":"string","targetAudience":"string"}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemma-3-27b-it:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.8, topP: 0.95, maxOutputTokens: 4096 },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error("Gemma error:", err);
      return res.status(500).json({ error: "AI generation failed. Please try again." });
    }

    const data  = await response.json();
    const raw   = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const clean = raw.replace(/```json|```/g, "").trim();
    const generated: GeneratedGame = JSON.parse(clean);

    // Auto-correct allocation sum
    const a = generated.tokenomics.allocation;
    const sum = a.playerRewards + a.liquidity + a.dev + a.treasury + a.airdrop;
    if (sum !== 10_000) generated.tokenomics.allocation.playerRewards += (10_000 - sum);

    // Enforce EV+ constraints
    if (generated.gameType !== 2) {
      if (generated.tokenomics.skillRewardBps + generated.tokenomics.tournamentPoolBps < 8_000) {
        generated.tokenomics.skillRewardBps = 6_000;
        generated.tokenomics.tournamentPoolBps = 2_000;
      }
    }
    if (generated.tokenomics.houseEdgeBps > 2_000) generated.tokenomics.houseEdgeBps = 1_500;

    return res.status(200).json(generated);
  } catch (err) {
    console.error("Generation error:", err);
    return res.status(500).json({ error: "Failed to generate game. Please try again." });
  }
}
