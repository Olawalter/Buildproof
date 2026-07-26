"use client";

import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

// ─── Network config (mirrors boilerplate client.ts) ───────────────────────────

export const GENLAYER_CHAIN_ID = parseInt(
  process.env.NEXT_PUBLIC_GENLAYER_CHAIN_ID || "61999",
);
export const GENLAYER_CHAIN_ID_HEX = `0x${GENLAYER_CHAIN_ID.toString(16).toUpperCase()}`;

export const GENLAYER_NETWORK = {
  chainId: GENLAYER_CHAIN_ID_HEX,
  chainName: process.env.NEXT_PUBLIC_GENLAYER_CHAIN_NAME || "GenLayer Studio",
  nativeCurrency: {
    name: process.env.NEXT_PUBLIC_GENLAYER_SYMBOL || "GEN",
    symbol: process.env.NEXT_PUBLIC_GENLAYER_SYMBOL || "GEN",
    decimals: 18,
  },
  rpcUrls: [process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || "https://studio.genlayer.com/api"],
  blockExplorerUrls: [],
};

// ─── Contract address helper ───────────────────────────────────────────────────

export function getContractAddress(): `0x${string}` | "" {
  return (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "") as `0x${string}` | "";
}

export function getStudioUrl(): string {
  // In the browser, route through the Next.js proxy to avoid CORS issues.
  if (typeof window !== "undefined") return "/api/rpc";
  return process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || "https://studio.genlayer.com/api";
}

// ─── EIP-1193 helpers ─────────────────────────────────────────────────────────

interface EthereumProvider {
  isMetaMask?: boolean;
  request: (args: { method: string; params?: any[] }) => Promise<any>;
  on: (event: string, handler: (...args: any[]) => void) => void;
  removeListener: (event: string, handler: (...args: any[]) => void) => void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export function isMetaMaskInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return !!window.ethereum?.isMetaMask;
}

export function getEthereumProvider(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  return window.ethereum || null;
}

export async function requestAccounts(): Promise<string[]> {
  const provider = getEthereumProvider();
  if (!provider) throw new Error("MetaMask is not installed");
  try {
    return await provider.request({ method: "eth_requestAccounts" });
  } catch (err: any) {
    if (err.code === 4001) throw new Error("User rejected the connection request");
    throw new Error(`Failed to connect to MetaMask: ${err.message}`);
  }
}

export async function getAccounts(): Promise<string[]> {
  const provider = getEthereumProvider();
  if (!provider) return [];
  try {
    return await provider.request({ method: "eth_accounts" });
  } catch {
    return [];
  }
}

export async function getCurrentChainId(): Promise<string | null> {
  const provider = getEthereumProvider();
  if (!provider) return null;
  try {
    return await provider.request({ method: "eth_chainId" });
  } catch {
    return null;
  }
}

export async function addGenLayerNetwork(): Promise<void> {
  const provider = getEthereumProvider();
  if (!provider) throw new Error("MetaMask is not installed");
  try {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [GENLAYER_NETWORK],
    });
  } catch (err: any) {
    if (err.code === 4001) throw new Error("User rejected adding the network");
    throw new Error(`Failed to add GenLayer network: ${err.message}`);
  }
}

export async function switchToGenLayerNetwork(): Promise<void> {
  const provider = getEthereumProvider();
  if (!provider) throw new Error("MetaMask is not installed");
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: GENLAYER_CHAIN_ID_HEX }],
    });
  } catch (err: any) {
    if (err.code === 4902) {
      await addGenLayerNetwork();
    } else if (err.code === 4001) {
      throw new Error("User rejected switching the network");
    } else {
      throw new Error(`Failed to switch network: ${err.message}`);
    }
  }
}

export async function isOnGenLayerNetwork(): Promise<boolean> {
  const chainId = await getCurrentChainId();
  if (!chainId) return false;
  return parseInt(chainId, 16) === GENLAYER_CHAIN_ID;
}

export async function connectMetaMask(): Promise<string> {
  if (!isMetaMaskInstalled()) throw new Error("MetaMask is not installed");
  const accounts = await requestAccounts();
  if (!accounts?.length) throw new Error("No accounts found");
  const onCorrectNetwork = await isOnGenLayerNetwork();
  if (!onCorrectNetwork) await switchToGenLayerNetwork();
  return accounts[0];
}

export async function switchAccount(): Promise<string> {
  const provider = getEthereumProvider();
  if (!provider) throw new Error("MetaMask is not installed");
  try {
    await provider.request({
      method: "wallet_requestPermissions",
      params: [{ eth_accounts: {} }],
    });
    const accounts = await provider.request({ method: "eth_accounts" });
    if (!accounts?.length) throw new Error("No account selected");
    return accounts[0];
  } catch (err: any) {
    if (err.code === 4001) throw new Error("User rejected account switch");
    if (err.code === -32002) throw new Error("Account switch request already pending");
    throw new Error(`Failed to switch account: ${err.message}`);
  }
}

// ─── GenLayer client factory ───────────────────────────────────────────────────

export function createGenLayerClient(address?: string | null) {
  const studioUrl = getStudioUrl();
  const config: any = { chain: studionet };
  if (address) config.account = address as `0x${string}`;
  if (studioUrl) config.endpoint = studioUrl;
  try {
    return createClient(config);
  } catch {
    return createClient({ chain: studionet });
  }
}

export function getReadClient() {
  return createGenLayerClient();
}

export function getWriteClient(walletAddress: `0x${string}`) {
  return createGenLayerClient(walletAddress);
}

export async function getClient() {
  const accounts = await getAccounts();
  return createGenLayerClient(accounts[0]);
}
