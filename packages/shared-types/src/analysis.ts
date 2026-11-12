import type { SegmentKind } from "./exercise";

/**
 * 영상에서 화면으로만 전달되고 음성(내레이션·안내)에는 없던 정보.
 * 예: 동작 방향, 신체 위치, 읽히지 않은 화면 자막, 화면 타이머로만 나온 횟수.
 * 콘텐츠를 올린 사람이 음성 안내에 이 내용을 넣었는지 확인할 때 쓴다.
 */
export interface AccessibilityFinding {
  /** 예: "동작 방향", "신체 위치", "화면 자막", "속도·횟수" */
  kind: string;
  text: string;
}

/**
 * 영상 분석기가 돌려주는 결과. content-worker가 어떤 분석 기술을 쓰든 이 모양으로 돌려준다.
 * 관리자 웹은 이 결과를 콘텐츠 초안의 segments로 바꿔 보여 주고, 관리자가 고친다.
 */
export interface DetectedSegment {
  kind: SegmentKind;
  startSec: number;
  endSec: number;
  title: string;
  /** 영상에 보이는 동작 설명 */
  instruction: string;
  /** 시각장애인용 음성 안내문 초안 */
  voiceGuide: string;
  /** 동작을 배운 사람에게 읽어 줄 짧은 안내 초안 */
  conciseGuide: string;
  repetitions: number | null;
  /** 분석기의 확신도 0~1. 낮으면 관리자가 더 꼼꼼히 봐야 한다. */
  confidence: number;
}

export interface VideoAnalysisResult {
  provider: string;
  model: string | null;
  summary: string;
  suggestedTags: string[];
  suggestedPrecautions: string[];
  segments: DetectedSegment[];
  /** 분석기가 관리자에게 알리고 싶은 점 (예: 화면이 어두움, 전신이 안 보임) */
  warnings: string[];
  /** 화면에서만 전달되던 정보 */
  findings: AccessibilityFinding[];
}

export interface VideoAnalysisInput {
  videoId: string;
  durationSec: number;
  /** 관리자가 적은 운동 이름·분류·요청 사항. 분석기가 참고한다. */
  title: string;
  category: string;
  difficulty: string;
  requestNote: string;
}
