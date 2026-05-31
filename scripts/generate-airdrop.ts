#!/usr/bin/env ts-node
/**
 * game.tok · $GTOK Airdrop Merkle Generator
 *
 * Takes a CSV/JSON of eligible wallets + amounts, builds a merkle tree,
 * generates proofs for each claimant, and outputs everything needed
 * to set the on-chain root and let players claim.
 *
 * Usage:
 *   npx ts-node scripts/generate-airdrop.ts \
 *     --input  data/eligible-players.csv \
 *     --output dist/airdrop/ \
 *     --total  10000000    (10M $GTOK in base units with 6 decimals)
 *
 * Output files:
 *   dist/airdrop/merkle-root.txt     — set this on-chain via set_airdrop_merkle_root
 *   dist/airdrop/proofs.json         — serve this from your API for claim calls
 *   dist/airdrop/summary.json        — audit log: total allocated, wallet count, etc.
 *   dist/airdrop/claimants.json      — full list for verification
 *
 * The governance program verifies:
 *   keccak256(wallet ++ amount_le_bytes) is a leaf in the tree with this root.
 */

import * as fs   from "fs";
import * as path from "path";
import * as crypto from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Claimant {
  wallet: string;
  amount: bigint;  // base units (GTOK * 10^6)
  proof?: string[];
}

interface AirdropSummary {
  merkleRoot:     string;
  totalClaimants: number;
  totalAmount:    bigint;
  generatedAt:    string;
  treeDepth:      number;
  snapshotBlock:  number;
}

// ─── Keccak256 ────────────────────────────────────────────────────────────────

function keccak256(data: Buffer): Buffer {
  return crypto.createHash("sha3-256").update(data).digest();
}

function hashLeaf(wallet: string, amount: bigint): Buffer {
  const walletBuf = Buffer.from(
    wallet.startsWith("0x") ? wallet.slice(2) : Buffer.from(wallet).toString("hex"),
    "hex"
  );

  // Use base58 decode for Solana wallets
  const walletBytes = base58Decode(wallet);
  const amountBuf   = Buffer.alloc(8);
  amountBuf.writeBigUInt64LE(amount);
  return keccak256(Buffer.concat([walletBytes, amountBuf]));
}

function hashPair(a: Buffer, b: Buffer): Buffer {
  return a.compare(b) <= 0
    ? keccak256(Buffer.concat([a, b]))
    : keccak256(Buffer.concat([b, a]));
}

// ─── Base58 ───────────────────────────────────────────────────────────────────

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(input: string): Buffer {
  let num = BigInt(0);
  const base = BigInt(58);
  for (const char of input) {
    const idx = BASE58_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error(`Invalid base58 char: ${char}`);
    num = num * base + BigInt(idx);
  }
  // Convert to 32-byte buffer
  const hex    = num.toString(16).padStart(64, "0");
  return Buffer.from(hex, "hex");
}

// ─── Merkle tree ──────────────────────────────────────────────────────────────

class MerkleTree {
  private leaves: Buffer[];
  private layers: Buffer[][];

  constructor(leaves: Buffer[]) {
    if (leaves.length === 0) throw new Error("Cannot build tree with zero leaves");

    // Sort leaves for determinism
    this.leaves = [...leaves].sort(Buffer.compare);

    // Pad to power of 2
    let size = 1;
    while (size < this.leaves.length) size *= 2;
    while (this.leaves.length < size) {
      this.leaves.push(this.leaves[this.leaves.length - 1]);
    }

    this.layers = [this.leaves];
    let current = this.leaves;
    while (current.length > 1) {
      const next: Buffer[] = [];
      for (let i = 0; i < current.length; i += 2) {
        next.push(hashPair(current[i], current[i + 1]));
      }
      this.layers.push(next);
      current = next;
    }
  }

  get root(): Buffer {
    return this.layers[this.layers.length - 1][0];
  }

  get rootHex(): string {
    return this.root.toString("hex");
  }

  get depth(): number {
    return this.layers.length - 1;
  }

