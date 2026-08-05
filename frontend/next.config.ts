import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "ipfs.io" },
      { protocol: "https", hostname: "gateway.pinata.cloud" },
    ],
  },
  env: {
    NEXT_PUBLIC_CONTRACT_ADDRESS: process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0xD101C412045fF5899a0115eF38270eC249E24FeC",
    NEXT_PUBLIC_GENLAYER_RPC_URL: process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || "https://studio.genlayer.com/api",
    NEXT_PUBLIC_GENLAYER_CHAIN_ID: process.env.NEXT_PUBLIC_GENLAYER_CHAIN_ID || "61999",
    NEXT_PUBLIC_GENLAYER_CHAIN_NAME: process.env.NEXT_PUBLIC_GENLAYER_CHAIN_NAME || "GenLayer Studio",
    NEXT_PUBLIC_GENLAYER_SYMBOL: process.env.NEXT_PUBLIC_GENLAYER_SYMBOL || "GEN",
    NEXT_PUBLIC_NETWORK: process.env.NEXT_PUBLIC_NETWORK || "studionet",
  },
};

export default nextConfig;
