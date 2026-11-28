# Yconic — 시각장애인 AI 운동 지원 플랫폼

이 파일은 Claude Code가 이 저장소를 열 때 자동으로 읽는 프로젝트 안내서다.
팀원 누가 열어도 같은 기준으로 작업하도록 여기에 규칙을 모은다.

## 프로젝트 개요

- 시각장애인이 음성 중심으로 운동 콘텐츠를 찾고 수행할 수 있도록 돕는 플랫폼
- 설계 기준 문서: `ai-agent-architecture.md` (구조·역할·기술 스택·보안 원칙)
- 설계 문서와 충돌하는 구현을 하기 전에는 반드시 사용자에게 먼저 확인한다

## 현재 상태

- pnpm + Turborepo 모노레포. `apps/`, `packages/` 구조는 설계 문서 2장을 따른다
- **사용자 앱과 관리자 웹은 한 웹앱 `apps/web`이다.** 사용자 화면은 `/`(`src/user`), 관리자 화면은 `/admin`(`src/admin`), 둘이 함께 쓰는 모의 백엔드는 `src/mock` (`docs/decisions/0004-한-웹앱으로-합치기.md`). 두 영역은 서로의 화면 코드를 가져다 쓰지 않는다
- **사용자 화면은 디자인 시안 D 네온 그린(소리벗, 다크 고대비)이다** (`docs/decisions/0011-시안-D-네온-그린-화면-구성.md`). 머리말은 운동하기·콘텐츠 올리기 탭과 로그인·음성 안내·설정 아이콘, 다른 화면은 왼쪽 본문 + 오른쪽 말로 하기. 운동하기와 콘텐츠 올리기를 한 앱에서 오간다. 로그인한 회원은 누구나 영상을 올리고 검수를 요청할 수 있고, 공개는 승인권자만 한다. '내 강의'에 등록한 강의의 동작은 짧은 안내(`conciseGuide`)로 읽는다 (`docs/decisions/0007-시안-D-소리벗과-회원-콘텐츠-올리기.md`)
- **운동 콘텐츠의 본체는 영상이다.** 콘텐츠 = 영상 + 영상 타임라인 위의 구간별 음성 안내. 글 묶음이 아니다 (`docs/decisions/0002-영상-중심-콘텐츠-모델.md`)
- **일반 사용자와 시각장애인 사용자가 함께 이용한다.** 그래서 음성 안내가 없는 구간이 있어도 공개할 수 있다 (경고만 한다)
- **자기 승인 금지**: 콘텐츠를 만든 사람과 검수를 요청한 사람은 그 콘텐츠를 승인할 수 없다. 승인을 포함하는 "바로 공개"도 같다. **최고 관리자만 예외다** (혼자 운영해도 공개할 수 있게) (`docs/decisions/0003-자기-승인-금지.md`, `0023-쉬운-관리자-화면과-바로-공개.md`)
- 공통 데이터 모양·권한표·상태 전이·검사 규칙·분석 결과 형식은 `packages/shared-types`에 있다. 새 타입을 따로 만들지 말고 여기서 가져다 쓴다
- 작업 분담과 규칙은 `docs/decisions/0001-모노레포-구조와-작업-분담.md` 참고. 자기 담당 폴더 밖은 고치지 않는다
- **백엔드는 `apps/api`(NestJS, 포트 4000) + PostgreSQL 18(`packages/database`, Drizzle, 포트 5433)이다.** 웹앱은 기본으로 API를 쓰고, 서버 없이 볼 때는 `NEXT_PUBLIC_API_MODE=mock` (`docs/decisions/0005-데이터베이스와-API-구성.md`)
- **사용자 AI 에이전트는 `apps/user-agent`(포트 4100)이고 Claude는 `packages/ai-common`으로 부른다.** 에이전트는 DB를 만지지 않고 API의 공개 운동만 읽으며, 화면이 할 일만 돌려준다. API 키가 없으면 꺼지고 웹앱은 규칙 기반 해석을 쓴다 (`docs/decisions/0006-사용자-AI-에이전트.md`)
- **영상 분석은 실제 분석기(ffmpeg 장면 + faster-whisper 받아쓰기 + Claude)다.** API에 `ANTHROPIC_API_KEY`가 없거나 `VIDEO_ANALYZER=mock`이면 모의 분석기. 단계마다 동작(`movements`)을 붙이고, 회원마다 아는 동작(내 동작)에 따라 단계별로 짧게/자세하게 안내하며 AI가 사람마다 다시 쓴다 (`docs/decisions/0008-실제-영상-분석과-동작-단위-맞춤-안내.md`)
- **음성 안내를 켜면(시각장애인용) 강사가 말하는 부분은 영상 소리를 끄고 맞춤 안내가 대신 말한다. 영상과 앱의 소리는 겹치지 않는다. 끄면(일반 사용자) 원래 영상 그대로.** "소리벗"이라고 부르면 듣는다 (`docs/decisions/0009-강사-말-대신-맞춤-안내와-부르면-듣기.md`)
- **운동 중에는 호출어 없이 듣고 말을 끝까지 기다린다(끼어들기·메아리 거르기). 단계가 끝나거나 말로 화면을 바꿀 때는 묻고 기다리며, 운동이 끝나면 다음 운동을 권한다.** 다시 듣거나 "어려워요"라고 한 동작은 더 쉽게 안내한다 (`docs/decisions/0012-운동-중-대화와-묻고-기다리기.md`)
- **말 주고받기**: 조작 명령은 AI를 한 번만 부른다(화면 도구의 `say`가 답). 말 끝을 기다리는 시간은 들은 말에 따라 다르다: 더 이을 말이 없는 짧은 말만 0.7초, 덜 끝난 말은 2초, 나머지는 1.3초 그대로. 답이 1초 넘게 늦으면 "잠시만요."처럼 짧게 맞장구친다. 빨리 답하려고 말을 끊지 않는다 (`docs/decisions/0019-음성-대화-속도와-말-주고받기.md`)
- **답을 받는 대로 읽는다**: 에이전트가 `POST /chat/stream`으로 답을 글자가 나오는 대로 보내고, 화면은 읽을 만큼 모인 곳부터 읽는다(첫 조각은 쉼표에서도, 그 뒤는 문장 단위). 할 일이 있는 답은 끝까지 받은 뒤 예전 순서대로 한다. AI가 정보 도구를 부른 뒤에는 글자가 끝에 한꺼번에 오므로, 자주 묻는 것은 도구 없이 답하게 대화에 운동 정보(목록의 요약, 지금 운동의 주의사항·단계)를 싣는다 (`docs/decisions/0020-답을-받는-대로-읽기.md`)
- **서버 목소리**: API에 `GOOGLE_TTS_API_KEY`가 있으면 서버가 문장마다 음성 파일을 만들어 주고(`POST /tts`) 화면이 그 파일을 재생한다. 없거나 2.5초 안에 못 주면 기기의 목소리로 읽는다. API가 공개하는 폴더는 `/media/videos/`와 `/media/tts/`뿐이다 (`docs/decisions/0021-서버-목소리.md`)
- **사용법 안내는 처음 온 사람에게 한 번만 뜬다.** 창의 아무 곳이나 누르면 읽고, 다 읽으면 닫힌다. 그 뒤로는 "사용법 알려줘"·머리말의 물음표 버튼·설정에서만 연다. 운동 화면을 처음 열 때는 한 줄 안내를 한 번 덧붙인다 (`docs/decisions/0013-처음-한-번-사용법-안내.md`)
- **로그인은 구글 계정 또는 이메일 가입이다.** 구글 로그인은 API의 `GOOGLE_CLIENT_ID`가 있을 때만 켜진다. `SUPER_ADMIN_EMAILS`의 구글 계정은 최고 관리자가 되고, 그 이메일은 이메일 가입을 받지 않는다. 체험 계정은 내 컴퓨터에서만 보인다 (`docs/decisions/0016-회원가입과-구글-로그인.md`)
- **로그인 유지**: 로그인 화면의 체크 상자(처음 값 켬). 켜면 쓰는 동안 로그인이 풀리지 않고(30일씩 늘어남), 끄면 브라우저를 닫을 때 풀린다. 화면은 들어올 때마다 `GET /auth/session`으로 확인한다 (`docs/decisions/0017-로그인-유지.md`)
- **관리자 화면도 소리벗 색·글꼴이다.** 관리자 화면의 Tailwind 색 이름(slate, blue…)은 `globals.css`의 `.admin-root`에서 소리벗 색으로 바뀐다: `bg-blue-600`이 네온 그린, `text-white`가 밝은 버튼 위의 어두운 글자다 (`docs/decisions/0018-관리자-화면도-소리벗-디자인.md`)
- **관리자 화면은 쉽게**: 메뉴는 콘텐츠·기록 둘. 상태는 공개·비공개·공개 요청·보관으로 묶어 보여 주고, 목록과 편집 화면의 큰 단추 하나(공개하기 / 비공개로 / 공개 요청)로 바꾼다. 편집 화면의 구간은 한 줄씩 보이고 누른 것만 펼쳐진다. 어떤 단추를 보여 줄지는 `apps/web/src/admin/lib/content-plan.ts`가 정한다. 새 칸이나 단추를 더할 때는 먼저 "더보기"나 "자세한 설정" 안에 넣을 수 있는지 본다 (`docs/decisions/0023-쉬운-관리자-화면과-바로-공개.md`)
- **영상은 작은 조각으로 나눠 올린다** (`…/uploads`). 서버 앞 프록시가 1MiB보다 큰 요청을 막기 때문이다. 화면은 늘 이 길을 쓴다. 조각은 4개씩 동시에, 서버가 알려 준 주소(`uploadUrl`)로 직접 보내고(Vercel의 전송량 한도를 쓰지 않게), 끊기면 같은 파일을 다시 올릴 때 빠진 조각만 보낸다 (`docs/decisions/0015-영상-나눠-올리기.md`, `0022-큰-영상-빠르게-올리기.md`)
- 테이블 설명은 `docs/database.md`. 테이블을 바꾸면 `packages/database/src/schema.ts` 수정 → `pnpm db:generate`로 마이그레이션 생성 → `pnpm db:migrate`
- 제작 작업기와 영상 저장은 아직 임시다 (API 서버 안 모듈, 서버 폴더 저장). 음성은 서버 목소리(0021)로 그때그때 만들며, 콘텐츠를 공개할 때 미리 만들어 두는 것은 아직이다. 설계 문서의 BullMQ·S3로 바꿀 예정