  getProof(leaf: Buffer): Buffer[] {
    let idx = this.leaves.findIndex(l => l.compare(leaf) === 0);
    if (idx === -1) throw new Error("Leaf not found in tree");

    const proof: Buffer[] = [];
    for (let i = 0; i < this.layers.length - 1; i++) {
      const layer     = this.layers[i];
      const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
      if (siblingIdx < layer.length) {
        proof.push(layer[siblingIdx]);
      }
      idx = Math.floor(idx / 2);
    }
    return proof;
  }

  verifyProof(leaf: Buffer, proof: Buffer[], root: Buffer): boolean {
    let current = leaf;
    for (const sibling of proof) {
      current = hashPair(current, sibling);
    }
    return current.compare(root) === 0;
  }
}

// ─── Allocation strategies ────────────────────────────────────────────────────

/**
 * Equal split: each claimant gets the same amount.
 */
export function equalSplit(wallets: string[], totalAmount: bigint): Claimant[] {
  const perWallet = totalAmount / BigInt(wallets.length);
  return wallets.map(wallet => ({ wallet, amount: perWallet }));
}

/**
 * Proportional: allocate based on score/activity.
 * scores: { wallet -> score } — higher score = more $GTOK
 */
export function proportionalAlloc(
  scores: Record<string, number>,
  totalAmount: bigint,
): Claimant[] {
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  return Object.entries(scores).map(([wallet, score]) => ({
    wallet,
    amount: totalAmount * BigInt(Math.round(score * 1_000_000)) / BigInt(Math.round(totalScore * 1_000_000)),
  }));
}

/**
 * Tiered: top 100 get 5000, top 1000 get 1000, rest get 250.
 */
export function tieredAlloc(
  rankedWallets: string[], // ordered by rank (best first)
  tiers: Array<{ count: number; amount: bigint }>,
): Claimant[] {
  const result: Claimant[] = [];
  let pos = 0;
  for (const tier of tiers) {
    const slice = rankedWallets.slice(pos, pos + tier.count);
    for (const wallet of slice) {
      result.push({ wallet, amount: tier.amount });
    }
    pos += tier.count;
  }
  return result;
}

// ─── Input parsing ────────────────────────────────────────────────────────────

