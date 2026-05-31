import type { AppProps } from "next/app";
import { useMemo } from "react";
import dynamic from "next/dynamic";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { clusterApiUrl } from "@solana/web3.js";
import "@solana/wallet-adapter-react-ui/styles.css";
import "../styles/globals.css";

// Dynamically import wallet modal to avoid SSR hydration mismatch
const WalletModalProvider = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then(m => m.WalletModalProvider),
  { ssr: false }
);

export default function DevGame({ Component, pageProps }: AppProps) {
  const endpoint = process.env.NEXT_PUBLIC_RPC_URL ?? clusterApiUrl("devnet");

  const wallets = useMemo(() => {
    if (typeof window === "undefined") return [];
    const { PhantomWalletAdapter } = require("@solana/wallet-adapter-phantom");
    const { SolflareWalletAdapter } = require("@solana/wallet-adapter-solflare");
    return [new PhantomWalletAdapter(), new SolflareWalletAdapter()];
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <Component {...pageProps} />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