## 자주 쓰는 명령

- 설치: `pnpm install`
- 전체 테스트: `pnpm test` / 타입 검사: `pnpm typecheck`
- **전부 한 번에 켜기: `pnpm dev`** (DB·API·AI 에이전트·웹앱). Windows에서는 저장소 맨 위의 `실행하기.cmd`를 더블클릭해도 된다. DB를 켤 때 마이그레이션은 자동으로 반영되고, 처음 만든 DB에는 예시 데이터가 들어간다
- **다른 사람에게 보여 주기: `pnpm share`** (또는 `공유하기.cmd`). `pnpm dev`를 켜 둔 채로 실행하면 임시 https 공개 링크를 알려 준다. 공개 링크에서는 관리자 로그인이 막히고(시연용으로 열려면 `PUBLIC_LINK_ADMIN_LOGIN=allow` + `pnpm share:admin`) AI는 하루 한도 안에서만 쓴다 (`docs/decisions/0010-임시-공개-링크.md`)
- **고정 공개 URL(Vercel) + 클라우드 서버**: 사용자는 Vercel 주소로 들어오고, Vercel이 `/api`·`/agent`를 클라우드 서버(DB·API·AI 에이전트)로 대신 연결한다. `main`에 병합하면 Vercel만 자동으로 배포되고, **서버는 접속해서 직접 업데이트한다**. 서버에서 `pnpm db:seed`는 실행하지 않는다 (데이터가 지워지고 관리자 비밀번호가 공개된 값으로 돌아간다). 설정 방법은 `docs/deploy-vercel.md`, `docs/deploy-cloud.md` (`docs/decisions/0014-클라우드-서버와-Vercel-연결.md`)
- PowerShell이 `pnpm`을 보안 오류로 막으면 `pnpm.cmd dev`처럼 `.cmd`를 붙여 실행한다
- 데이터베이스: `pnpm db:start`(켜기, 창을 열어 둔다) → 처음 한 번 `pnpm db:setup`(테이블+예시 데이터). 예시 데이터로 되돌리기 `pnpm db:seed`
- API 실행: `pnpm dev:api` → http://localhost:4000/health
- 사용자 AI 에이전트 실행: `pnpm dev:agent` → http://localhost:4100/health (AI를 켜려면 `apps/user-agent/.env`에 `ANTHROPIC_API_KEY`)
- 웹앱 실행: `pnpm dev:web` → 사용자 화면 http://localhost:3000 , 관리자 화면 http://localhost:3000/admin
- PR을 올리면 GitHub 자동 검사(`.github/workflows/ci.yml`)가 타입 검사·테스트·빌드를 돌린다. 푸시 전에 `pnpm typecheck && pnpm test && pnpm build`로 먼저 확인한다

