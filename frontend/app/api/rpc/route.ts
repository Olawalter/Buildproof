import { NextRequest, NextResponse } from "next/server";

const RPC_URL =
  process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || "https://studio.genlayer.com/api";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const parsed = JSON.parse(body);
  const p0 = parsed.params?.[0] ?? {};
  console.log("[rpc-proxy] REQUEST:", JSON.stringify({ method: parsed.method, type: p0.type, to: p0.to, from: p0.from, variant: p0.transaction_hash_variant }));
  const upstream = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const text = await upstream.text();
  console.log("[rpc-proxy] RESPONSE:", text.slice(0, 300));
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
