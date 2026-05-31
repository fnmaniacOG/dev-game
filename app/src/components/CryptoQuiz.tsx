import { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = "defi" | "solana" | "security" | "history" | "trading";
type Difficulty = "easy" | "medium" | "hard";
type Phase = "lobby" | "quiz" | "result" | "review";

interface Question {
  id:           string;
  category:     Category;
  difficulty:   Difficulty;
  question:     string;
  options:      string[];
  correct:      number;
  explanation:  string;
  reward:       number; // $QUIZ tokens
}

interface PlayerAnswer {
  question:  Question;
  chosen:    number;
  correct:   boolean;
  timeLeft:  number;
}

// ─── Question bank ────────────────────────────────────────────────────────────

const QUESTIONS: Question[] = [
  // ── DeFi ──────────────────────────────────────────────────────────────────
  {
    id: "d1", category: "defi", difficulty: "easy",
    question: "What does AMM stand for in DeFi?",
    options: ["Automated Market Maker", "Asset Management Module", "Annual Margin Model", "Algorithmic Money Manager"],
    correct: 0, reward: 10,
    explanation: "An AMM is a type of decentralized exchange protocol that uses a mathematical formula to price assets, replacing traditional order books. Uniswap popularized the x*y=k constant product formula.",
  },
  {
    id: "d2", category: "defi", difficulty: "medium",
    question: "What is impermanent loss?",
    options: [
      "Loss from gas fees on failed transactions",
      "Temporary loss from providing liquidity when token prices diverge",
      "Loss from lending tokens at a low interest rate",
      "Loss when a smart contract is exploited",
    ],
    correct: 1, reward: 20,
    explanation: "Impermanent loss occurs when you provide liquidity to an AMM and the price ratio of the tokens changes from when you deposited. The 'impermanent' part means if prices return to original ratio, the loss disappears — but you also miss out on holding gains.",
  },
  {
    id: "d3", category: "defi", difficulty: "hard",
    question: "What is a flash loan attack?",
    options: [
      "Borrowing tokens at very high interest rates",
      "Exploiting price oracle manipulation using uncollateralized same-block loans",
      "Attacking a protocol by spamming small transactions",
      "Stealing funds by draining a liquidity pool over time",
    ],
    correct: 1, reward: 40,
    explanation: "Flash loans allow borrowing any amount without collateral, as long as it's repaid in the same transaction. Attackers borrow huge sums to manipulate prices or drain protocol treasuries, then repay — all in one block. The $100M+ Euler Finance hack used this technique.",
  },
  {
    id: "d4", category: "defi", difficulty: "easy",
    question: "What is a liquidity pool?",
    options: [
      "A savings account in a bank",
      "Smart contract holding pairs of tokens enabling decentralized trading",
      "A group of investors who pool money for trading",
      "A Solana validator cluster",
    ],
    correct: 1, reward: 10,
    explanation: "Liquidity pools are smart contracts that hold reserves of token pairs. When you trade on a DEX like Uniswap or Raydium, you're swapping against these reserves. Liquidity providers earn fees in return for depositing tokens.",
  },
  {
    id: "d5", category: "defi", difficulty: "medium",
    question: "What is the difference between APR and APY?",
    options: [
      "APR = annual, APY = monthly",
      "APR doesn't include compounding, APY does",
      "APY doesn't include compounding, APR does",
      "They are the same metric with different names",
    ],
    correct: 1, reward: 20,
    explanation: "APR (Annual Percentage Rate) is simple interest — just the base rate. APY (Annual Percentage Yield) includes compounding effects. A 100% APR compounded daily becomes ~172% APY. DeFi protocols often advertise APY to make yields look better.",
  },
  // ── Solana ─────────────────────────────────────────────────────────────────
  {
    id: "s1", category: "solana", difficulty: "easy",
    question: "What consensus mechanism does Solana use?",
    options: ["Proof of Work", "Proof of Stake alone", "Proof of History + Proof of Stake", "Delegated Proof of Stake"],
    correct: 2, reward: 10,
    explanation: "Solana uses Proof of History (PoH) as a cryptographic clock combined with Proof of Stake (PoS). PoH creates a historical record proving that events occurred at specific times, allowing validators to reach consensus without constant communication.",
  },
  {
    id: "s2", category: "solana", difficulty: "medium",
    question: "What is a Program Derived Address (PDA) on Solana?",
    options: [
      "A private key generated from a seed phrase",
      "A wallet address that earns staking rewards",
      "A deterministic address that belongs to a program, not a private key",
      "A Solana Name Service domain address",
    ],
    correct: 2, reward: 20,
    explanation: "PDAs are addresses derived deterministically from a program ID and seeds. They're crucial for Solana programs because the program can sign for them without a private key — using the program's authority. This is how escrow accounts, token vaults, and other contract state work in Anchor.",
  },
  {
    id: "s3", category: "solana", difficulty: "hard",
    question: "What is the maximum transaction size on Solana, and why does it matter?",
    options: [
      "1 MB — larger than Ethereum so more complex operations are possible",
      "1232 bytes — limits how many instructions and accounts can fit in one transaction",
      "64 KB — set by the BPF virtual machine execution limit",
      "No limit — Solana uses a streaming transaction model",
    ],
    correct: 1, reward: 40,
    explanation: "Solana transactions are limited to 1232 bytes (the MTU of IPv6). This constrains how many accounts, instructions, and signatures can fit in a single transaction. V0 transactions with address lookup tables (ALTs) compress account addresses to work around this limit, enabling more complex transactions like multi-instruction DeFi composability.",
  },
  {
    id: "s4", category: "solana", difficulty: "easy",
    question: "What is the Solana native staking yield approximately?",
    options: ["0.5–1%", "5–8%", "15–20%", "50%+"],
    correct: 1, reward: 10,
    explanation: "Solana native staking yields approximately 5–8% annually depending on network activity and validator commission rates. This comes from newly minted SOL (inflation) and transaction fees distributed to validators and their delegators.",
  },
  {
    id: "s5", category: "solana", difficulty: "medium",
    question: "What is Solana's approximate transaction throughput target?",
    options: ["15 TPS", "65,000 TPS", "500 TPS", "1,000,000 TPS"],
    correct: 1, reward: 20,
    explanation: "Solana's theoretical throughput is 65,000 TPS based on its architecture. In practice, the network has processed ~3,000–4,000 TPS on mainnet during peak periods. The gap between theoretical and actual is due to current validator hardware and network conditions — the team continues to optimize toward the theoretical limit.",
  },
  // ── Security ───────────────────────────────────────────────────────────────
  {
    id: "sec1", category: "security", difficulty: "easy",
    question: "What is a rug pull in crypto?",
    options: [
      "A bug in a smart contract that locks funds",
      "When developers abandon a project and drain the liquidity",
      "A market crash caused by whale selling",
      "When a validator goes offline unexpectedly",
    ],
    correct: 1, reward: 10,
    explanation: "A rug pull is when developers of a crypto project suddenly drain all the liquidity and disappear. It's the #1 reason game.tok enforces locked liquidity — once LP tokens are locked, the developer literally cannot remove liquidity for the lock period.",
  },
  {
    id: "sec2", category: "security", difficulty: "medium",
    question: "What is a re-entrancy attack?",
    options: [
      "Using the same private key on multiple blockchains",
      "Exploiting a contract that calls external code before updating its own state",
      "Signing a transaction after it's been broadcasted",
      "Replaying an old transaction from another chain",
    ],
    correct: 1, reward: 25,
    explanation: "Re-entrancy attacks exploit contracts that call external contracts before updating their internal state. The external call can recursively call back into the original contract before balances are updated — draining funds. The DAO hack in 2016 ($60M stolen) was a re-entrancy attack. Solana's account model makes this much harder than Ethereum's.",
  },
  {
    id: "sec3", category: "security", difficulty: "hard",
    question: "What is a Sybil attack in blockchain networks?",
    options: [
      "Attacking a smart contract with multiple concurrent transactions",
      "Creating many fake identities to gain disproportionate influence in a network",
      "Exploiting validator software bugs to produce invalid blocks",
      "Draining a protocol's token reserves through repeated small withdrawals",
    ],
    correct: 1, reward: 40,
    explanation: "A Sybil attack involves creating many fake identities to subvert voting, reputation, or consensus systems. Proof of Work and Proof of Stake defend against this by making identity creation expensive (compute or stake). In governance systems, Sybil attacks can manipulate votes — which is why many DAOs require token holdings to vote.",
  },
  {
    id: "sec4", category: "security", difficulty: "easy",
    question: "What should you NEVER share with anyone?",
    options: ["Your wallet public address", "Your seed phrase / secret recovery phrase", "Your transaction signature hash", "Your NFT token ID"],
    correct: 1, reward: 10,
    explanation: "Your seed phrase (12 or 24 words) gives complete control over your wallet. Anyone with it can drain all your funds instantly. Hardware wallets, password managers, or physical secure storage (not digital photos) are the recommended ways to store seed phrases. No legitimate protocol or support team will ever ask for it.",
  },
  {
    id: "sec5", category: "security", difficulty: "medium",
    question: "What is a 51% attack?",
    options: [
      "When 51% of token holders vote to change protocol rules",
      "When an attacker gains majority hash power to control blockchain consensus",
      "When 51% of liquidity is removed from a DEX pool",
      "A smart contract bug that affects 51% of transactions",
    ],
    correct: 1, reward: 25,
    explanation: "A 51% attack occurs when a single entity controls more than half of a blockchain's mining power (PoW) or staked tokens (PoS), allowing them to reverse transactions or double-spend. Solana's design, with ~1,900 validators and high stake concentration requirements, makes this economically prohibitive.",
  },
  // ── Trading ────────────────────────────────────────────────────────────────
  {
    id: "t1", category: "trading", difficulty: "easy",
    question: "What is slippage in a token trade?",
    options: [
      "Transaction fees paid to validators",
      "The difference between expected and actual execution price",
      "The time delay between submitting and confirming a trade",
      "Price difference between centralized and decentralized exchanges",
    ],
    correct: 1, reward: 10,
    explanation: "Slippage is the difference between the price you expected to get and the price you actually got. High slippage happens in low-liquidity pools. Setting a slippage tolerance (e.g. 1%) protects you — your trade reverts if the price moves more than that during execution.",
  },
  {
    id: "t2", category: "trading", difficulty: "medium",
    question: "What is 'on-chain' vs 'off-chain' order book?",
    options: [
      "On-chain = faster, off-chain = slower",
      "On-chain stores orders in smart contracts, off-chain stores them on centralized servers",
      "On-chain only supports market orders, off-chain supports all order types",
      "They are identical architectures with different terminology",
    ],
    correct: 1, reward: 20,
    explanation: "On-chain order books (like Serum/OpenBook on Solana) store and match orders in smart contracts — transparent but slower and more expensive per operation. Off-chain order books (like Binance) run on centralized servers — faster and cheaper but require trusting the exchange. AMMs eliminate order books entirely with algorithmic pricing.",
  },
  {
    id: "t3", category: "trading", difficulty: "hard",
    question: "What is MEV (Maximal Extractable Value)?",
    options: [
      "Maximum profit a validator earns from block rewards",
      "Profit extracted by reordering/inserting transactions in a block",
      "The highest return achievable from yield farming",
      "Maximum tokens extractable from a liquidity pool",
    ],
    correct: 1, reward: 40,
    explanation: "MEV is profit that validators/miners can extract by controlling transaction ordering within blocks. This includes frontrunning (inserting a buy before a large pending buy they can see), sandwich attacks (buying before and selling after), and arbitrage between pools. On Solana, the SIMD-96 and Jito validator client implement MEV infrastructure. MEV redistributed ~$1B+ to Ethereum validators in 2023.",
  },
  // ── History ────────────────────────────────────────────────────────────────
  {
    id: "h1", category: "history", difficulty: "easy",
    question: "When was the Bitcoin whitepaper published?",
    options: ["2006", "2008", "2010", "2012"],
    correct: 1, reward: 10,
    explanation: "Satoshi Nakamoto published 'Bitcoin: A Peer-to-Peer Electronic Cash System' on October 31, 2008 — Halloween. The first block (genesis block) was mined on January 3, 2009, containing the message 'The Times 03/Jan/2009 Chancellor on brink of second bailout for banks.'",
  },
  {
    id: "h2", category: "history", difficulty: "medium",
    question: "What was the first NFT project?",
    options: ["CryptoPunks", "Colored Coins", "Quantum (by Kevin McCoy)", "CryptoKitties"],
    correct: 2, reward: 20,
    explanation: "Kevin McCoy created 'Quantum' in May 2014 on the Namecoin blockchain — considered the first NFT. CryptoPunks (2017) pioneered the profile picture NFT. CryptoKitties (2017) brought NFTs mainstream and actually congested Ethereum. Colored Coins (2012) were an earlier Bitcoin-based attempt at representing assets.",
  },
  {
    id: "h3", category: "history", difficulty: "hard",
    question: "What was the value of the first documented commercial Bitcoin transaction?",
    options: [
      "1 BTC for $1",
      "10,000 BTC for two pizzas (~$41 at the time)",
      "100 BTC for a graphics card",
      "50 BTC for hosting services",
    ],
    correct: 1, reward: 40,
    explanation: "On May 22, 2010, Laszlo Hanyecz paid 10,000 BTC for two Papa John's pizzas — approximately $41. Bitcoin Pizza Day is still celebrated annually on May 22. At Bitcoin's 2021 peak (~$69,000), those pizzas would have been worth ~$690 million. Laszlo has said he doesn't regret it.",
  },
];

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<Category, { label: string; emoji: string; color: string }> = {
  defi:     { label: "DeFi",     emoji: "🏦", color: "var(--teal)" },
  solana:   { label: "Solana",   emoji: "☀️", color: "var(--orange)" },
  security: { label: "Security", emoji: "🔐", color: "var(--red)" },
  trading:  { label: "Trading",  emoji: "📈", color: "var(--green)" },
  history:  { label: "History",  emoji: "📜", color: "var(--amber)" },
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function CryptoQuiz() {
  const [phase,       setPhase]       = useState<Phase>("lobby");
  const [questions,   setQuestions]   = useState<Question[]>([]);
  const [qIndex,      setQIndex]      = useState(0);
  const [chosen,      setChosen]      = useState<number | null>(null);
  const [answers,     setAnswers]     = useState<PlayerAnswer[]>([]);
  const [timeLeft,    setTimeLeft]    = useState(20);
  const [streak,      setStreak]      = useState(0);
  const [totalTokens, setTotalTokens] = useState(0);
  const [filter,      setFilter]      = useState<Category | "all">("all");

  const current = questions[qIndex];

  // Timer
  useEffect(() => {
    if (phase !== "quiz" || chosen !== null) return;
    if (timeLeft <= 0) {
      handleAnswer(-1); // timeout
      return;
    }
    const t = setTimeout(() => setTimeLeft(p => p - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, timeLeft, chosen]);

  const startQuiz = (cat: Category | "all") => {
    const pool = QUESTIONS.filter(q => cat === "all" || q.category === cat);
    const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, 10);
    setQuestions(shuffled);
    setQIndex(0);
    setChosen(null);
    setAnswers([]);
    setTimeLeft(20);
    setStreak(0);
    setTotalTokens(0);
    setPhase("quiz");
  };

  const handleAnswer = useCallback((optionIdx: number) => {
    if (!current || chosen !== null) return;
    setChosen(optionIdx);

    const isCorrect = optionIdx === current.correct;
    const newStreak = isCorrect ? streak + 1 : 0;
    setStreak(newStreak);

    const streakBonus = Math.min(3, Math.floor(newStreak / 3));
    const timeBonus   = Math.ceil((timeLeft / 20) * current.reward * 0.5);
    const earned      = isCorrect ? current.reward + timeBonus + streakBonus * 5 : 0;
    setTotalTokens(p => p + earned);

    setAnswers(prev => [...prev, {
      question: current,
      chosen:   optionIdx,
      correct:  isCorrect,
      timeLeft,
    }]);

    setTimeout(() => {
      if (qIndex + 1 >= questions.length) {
        setPhase("result");
      } else {
        setQIndex(p => p + 1);
        setChosen(null);
        setTimeLeft(20);
      }
    }, 1400);
  }, [current, chosen, streak, timeLeft, qIndex, questions.length]);

  // ── Lobby ───────────────────────────────────────────────────────────────
  if (phase === "lobby") {
    return (
      <div style={{ fontFamily: "var(--font-sans, sans-serif)" }}>
        <div style={{
          background: "linear-gradient(135deg, #0A1F2E 0%, #122233 100%)",
          borderRadius: 16, padding: "24px 20px", marginBottom: 20,
        }}>
          <div style={{ fontSize: 11, color: "#4AABCC", letterSpacing: "1.5px", fontWeight: 600, marginBottom: 6 }}>
            DEVGAME · EDUCATIONAL
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#E8F4FC", marginBottom: 6 }}>
            🎓 Crypto Quiz
          </div>
          <div style={{ fontSize: 13, color: "#6090A8", lineHeight: 1.5 }}>
            Answer correctly, earn $QUIZ tokens. Streak bonuses for consecutive correct answers.
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>Choose a category</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 8 }}>
            {(Object.keys(CATEGORY_CONFIG) as Category[]).map(cat => {
              const cfg = CATEGORY_CONFIG[cat];
              const count = QUESTIONS.filter(q => q.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setFilter(cat)}
                  style={{
                    padding: "10px 8px", borderRadius: 10, textAlign: "left",
                    border: `${filter === cat ? "2px" : "0.5px"} solid ${filter === cat ? cfg.color : "var(--border)"}`,
                    background: filter === cat ? "var(--surface-2)" : "var(--surface)",
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  <div style={{ fontSize: 18, marginBottom: 3 }}>{cfg.emoji}</div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>{cfg.label}</div>
                  <div style={{ fontSize: 10, color: "var(--muted)" }}>{count} questions</div>
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setFilter("all")}
            style={{
              width: "100%", padding: "9px 12px", borderRadius: 10, textAlign: "left",
              border: `${filter === "all" ? "2px" : "0.5px"} solid ${filter === "all" ? "var(--orange)" : "var(--border)"}`,
              background: filter === "all" ? "var(--orange-light)" : "var(--surface)",
              cursor: "pointer", fontSize: 13, color: filter === "all" ? "var(--orange)" : "var(--muted)",
              display: "flex", justifyContent: "space-between",
            }}
          >
            <span>🎲 All categories (mixed)</span>
            <span>{QUESTIONS.length} questions</span>
          </button>
        </div>

        <div style={{
          background: "var(--surface)", borderRadius: 10, padding: 14, marginBottom: 20,
          fontSize: 12, color: "var(--muted)", lineHeight: 1.7,
        }}>
          <strong style={{ color: "var(--text)" }}>How rewards work:</strong> Each correct answer earns base $QUIZ + time bonus (answer faster = more) + streak bonus (+5 per 3 in a row). Wrong answers earn 0. 10 questions per round.
        </div>

        <button
          onClick={() => startQuiz(filter)}
          style={{
            width: "100%", padding: 14, borderRadius: 10, border: "none",
            background: "linear-gradient(135deg, var(--teal) 0%, var(--teal-dark) 100%)",
            color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer",
          }}
        >
          start quiz →
        </button>
      </div>
    );
  }

  // ── Quiz ────────────────────────────────────────────────────────────────
  if (phase === "quiz" && current) {
    const catCfg = CATEGORY_CONFIG[current.category];
    const timerPct = (timeLeft / 20) * 100;
    const timerColor = timerPct > 50 ? "var(--green)" : timerPct > 25 ? "var(--amber)" : "var(--red)";

    return (
      <div style={{ fontFamily: "var(--font-sans, sans-serif)" }}>
        {/* Progress */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
            <span>Question {qIndex + 1} of {questions.length}</span>
            <span style={{ color: streak >= 3 ? "var(--orange)" : "var(--muted)" }}>
              🔥 streak: {streak}
            </span>
          </div>
          <div style={{ height: 4, background: "var(--surface)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 2,
              background: "var(--teal)",
              width: `${((qIndex) / questions.length) * 100}%`,
              transition: "width 0.4s ease",
            }} />
          </div>
        </div>

        {/* Timer */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
            <span style={{ color: catCfg.color }}>
              {catCfg.emoji} {catCfg.label} · {current.difficulty}
            </span>
            <span style={{ color: timerColor, fontWeight: 600 }}>{timeLeft}s</span>
          </div>
          <div style={{ height: 6, background: "var(--surface)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 3,
              background: timerColor,
              width: `${timerPct}%`,
              transition: "width 1s linear",
            }} />
          </div>
        </div>

        {/* Question */}
        <div style={{
          background: "var(--surface)", borderRadius: 12, padding: "16px 16px",
          marginBottom: 16, fontSize: 15, fontWeight: 500, lineHeight: 1.5,
        }}>
          {current.question}
        </div>

        {/* Options */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {current.options.map((opt, i) => {
            const isChosen  = chosen === i;
            const isCorrect = i === current.correct;
            const showResult = chosen !== null;

            let bg = "var(--background)";
            let border = "var(--border)";
            let color = "var(--text)";

            if (showResult) {
              if (isCorrect) {
                bg = "var(--green-light)"; border = "var(--green)"; color = "var(--green)";
              } else if (isChosen && !isCorrect) {
                bg = "var(--red-light)"; border = "var(--red)"; color = "var(--red)";
              }
            } else if (isChosen) {
              bg = "var(--orange-light)"; border = "var(--orange)";
            }

            return (
              <button
                key={i}
                onClick={() => handleAnswer(i)}
                disabled={chosen !== null}
                style={{
                  padding: "12px 14px", borderRadius: 10,
                  border: `${showResult && isCorrect ? "2px" : "0.5px"} solid ${border}`,
                  background: bg, color,
                  fontSize: 13, textAlign: "left",
                  cursor: chosen !== null ? "default" : "pointer",
                  transition: "all 0.15s",
                  display: "flex", alignItems: "center", gap: 10,
                }}
              >
                <span style={{
                  width: 22, height: 22, borderRadius: "50%",
                  background: showResult && isCorrect ? "var(--green)" : "var(--surface)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 600, flexShrink: 0,
                  color: showResult && isCorrect ? "#fff" : "var(--muted)",
                }}>
                  {showResult && isCorrect ? "✓" : showResult && isChosen && !isCorrect ? "✗" : ["A","B","C","D"][i]}
                </span>
                {opt}
              </button>
            );
          })}
        </div>

        {/* Explanation (shown after answer) */}
        {chosen !== null && (
          <div style={{
            background: "var(--surface)", borderRadius: 10, padding: 14,
            fontSize: 12, color: "var(--muted)", lineHeight: 1.6,
            border: "0.5px solid var(--border)",
          }}>
            <strong style={{ color: "var(--text)", fontSize: 11 }}>💡 EXPLANATION</strong>
            <div style={{ marginTop: 6 }}>{current.explanation}</div>
          </div>
        )}
      </div>
    );
  }

  // ── Result ────────────────────────────────────────────────────────────────
  if (phase === "result") {
    const correct = answers.filter(a => a.correct).length;
    const pct = Math.round((correct / answers.length) * 100);
    const grade = pct >= 90 ? "S" : pct >= 70 ? "A" : pct >= 50 ? "B" : pct >= 30 ? "C" : "D";
    const gradeColors: Record<string, string> = { S: "var(--orange)", A: "var(--green)", B: "var(--teal)", C: "var(--amber)", D: "var(--red)" };

    return (
      <div style={{ fontFamily: "var(--font-sans, sans-serif)" }}>
        {/* Score card */}
        <div style={{
          background: "var(--surface)", borderRadius: 16, padding: "24px 20px",
          textAlign: "center", marginBottom: 20,
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: "50%",
            background: gradeColors[grade], margin: "0 auto 12px",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 32, fontWeight: 700, color: "#fff",
          }}>{grade}</div>
          <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>{correct}/{answers.length}</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>{pct}% correct</div>
        </div>

        {/* Earnings */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20,
        }}>
          <div style={{ background: "var(--orange-light)", borderRadius: 12, padding: 14, textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: "var(--orange)" }}>🪙 {totalTokens}</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>$QUIZ earned</div>
          </div>
          <div style={{ background: "var(--teal-light)", borderRadius: 12, padding: 14, textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: "var(--teal)" }}>🔥 {Math.max(...answers.map((_, i, arr) => {
              let max = 0, cur = 0;
              arr.slice(0, i + 1).forEach(a => { if (a.correct) { cur++; max = Math.max(max, cur); } else cur = 0; });
              return max;
            }), 0)}</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>best streak</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button
            onClick={() => setPhase("review")}
            style={{
              padding: 12, borderRadius: 10, border: "0.5px solid var(--border)",
              background: "var(--surface)", fontSize: 13, cursor: "pointer", color: "var(--text)",
            }}
          >
            📋 review answers
          </button>
          <button
            onClick={() => setPhase("lobby")}
            style={{
              padding: 12, borderRadius: 10, border: "none",
              background: "var(--teal)", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer",
            }}
          >
            play again →
          </button>
        </div>
      </div>
    );
  }

  // ── Review ────────────────────────────────────────────────────────────────
  if (phase === "review") {
    return (
      <div style={{ fontFamily: "var(--font-sans, sans-serif)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button
            onClick={() => setPhase("result")}
            style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 18, cursor: "pointer" }}
          >←</button>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Answer Review</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {answers.map((a, i) => {
            const catCfg = CATEGORY_CONFIG[a.question.category];
            return (
              <div key={i} style={{
                border: `0.5px solid ${a.correct ? "var(--green)" : "var(--red)"}`,
                borderRadius: 12, padding: 14,
                background: a.correct ? "var(--green-light)" : "var(--red-light)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>{catCfg.emoji} Q{i + 1}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: a.correct ? "var(--green)" : "var(--red)" }}>
                    {a.correct ? "✓ correct" : "✗ wrong"}
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>{a.question.question}</div>
                {!a.correct && (
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                    ✓ {a.question.options[a.question.correct]}
                  </div>
                )}
                <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}>
                  {a.question.explanation}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}
