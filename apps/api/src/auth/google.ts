import { createPublicKey, verify, type JsonWebKey } from "node:crypto";
import { ApiError } from "../common/errors";

/**
 * 구글 로그인 확인 (docs/decisions/0016).
 * 화면의 구글 로그인 버튼이 돌려준 ID 토큰(JWT)을 받아, 구글이 서명한 것이 맞는지와 우리 앱에 준 것이 맞는지 확인한다.
 * 외부 라이브러리 없이 Node 기본 기능만 쓴다. 구글의 공개 키는 https로 받아 한 시간 동안 기억한다.
 */

export interface GoogleIdentity {
  /** 구글 계정의 고유 번호. 이메일이 바뀌어도 그대로다 */
  sub: string;
  /** 구글이 확인한 이메일 (소문자) */
  email: string;
  name: string;
}

/** ID 토큰을 확인해 누구인지 돌려준다. 확인하지 못하면 401(UNAUTHORIZED)을 던진다 */
export type GoogleVerifier = (credential: string) => Promise<GoogleIdentity>;

type GoogleKey = JsonWebKey & { kid?: string };

const GOOGLE_KEYS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["accounts.google.com", "https://accounts.google.com"];
const KEYS_TTL_MS = 60 * 60 * 1000;
/** 시계가 조금 어긋나도 받아 준다 */
const CLOCK_SKEW_MS = 60 * 1000;

async function fetchGoogleKeys(): Promise<GoogleKey[]> {
  const res = await fetch(GOOGLE_KEYS_URL, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`구글 공개 키를 받지 못했습니다 (${res.status})`);
  return ((await res.json()) as { keys: GoogleKey[] }).keys;
}

function rejected(): ApiError {
  return new ApiError("UNAUTHORIZED", "구글 로그인을 확인하지 못했습니다. 다시 시도해 주세요.");
}

function decodePart(part: string): Record<string, unknown> {
  const value: unknown = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  if (!value || typeof value !== "object") throw new Error("JWT 모양이 아님");
  return value as Record<string, unknown>;
}

export function createGoogleVerifier(
  clientId: string,
  opts: { fetchKeys?: () => Promise<GoogleKey[]>; now?: () => number } = {},
): GoogleVerifier {
  const fetchKeys = opts.fetchKeys ?? fetchGoogleKeys;
  const now = opts.now ?? Date.now;
  let cache: { keys: GoogleKey[]; at: number } | null = null;

  /** 토큰에 적힌 키 번호(kid)의 공개 키. 모르는 번호면 구글이 키를 바꾼 것일 수 있으니 한 번 다시 받는다 */
  async function keyFor(kid: string): Promise<GoogleKey | null> {
    if (!cache || now() - cache.at > KEYS_TTL_MS) cache = { keys: await fetchKeys(), at: now() };
    let key = cache.keys.find((k) => k.kid === kid);
    if (!key && now() - cache.at > 0) {
      cache = { keys: await fetchKeys(), at: now() };
      key = cache.keys.find((k) => k.kid === kid);
    }
    return key ?? null;
  }

  return async (credential) => {
    if (typeof credential !== "string" || credential.length > 8192) throw rejected();
    const parts = credential.split(".");
    if (parts.length !== 3) throw rejected();
    const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];

    let header: Record<string, unknown>;
    let payload: Record<string, unknown>;
    try {
      header = decodePart(headerPart);
      payload = decodePart(payloadPart);
    } catch {
      throw rejected();
    }
    // 서명 방식은 RS256만 받는다 (토큰이 방식을 고르게 두지 않는다)
    if (header.alg !== "RS256" || typeof header.kid !== "string") throw rejected();

    let key: GoogleKey | null;
    try {
      key = await keyFor(header.kid);
    } catch (e) {
      console.error("[api] 구글 공개 키를 받지 못했습니다:", e instanceof Error ? e.message : e);
      throw new ApiError("UNKNOWN", "구글에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
    }
    if (!key) throw rejected();

    let signed = false;
    try {
      signed = verify("RSA-SHA256", Buffer.from(`${headerPart}.${payloadPart}`), createPublicKey({ key, format: "jwk" }), Buffer.from(signaturePart, "base64url"));
    } catch {
      signed = false;
    }
    if (!signed) throw rejected();

    // 구글이 우리 앱에 준 토큰인지, 아직 유효한지, 이메일을 구글이 확인했는지
    if (typeof payload.iss !== "string" || !ISSUERS.includes(payload.iss)) throw rejected();
    if (payload.aud !== clientId) throw rejected();
    if (typeof payload.exp !== "number" || payload.exp * 1000 + CLOCK_SKEW_MS < now()) throw rejected();
    if (typeof payload.sub !== "string" || !payload.sub) throw rejected();
    if (typeof payload.email !== "string" || !payload.email || payload.email_verified !== true) throw rejected();

    const email = payload.email.trim().toLowerCase();
    const name = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim().slice(0, 40) : email.split("@")[0]!;
    return { sub: payload.sub, email, name };
  };
}