function parseInput(filePath: string): Claimant[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const ext     = path.extname(filePath).toLowerCase();

  if (ext === ".json") {
    const data = JSON.parse(content) as Array<{ wallet: string; amount: string | number }>;
    return data.map(row => ({ wallet: row.wallet, amount: BigInt(row.amount) }));
  }

  if (ext === ".csv") {
    return content
      .split("\n")
      .slice(1) // skip header
      .filter(line => line.trim())
      .map(line => {
        const [wallet, amount] = line.split(",").map(s => s.trim());
        return { wallet, amount: BigInt(amount) };
      });
  }

  throw new Error(`Unsupported file format: ${ext}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args     = Object.fromEntries(
    process.argv.slice(2)
      .filter(a => a.startsWith("--"))
      .map(a => { const [k, v] = a.slice(2).split("="); return [k, v]; })
  );

  const inputPath  = args.input  ?? "data/eligible-players.json";
  const outputDir  = args.output ?? "dist/airdrop";
  const snapshotBlock = parseInt(args.block ?? "0");

  console.log("game.tok $GTOK Airdrop Generator");
  console.log("─────────────────────────────────");

  // Load or generate claimants
  let claimants: Claimant[];

  if (fs.existsSync(inputPath)) {
    console.log(`Loading claimants from ${inputPath}...`);
    claimants = parseInput(inputPath);
  } else {
    // Demo mode: generate synthetic claimants
    console.log("No input file found — generating demo claimants...");
    const DEMO_WALLETS = [
      "DkNf8mT5rXpJ3qW9vL2KcA7nR4sY6hE1bP0gZ8uMo",
      "8mNkL4xR2pQ7vJ9cT3wE6nB1sA5hY0gZ4uMoDkfX",
      "9pQrL2xT4vJ8cN3wK7mB0sE6hY1gZ5uAoDkfXmNL",
      "AbCdEfGhIjKlMnOpQrStUvWxYz123456789ABCDEF",
      "GhJkLmNpQrStUvWxYzAbCdEf123456789GHIJKLM",
    ];
    const DEMO_TOTAL = BigInt(10_000_000_000_000); // 10M with 6 decimals

    claimants = tieredAlloc(DEMO_WALLETS, [
      { count: 1,  amount: BigInt(5_000_000_000) },  // rank 1: 5,000 $GTOK
      { count: 2,  amount: BigInt(2_000_000_000) },  // rank 2-3: 2,000 $GTOK
      { count: 2,  amount: BigInt(500_000_000)  },   // rank 4-5: 500 $GTOK
    ]);
  }

  console.log(`Loaded ${claimants.length} claimants`);

  const totalAmount = claimants.reduce((sum, c) => sum + c.amount, BigInt(0));
  console.log(`Total allocation: ${(Number(totalAmount) / 1_000_000).toLocaleString()} $GTOK`);

  // Build merkle tree
  console.log("Building merkle tree...");
  const leaves = claimants.map(c => hashLeaf(c.wallet, c.amount));
  const tree   = new MerkleTree(leaves);

  console.log(`Root:  0x${tree.rootHex}`);
  console.log(`Depth: ${tree.depth} levels`);

  // Generate proofs for all claimants
  console.log("Generating proofs...");
  const proofsMap: Record<string, { amount: string; proof: string[] }> = {};

  for (const claimant of claimants) {
    const leaf  = hashLeaf(claimant.wallet, claimant.amount);
    const proof = tree.getProof(leaf);

    // Verify immediately
    const valid = tree.verifyProof(leaf, proof, tree.root);
    if (!valid) throw new Error(`Proof verification failed for ${claimant.wallet}`);

    claimant.proof = proof.map(p => p.toString("hex"));
    proofsMap[claimant.wallet] = {
      amount: claimant.amount.toString(),
      proof:  claimant.proof,
    };
  }

  // Write outputs
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const summary: AirdropSummary = {
    merkleRoot:     `0x${tree.rootHex}`,
    totalClaimants: claimants.length,
    totalAmount,
    generatedAt:    new Date().toISOString(),
    treeDepth:      tree.depth,
    snapshotBlock,
  };

  fs.writeFileSync(
    path.join(outputDir, "merkle-root.txt"),
    tree.rootHex,
  );

  fs.writeFileSync(
    path.join(outputDir, "proofs.json"),
    JSON.stringify(proofsMap, (_, v) => typeof v === "bigint" ? v.toString() : v, 2),
  );

  fs.writeFileSync(
    path.join(outputDir, "summary.json"),
    JSON.stringify(summary, (_, v) => typeof v === "bigint" ? v.toString() : v, 2),
  );

  fs.writeFileSync(
    path.join(outputDir, "claimants.json"),
    JSON.stringify(claimants.map(c => ({
      wallet: c.wallet,
      amount: c.amount.toString(),
      amountHuman: (Number(c.amount) / 1_000_000).toFixed(2),
      proof: c.proof,
    })), null, 2),
  );

  console.log("\n✅ Done!");
  console.log(`   Merkle root: ${outputDir}/merkle-root.txt`);
  console.log(`   Proofs:      ${outputDir}/proofs.json`);
  console.log(`   Summary:     ${outputDir}/summary.json`);
  console.log("");
  console.log("Next steps:");
  console.log("  1. Review summary.json — verify totals match your allocation plan");
  console.log("  2. Call set_airdrop_merkle_root with the hex value in merkle-root.txt");
  console.log("  3. Host proofs.json at https://gametok.io/api/airdrop-proof?wallet=<WALLET>");
  console.log("  4. Announce the airdrop — players call claim_player_airdrop with their proof");
}

// ─── Proof API helper (used in Next.js API route) ────────────────────────────

/**
 * Load proofs at startup (cache in memory).
 * Called from /api/airdrop-proof?wallet=<WALLET>
 */
let _proofsCache: Record<string, { amount: string; proof: string[] }> | null = null;

export function loadProofs(proofsJsonPath: string) {
  if (!_proofsCache) {
    _proofsCache = JSON.parse(fs.readFileSync(proofsJsonPath, "utf-8"));
  }
  return _proofsCache!;
}

export function getProofForWallet(
  wallet:         string,
  proofsJsonPath: string,
): { amount: string; proof: string[] } | null {
  const proofs = loadProofs(proofsJsonPath);
  return proofs[wallet] ?? null;
}

main().catch(err => {
  console.error("Airdrop generator failed:", err);
  process.exit(1);
});
