/**
 * 브라우저 내장 음성 합성으로 안내문을 미리 듣는다.
 * 실제 서비스의 음성 파일은 content-worker가 TTS 서비스로 만들고, 여기서는 검수 중 확인 용도로만 쓴다.
 */
export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function pickKoreanVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang.toLowerCase().startsWith("ko")) ?? null;
}

export function stopSpeaking() {
  if (speechSupported()) window.speechSynthesis.cancel();
}

/** 이전 발화를 끊고 새로 읽는다. 끝나거나 끊기면 resolve */
export function speak(text: string, opts: { rate?: number } = {}): Promise<void> {
  if (!speechSupported() || !text.trim()) return Promise.resolve();
  window.speechSynthesis.cancel();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ko-KR";
    u.rate = opts.rate ?? 1;
    const voice = pickKoreanVoice();
    if (voice) u.voice = voice;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}
