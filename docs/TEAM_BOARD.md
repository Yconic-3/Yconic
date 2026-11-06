# 팀 게시판

가벼운 공지, 메모, 진행 상황을 남기는 곳이다. **맨 위에** 새 글을 추가하고 커밋한다.
작업 요청이나 질문처럼 답이 필요한 것은 GitHub Issues를 사용한다.

형식:

```
## YYYY-MM-DD · 이름
내용
```

---

## 2026-11-06 · Yconic (관리자 웹 1차 — 영상 중심으로 재작성)

- **콘텐츠의 본체는 영상이다.** 관리자가 영상을 올리면 → 분석해서 타임라인 위에 구간을 나누고 → 구간마다 음성 안내를 붙인다. 사용자 앱은 영상을 재생하며 구간 시작 시각에 안내를 들려준다. 결정 기록: `docs/decisions/0002-영상-중심-콘텐츠-모델.md`
- 관리자 웹(`apps/admin-web`)은 `feat/admin-web` 브랜치에 있다. `pnpm dev:admin`으로 실행하면 백엔드 없이 돌아간다. 실제 영상을 올려 보면 플레이어·타임라인·구간 편집·음성 미리 듣기까지 볼 수 있다.
- **백엔드 담당자**: 엔드포인트 목록은 `packages/shared-types/src/admin-api.ts` 주석. 영상 업로드와 재생 주소 조회가 추가됐다.
- **워커 담당자**: 분석 결과 형식은 `packages/shared-types/src/analysis.ts`. 이 모양으로 돌려주면 관리자 웹이 그대로 초안으로 보여 준다.
- **사용자 앱 담당자**: 콘텐츠 모양은 `packages/shared-types/src/exercise.ts`. `segments[].startSec`에 맞춰 `tts.audioUrl`을 재생하면 된다.
- 자세한 내용은 `apps/admin-web/README.md`.

## 2026-11-06 · Yconic

- 모노레포 기본 구조와 공통 타입(`packages/shared-types`)을 올렸다.
- 작업 분담표는 `docs/decisions/0001-모노레포-구조와-작업-분담.md`에 있다. 맡을 영역을 정하면 표의 "미정"을 자기 이름으로 바꿔서 PR로 올려 주세요.
- 나는 관리자 웹(`apps/admin-web`)부터 개발한다.
- 콘텐츠·운동 단계·권한 같은 데이터 모양은 shared-types에서 가져다 쓰고, 바꿀 때는 `[공통 타입]` PR로 알려 주세요.

## 2026-11-03 · Yconic

- 저장소 협업 환경을 설정했다. (`CLAUDE.md`, `.vscode/`, `docs/CONTRIBUTING.md`)
- 처음 참여하는 사람은 `docs/CONTRIBUTING.md`의 "시작하기"를 따라 하면 된다.
- 설계 기준 문서는 `ai-agent-architecture.md`다. 개발 시작 전 한 번 읽어 두자.
