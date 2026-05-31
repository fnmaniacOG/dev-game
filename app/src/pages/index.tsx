import Head from "next/head";
import App from "../App";

export default function Home() {
  return (
    <>
      <Head>
        <title>Dev Game — Solana Game Launchpad</title>
        <meta
          name="description"
          content="Launch blockchain games on Solana with locked liquidity, AI-designed tokenomics, and EV+ rewards. Build anything from RPGs to puzzle games."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta property="og:title" content="Dev Game — Solana Game Launchpad" />
        <meta property="og:description" content="Launch your game on Solana in 10 minutes." />
        <meta property="og:type" content="website" />
        <link rel="icon" href="/favicon.ico" />
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </Head>
      <App />
    </>
  );
}
