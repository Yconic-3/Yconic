export interface VideoMetadata {
  durationSec: number;
  width: number;
  height: number;
}

/** 브라우저에서 영상 파일의 길이와 해상도를 읽는다. */
export function readVideoMetadata(file: Blob): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
    };
    video.onloadedmetadata = () => {
      const meta = { durationSec: Number.isFinite(video.duration) ? video.duration : 0, width: video.videoWidth, height: video.videoHeight };
      cleanup();
      resolve(meta);
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("영상 정보를 읽을 수 없습니다. 브라우저가 지원하는 형식(mp4, webm)인지 확인해 주세요."));
    };
    video.src = url;
  });
}

/** 초를 "m:ss" 또는 "h:mm:ss"로 */
export function formatTimecode(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(r).padStart(2, "0")}`;
}

/** "1:05" 또는 "65" 같은 입력을 초로. 잘못되면 null */
export function parseTimecode(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  const parts = t.split(":").map((p) => p.trim());
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0);
}

export function roundSec(sec: number): number {
  return Math.round(sec * 10) / 10;
}
