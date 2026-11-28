import type { TtsConfig, TtsResponse } from "@yconic/shared-types";

/**
 * 서버 목소리 (docs/decisions/0021): 서버가 글을 음성 파일로 만들어 주면, 기기의 목소리 대신 그 파일을 재생한다.
 * 기기마다 목소리가 다르고 품질이 들쭉날쭉한 것을 없앤다.
 * 서버가 못 만들면(꺼짐, 한도, 오류, 늦음) null을 돌려주고, 읽는 쪽(speech.ts)이 기기의 목소리로 읽는다.
 */

/** 글 하나의 음성 파일 주소를 준다. 못 만들면 null */
export type VoiceFetcher = (text: string) => Promise<string | null>;

export interface ServerVoice {
  /** 서버 목소리를 쓸 수 있는지 (서버에 한 번 묻고 기억한다) */
  available(): Promise<boolean>;
  urlFor: VoiceFetcher;
}

const CONFIG_TIMEOUT_MS = 4000;
const REQUEST_TIMEOUT_MS = 6000;
/** 이만큼 잇달아 실패하면 한동안 서버에 묻지 않는다 (말할 때마다 기다리게 하지 않으려고) */
const FAILURES_BEFORE_PAUSE = 3;
const PAUSE_MS = 60_000;
/** 기억해 두는 주소 수 */
const MEMORY_LIMIT = 300;

export function createServerVoice(baseUrl: string, fetchFn: typeof fetch = (...args) => fetch(...args), now = () => Date.now()): ServerVoice {
  let config: Promise<TtsConfig | null> | null = null;
  let maxChars = 300;
  const known = new Map<string, Promise<string | null>>();
  let failures = 0;
  let pausedUntil = 0;

  function loadConfig(): Promise<TtsConfig | null> {
    config ??= fetchFn(`${baseUrl}/tts/config`, { signal: AbortSignal.timeout(CONFIG_TIMEOUT_MS) })
      .then(async (res) => (res.ok ? ((await res.json()) as TtsConfig) : null))
      .catch(() => null)
      .then((c) => {
        if (c) maxChars = c.maxChars;
        // 묻지 못했으면 다음에 다시 묻는다
        else config = null;
        return c;
      });
    return config;
  }

  async function request(text: string): Promise<string | null> {
    try {
      const res = await fetchFn(`${baseUrl}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(String(res.status));
      failures = 0;
      return ((await res.json()) as TtsResponse).url;
    } catch {
      if (++failures >= FAILURES_BEFORE_PAUSE) {
        failures = 0;
        pausedUntil = now() + PAUSE_MS;
      }
      return null;
    }
  }

  return {
    async available() {
      return (await loadConfig())?.enabled === true;
    },
    urlFor(raw) {
      const text = raw.replace(/\s+/g, " ").trim();
      if (!text || text.length > maxChars || now() < pausedUntil) return Promise.resolve(null);
      const hit = known.get(text);
      if (hit) return hit;
      const pending = request(text).then((url) => {
        // 실패한 것은 기억하지 않는다 (다음에 다시 묻는다)
        if (!url) known.delete(text);
        return url;
      });
      known.set(text, pending);
      if (known.size > MEMORY_LIMIT) known.delete(known.keys().next().value as string);
      return pending;
    },
  };
}

const voices = new Map<string, ServerVoice>();
/** 이 API 주소의 서버 목소리. 한 번 만든 것을 계속 쓴다 (화면이 다시 그려져도 서버에 다시 묻지 않는다) */
export function getServerVoice(baseUrl: string): ServerVoice {
  let voice = voices.get(baseUrl);
  if (!voice) {
    voice = createServerVoice(baseUrl);
    voices.set(baseUrl, voice);
  }
  return voice;
}