## 작업 규칙

- 대화와 문서, 커밋 메시지는 한국어로 작성한다
- 모든 텍스트 파일은 UTF-8, 줄바꿈은 LF로 저장한다 (`.gitattributes`, `.editorconfig`가 강제한다)
- 커밋 메시지: `타입: 내용` 형식 (예: `feat: 운동 검색 API 추가`, `docs: 설계 문서 수정`)
  - 타입: feat, fix, docs, chore, refactor, test, style
- main 브랜치에 직접 푸시하지 않고 작업 브랜치 → PR → 리뷰 후 병합한다
  - 브랜치 이름: `feat/기능명`, `fix/버그명`, `docs/문서명`
- 민감한 값(API 키 등)은 `.env`에만 두고 커밋하지 않는다 (`.env.example`에 키 이름만 기록)

## 팀 소통

- 작업 요청·질문·결정 사항은 GitHub Issues에 남긴다 (VS Code의 GitHub Pull Requests 확장에서 바로 작성 가능)
- 가벼운 공지나 메모는 `docs/TEAM_BOARD.md`에 날짜·이름과 함께 추가한다
- 큰 설계 결정은 `docs/decisions/`에 번호를 붙여 기록한다
- 자세한 절차는 `docs/CONTRIBUTING.md` 참고

## Claude Code 사용 시

- 작업 시작 전 `git pull`로 최신 상태를 받는다
- 다른 사람이 수정 중인 파일을 함께 고칠 때는 Issue나 TEAM_BOARD에서 먼저 조율한다
- 개인 전용 설정은 `.claude/settings.local.json`에 두고 커밋하지 않는다 (`.gitignore`에 포함)
- 팀 공유 권한 설정의 예시는 `docs/claude-settings.example.json`에 있다. `.claude/settings.json`으로 복사하면 적용된다
