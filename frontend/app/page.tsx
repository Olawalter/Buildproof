"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  Shield,
  Zap,
  CheckCircle2,
  ArrowRight,
  Users,
  FileCheck,
  Scale,
  Lock,
  Globe,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/hooks/useWallet";
import { toast } from "sonner";

const FLOW_STEPS = [
  { label: "Owner Creates Project", icon: Building2, desc: "Define milestones, inspections required, and escrow amount." },
  { label: "Contractor Accepts", icon: Users, desc: "Contractor accepts terms and begins construction." },
  { label: "Escrow Deposited", icon: Lock, desc: "Owner locks funds in the GenLayer smart contract." },
  { label: "Evidence Submitted", icon: FileCheck, desc: "Contractor uploads certificates, photos, permits, and drawings." },
  { label: "AI Validators Evaluate", icon: Shield, desc: "GenLayer validators independently review evidence using LLMs." },
  { label: "Consensus → Release", icon: Scale, desc: "Optimistic Democracy consensus releases payment or locks funds." },
];

const FEATURES = [
  {
    icon: Shield,
    title: "Decentralized AI Adjudication",
    desc: "Multiple independent GenLayer validators evaluate evidence. No single point of trust. No lawyers.",
    color: "text-bp-orange",
    bg: "bg-bp-orange/10 border-bp-orange/20",
  },
  {
    icon: Lock,
    title: "Non-Custodial Escrow",
    desc: "Funds are locked in the Intelligent Contract and released only after validator consensus.",
    color: "text-bp-gold",
    bg: "bg-bp-gold/10 border-bp-gold/20",
  },
  {
    icon: Globe,
    title: "Tamper-Proof Record",
    desc: "All evidence, decisions, and appeals are permanently recorded on GenLayer.",
    color: "text-blue-400",
    bg: "bg-blue-400/10 border-blue-400/20",
  },
  {
    icon: Zap,
    title: "Fast Resolution",
    desc: "Minutes instead of months. Disputes resolved by AI consensus, not courts.",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10 border-emerald-400/20",
  },
];

export default function LandingPage() {
  const router = useRouter();
  const { isConnected, connect, isConnecting } = useWallet();

  const handleGetStarted = async () => {
    if (!isConnected) {
      try {
        await connect();
        router.push("/dashboard");
      } catch {
        toast.error("Wallet connection failed. Please install MetaMask.");
      }
    } else {
      router.push("/dashboard");
    }
  };

  return (
    <div className="relative overflow-hidden">
      {/* Background grid */}
      <div className="fixed inset-0 grid-bg opacity-60 pointer-events-none" />

      {/* Glow orbs */}
      <div className="fixed top-1/4 -left-32 h-96 w-96 rounded-full bg-bp-orange/6 blur-3xl pointer-events-none" />
      <div className="fixed top-1/2 -right-32 h-96 w-96 rounded-full bg-bp-gold/5 blur-3xl pointer-events-none" />

      {/* ── Hero ── */}
      <section className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-bp-orange/20 bg-bp-orange/5 px-4 py-1.5 text-xs text-bp-orange mb-8">
          <span className="h-1.5 w-1.5 rounded-full bg-bp-orange animate-pulse" />
          Powered by GenLayer · Optimistic Democracy
        </div>

        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white tracking-tight mb-6">
          Construction Escrow
          <br />
          <span className="text-gradient">Resolved by AI.</span>
        </h1>

        <p className="mx-auto max-w-2xl text-lg text-white/50 mb-10 leading-relaxed">
          BuildProof uses GenLayer&apos;s decentralized AI validators to adjudicate
          construction payment disputes. Upload evidence. Get consensus. Release funds — no
          lawyers, no arbitration, no delays.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <Button size="xl" onClick={handleGetStarted} disabled={isConnecting}>
            {isConnecting ? "Connecting…" : isConnected ? "Open Dashboard" : "Connect Wallet & Start"}
            <ArrowRight className="h-5 w-5" />
          </Button>
          <Button size="xl" variant="outline" asChild>
            <Link href="#how-it-works">
              How It Works
              <ChevronRight className="h-5 w-5" />
            </Link>
          </Button>
        </div>

        {/* Stats */}
        <div className="mt-16 grid grid-cols-3 gap-6 max-w-md mx-auto">
          {[
            { value: "5+", label: "AI Validators" },
            { value: "< 5 min", label: "Avg. Resolution" },
            { value: "100%", label: "On-Chain" },
          ].map(({ value, label }) => (
            <div key={label} className="text-center">
              <p className="text-2xl font-bold text-white">{value}</p>
              <p className="text-xs text-white/40 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white mb-3">Why BuildProof?</h2>
          <p className="text-white/40 max-w-lg mx-auto">
            Built on GenLayer&apos;s Intelligent Contract platform — the only blockchain
            that natively runs decentralized AI reasoning.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-white/8 bg-white/3 p-6 hover:border-white/12 hover:bg-white/5 transition-all"
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl border ${f.bg} mb-4`}
              >
                <f.icon className={`h-5 w-5 ${f.color}`} />
              </div>
              <h3 className="font-semibold text-white mb-2 text-sm">{f.title}</h3>
              <p className="text-xs text-white/45 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How It Works ── */}
      <section
        id="how-it-works"
        className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-20"
      >
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white mb-3">How It Works</h2>
          <p className="text-white/40">
            From contract creation to payment release — fully on-chain.
          </p>
        </div>

        <div className="relative">
          {/* Connecting line */}
          <div className="absolute left-8 top-8 bottom-8 w-px bg-gradient-to-b from-bp-orange/40 to-transparent hidden md:block" />

          <div className="space-y-6">
            {FLOW_STEPS.map((step, idx) => (
              <div key={idx} className="flex items-start gap-5 group">
                <div className="relative flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl border border-bp-orange/25 bg-bp-orange/8 shadow-lg shadow-bp-orange/5 group-hover:border-bp-orange/40 transition-colors">
                  <step.icon className="h-6 w-6 text-bp-orange" />
                  <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-bp-orange text-[10px] font-bold text-white">
                    {idx + 1}
                  </span>
                </div>
                <div className="pt-2">
                  <h3 className="font-semibold text-white text-base">{step.label}</h3>
                  <p className="text-white/45 text-sm mt-1">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-20 text-center">
        <div className="rounded-3xl border border-bp-orange/15 bg-gradient-to-br from-bp-orange/8 to-bp-gold/5 p-12">
          <Building2 className="h-12 w-12 text-bp-orange mx-auto mb-4 animate-float" />
          <h2 className="text-3xl font-bold text-white mb-3">
            Ready to protect your contract?
          </h2>
          <p className="text-white/50 mb-8">
            Create your first construction escrow project in under 2 minutes.
          </p>
          <Button size="xl" onClick={handleGetStarted}>
            Get Started — Free
            <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-8 text-center text-xs text-white/25">
        <p>
          BuildProof · Powered by{" "}
          <a
            href="https://genlayer.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-bp-orange hover:underline"
          >
            GenLayer
          </a>{" "}
          · Deployed on StudioNet
        </p>
      </footer>
    </div>
  );
}
