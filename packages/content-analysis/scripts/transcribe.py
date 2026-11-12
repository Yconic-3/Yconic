"""
영상 속 말(내레이션)을 받아 적는다 (faster-whisper, 이 컴퓨터에서 무료로 돈다).
  python transcribe.py <영상 파일> [모델 이름: small]
결과는 표준 출력에 JSON 한 줄: {"language": "ko", "duration": 336.9, "segments": [{"start": 0.0, "end": 3.2, "text": "..."}]}
처음 실행할 때 모델을 내려받는다 (small 약 460MB, 사용자 폴더의 캐시에 남는다).

소리는 ffmpeg로 16kHz 한 채널 숫자 배열로 뽑아 넘긴다.
faster-whisper가 쓰는 영상 해독 라이브러리(av)의 버전에 따라 파일을 직접 못 여는 경우가 있어서다.
ffmpeg 위치는 FFMPEG 환경 변수로 바꿀 수 있다 (기본: ffmpeg).
"""
import json
import os
import subprocess
import sys

import numpy as np
from faster_whisper import WhisperModel

SAMPLE_RATE = 16000


def load_audio(path: str) -> np.ndarray:
    ffmpeg = os.environ.get("FFMPEG", "ffmpeg")
    cmd = [ffmpeg, "-nostdin", "-loglevel", "error", "-i", path, "-vn", "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "f32le", "-"]
    out = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(out, dtype=np.float32).copy()


# 낱말 사이가 이만큼(초) 비면 말이 끊긴 것으로 보고 줄을 나눈다.
# Whisper는 말 사이의 음악까지 한 줄로 묶기도 해서, 낱말 시각으로 실제로 말한 구간만 남긴다.
PAUSE_SEC = 0.8


def split_by_pause(seg) -> list:
    words = [w for w in (seg.words or []) if w.word.strip()]
    if not words:
        text = seg.text.strip()
        return [{"start": round(seg.start, 1), "end": round(seg.end, 1), "text": text}] if text else []
    lines, chunk = [], [words[0]]
    for w in words[1:]:
        if w.start - chunk[-1].end > PAUSE_SEC:
            lines.append(chunk)
            chunk = [w]
        else:
            chunk.append(w)
    lines.append(chunk)
    return [
        {"start": round(c[0].start, 1), "end": round(c[-1].end, 1), "text": "".join(w.word for w in c).strip()}
        for c in lines
    ]


def main() -> None:
    if len(sys.argv) < 2:
        print("사용법: python transcribe.py <영상 파일> [모델 이름]", file=sys.stderr)
        sys.exit(2)
    path = sys.argv[1]
    model_name = sys.argv[2] if len(sys.argv) > 2 else "small"
    audio = load_audio(path)
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments, info = model.transcribe(audio, language="ko", vad_filter=True, beam_size=5, word_timestamps=True)
    out = []
    for seg in segments:
        out.extend(split_by_pause(seg))
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps({"language": info.language, "duration": round(len(audio) / SAMPLE_RATE, 1), "segments": out}, ensure_ascii=False))


if __name__ == "__main__":
    main()
