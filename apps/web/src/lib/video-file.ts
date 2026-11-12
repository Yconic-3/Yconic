/**
 * 영상 파일 정보 읽기. 관리자 화면과 사용자 화면(콘텐츠 올리기)이 함께 쓴다.
 */
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
