"use client";
import { Shield, TrendingUp, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatWei } from "@/lib/utils";

interface EscrowBalanceProps {
  contractValue: string;
  escrowDeposited: string;
  paymentReleased: boolean;
}

export function EscrowBalance({
  contractValue,
  escrowDeposited,
  paymentReleased,
}: EscrowBalanceProps) {
  const value = BigInt(contractValue);
  const deposited = BigInt(escrowDeposited);
  const pct = value > 0n ? Number((deposited * 100n) / value) : 0;

  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-bp-gold/5 to-transparent pointer-events-none" />
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-white/70 text-sm font-medium">
            <Shield className="h-4 w-4 text-bp-gold" />
            Escrow Account
          </div>
          {paymentReleased ? (
            <span className="text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-full">
              Released
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-bp-gold/80 bg-bp-gold/10 border border-bp-gold/20 px-2 py-0.5 rounded-full">
              <Lock className="h-3 w-3" />
              Locked
            </span>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-xs text-white/40 mb-1">Deposited</p>
            <p className="text-2xl font-bold text-bp-gold">{formatWei(escrowDeposited)}</p>
          </div>

          <div>
            <p className="text-xs text-white/40 mb-1">Contract Value</p>
            <p className="text-sm text-white/70">{formatWei(contractValue)}</p>
          </div>

          {/* Funding bar */}
          <div>
            <div className="flex justify-between text-xs text-white/40 mb-1.5">
              <span>Funded</span>
              <span>{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-bp-gold/60 to-bp-gold rounded-full transition-all duration-700"
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
