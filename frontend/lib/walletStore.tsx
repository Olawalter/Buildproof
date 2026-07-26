"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  isMetaMaskInstalled,
  connectMetaMask,
  switchAccount,
  getAccounts,
  getCurrentChainId,
  isOnGenLayerNetwork,
  getEthereumProvider,
  GENLAYER_CHAIN_ID,
} from "./genlayer";

const DISCONNECT_FLAG = "buildproof_wallet_disconnected";

export interface WalletState {
  address: `0x${string}` | null;
  chainId: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  isMetaMaskInstalled: boolean;
  isOnCorrectNetwork: boolean;
  role: "owner" | "contractor" | null;
}

interface WalletContextValue extends WalletState {
  connect: () => Promise<string>;
  disconnect: () => void;
  switchWalletAccount: () => Promise<string>;
  setRole: (role: "owner" | "contractor" | null) => void;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>({
    address: null,
    chainId: null,
    isConnected: false,
    isConnecting: true,
    isMetaMaskInstalled: false,
    isOnCorrectNetwork: false,
    role: null,
  });

  useEffect(() => {
    const init = async () => {
      const installed = isMetaMaskInstalled();
      if (!installed) {
        setState((p) => ({ ...p, isConnecting: false, isMetaMaskInstalled: false }));
        return;
      }
      if (typeof window !== "undefined" && localStorage.getItem(DISCONNECT_FLAG) === "true") {
        setState((p) => ({ ...p, isConnecting: false, isMetaMaskInstalled: true }));
        return;
      }
      try {
        const accounts = await getAccounts();
        const chainId = await getCurrentChainId();
        const correctNetwork = await isOnGenLayerNetwork();
        setState({
          address: (accounts[0] as `0x${string}`) || null,
          chainId,
          isConnected: accounts.length > 0,
          isConnecting: false,
          isMetaMaskInstalled: true,
          isOnCorrectNetwork: correctNetwork,
          role: null,
        });
      } catch {
        setState((p) => ({ ...p, isConnecting: false, isMetaMaskInstalled: true }));
      }
    };
    init();
  }, []);

  useEffect(() => {
    const provider = getEthereumProvider();
    if (!provider) return;

    const onAccountsChanged = async (accounts: string[]) => {
      const chainId = await getCurrentChainId();
      const correctNetwork = await isOnGenLayerNetwork();
      if (accounts.length > 0 && typeof window !== "undefined") {
        localStorage.removeItem(DISCONNECT_FLAG);
      }
      setState((p) => ({
        ...p,
        address: (accounts[0] as `0x${string}`) || null,
        chainId,
        isConnected: accounts.length > 0,
        isOnCorrectNetwork: correctNetwork,
      }));
    };

    const onChainChanged = async (chainId: string) => {
      const correctNetwork = parseInt(chainId, 16) === GENLAYER_CHAIN_ID;
      const accounts = await getAccounts();
      setState((p) => ({
        ...p,
        chainId,
        address: (accounts[0] as `0x${string}`) || null,
        isConnected: accounts.length > 0,
        isOnCorrectNetwork: correctNetwork,
      }));
    };

    const onDisconnect = () =>
      setState((p) => ({ ...p, address: null, isConnected: false }));

    provider.on("accountsChanged", onAccountsChanged);
    provider.on("chainChanged", onChainChanged);
    provider.on("disconnect", onDisconnect);
    return () => {
      provider.removeListener("accountsChanged", onAccountsChanged);
      provider.removeListener("chainChanged", onChainChanged);
      provider.removeListener("disconnect", onDisconnect);
    };
  }, []);

  const connect = useCallback(async () => {
    setState((p) => ({ ...p, isConnecting: true }));
    try {
      const address = await connectMetaMask();
      const chainId = await getCurrentChainId();
      const correctNetwork = await isOnGenLayerNetwork();
      if (typeof window !== "undefined") localStorage.removeItem(DISCONNECT_FLAG);
      setState((p) => ({
        ...p,
        address: address as `0x${string}`,
        chainId,
        isConnected: true,
        isConnecting: false,
        isMetaMaskInstalled: true,
        isOnCorrectNetwork: correctNetwork,
      }));
      return address;
    } catch (err) {
      setState((p) => ({ ...p, isConnecting: false }));
      throw err;
    }
  }, []);

  const disconnect = useCallback(() => {
    if (typeof window !== "undefined") localStorage.setItem(DISCONNECT_FLAG, "true");
    setState((p) => ({ ...p, address: null, isConnected: false, role: null }));
  }, []);

  const switchWalletAccount = useCallback(async () => {
    setState((p) => ({ ...p, isConnecting: true }));
    try {
      const newAddress = await switchAccount();
      const chainId = await getCurrentChainId();
      const correctNetwork = await isOnGenLayerNetwork();
      if (typeof window !== "undefined") localStorage.removeItem(DISCONNECT_FLAG);
      setState((p) => ({
        ...p,
        address: newAddress as `0x${string}`,
        chainId,
        isConnected: true,
        isConnecting: false,
        isMetaMaskInstalled: true,
        isOnCorrectNetwork: correctNetwork,
      }));
      return newAddress;
    } catch (err) {
      setState((p) => ({ ...p, isConnecting: false }));
      throw err;
    }
  }, []);

  const setRole = useCallback((role: "owner" | "contractor" | null) => {
    setState((p) => ({ ...p, role }));
  }, []);

  return (
    <WalletContext.Provider
      value={{ ...state, connect, disconnect, switchWalletAccount, setRole }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWalletContext(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWalletContext must be used within WalletProvider");
  return ctx;
}
