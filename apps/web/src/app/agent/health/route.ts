import { agentInWebEnabled, agentModel } from "@/server/agent-in-web";

/** 웹앱 안 에이전트가 켜져 있는지 (Vercel 배포용, docs/decisions/0012) */
export const dynamic = "force-dynamic";

export function GET() {
  if (!agentInWebEnabled()) return Response.json({ ok: false, ai: false }, { status: 404 });
  return Response.json({ ok: true, ai: agentModel() !== null });
}
