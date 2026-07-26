"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, LayoutDashboard, Wallet, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/hooks/useWallet";
import { shortAddress } from "@/lib/utils";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/wallet", label: "Wallet", icon: Wallet },
];

export function Navbar() {
  const pathname = usePathname();
  const { address, isConnected, isConnecting, connect, disconnect } = useWallet();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-bp-darker/80 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-bp-orange/20 border border-bp-orange/30">
              <Building2 className="h-4 w-4 text-bp-orange" />
            </div>
            <span className="font-bold text-white text-lg tracking-tight">
              Build<span className="text-bp-orange">Proof</span>
            </span>
          </Link>

          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors",
                  pathname?.startsWith(href)
                    ? "bg-white/8 text-white"
                    : "text-white/50 hover:text-white hover:bg-white/5",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>

          {/* Wallet */}
          <div className="flex items-center gap-3">
            {isConnected && address ? (
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm">
                  <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-white font-mono text-xs">{shortAddress(address)}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={disconnect} className="text-xs">
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={connect}
                disabled={isConnecting}
                className="gap-1.5"
              >
                <Wallet className="h-3.5 w-3.5" />
                {isConnecting ? "Connecting…" : "Connect Wallet"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
