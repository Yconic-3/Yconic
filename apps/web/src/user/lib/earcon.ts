/**
 * 짧은 알림음. 부르면 듣기에서 "들을게요"(높은 두 음)와 "그만 들을게요"(낮은 음)를 소리로 알린다.
 * 말로 알리면 그 말을 음성 인식이 다시 받아 적을 수 있어서 알림음을 쓴다.
 */
let ctx: AudioContext | null = null;

export function playEarcon(kind: "listen" | "cancel") {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    const notes = kind === "listen" ? [660, 880] : [440];
    notes.forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      const start = ctx!.currentTime + i * 0.12;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.11);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(start);
      osc.stop(start + 0.12);
    });
  } catch {
    // 소리를 못 내도 화면 글로 알린다
  }
}
