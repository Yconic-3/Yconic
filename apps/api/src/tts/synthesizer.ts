/**
 * 글을 음성 파일(MP3)로 만든다 (docs/decisions/0021).
 * 기기마다 다른 브라우저 목소리 대신, 서버가 만든 같은 목소리로 읽기 위해서다.
 */
export type SpeechSynthesizer = (text: string) => Promise<Buffer>;

const GOOGLE_TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize";
const TIMEOUT_MS = 8000;

/**
 * Google Cloud Text-to-Speech.
 * - 키는 주소가 아니라 머리말(x-goog-api-key)로 보낸다 (주소에 넣으면 기록에 남는다).
 * - 말 속도는 여기서 정하지 않는다. 화면이 재생 속도로 맞춘다 (속도마다 파일을 따로 만들지 않으려고.
 *   Chirp 3: HD 음성이 speakingRate를 받는지도 문서마다 다르다).
 * - voice: 음성 이름 (예: ko-KR-Chirp3-HD-Kore, ko-KR-Neural2-A). 앞의 두 마디가 언어 코드다.
 */
export function createGoogleSynthesizer(opts: { apiKey: string; voice: string; fetchFn?: typeof fetch }): SpeechSynthesizer {
  const fetchFn = opts.fetchFn ?? fetch;
  const languageCode = opts.voice.split("-").slice(0, 2).join("-");
  return async (text) => {
    const res = await fetchFn(GOOGLE_TTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": opts.apiKey },
      body: JSON.stringify({ input: { text }, voice: { languageCode, name: opts.voice }, audioConfig: { audioEncoding: "MP3" } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      // 응답 본문에 키가 들어 있지는 않지만, 길게 남기지 않는다
      const detail = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
      throw new Error(`Google TTS ${res.status}: ${detail}`);
    }
    const body = (await res.json()) as { audioContent?: string };
    if (!body.audioContent) throw new Error("Google TTS: 음성이 비어 있습니다");
    return Buffer.from(body.audioContent, "base64");
  };
}
