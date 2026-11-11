# web — 사용자 화면 + 관리자 화면

하나의 Next.js 웹앱에 두 화면이 들어 있다 (결정 기록: `docs/decisions/0004-한-웹앱으로-합치기.md`).

| 주소 | 화면 | 코드 | 자세한 문서 |
| --- | --- | --- | --- |
| `/` | 사용자 화면 (말벗핏): 말로 운동을 찾고 구간별 음성 안내를 들으며 운동 | `src/user`, `src/app/(user)` | [docs/user.md](docs/user.md) |
| `/exercises/{id}` | 운동 화면: 그 운동의 영상, 단계 카드, 지금 안내 중 막대 | 위와 같음 (`src/app/(user)/(assistant)`) | [docs/user.md](docs/user.md) |
| `/login` | 로그인 (사용자·관리자 공통) | `src/app/(user)/login`, `src/lib/auth.ts` | 아래 "로그인" |
| `/admin` | 관리자 화면: 영상 업로드, AI 구간 분석, 검수·승인·공개 | `src/admin`, `src/app/admin` | [docs/admin.md](docs/admin.md) |

## 실행

웹앱은 기본으로 백엔드 API(`apps/api`)의 데이터를 쓴다. 데이터베이스와 API를 먼저 켠다 (`apps/api/README.md`).

```bash
pnpm install
```

```bash
pnpm db:start
```

아래는 다른 터미널에서 (처음 한 번만 `pnpm db:setup`):

```bash
pnpm db:setup
```

```bash
pnpm dev:api
```

```bash
pnpm dev:web
```

사용자 화면에서 자연스러운 말을 AI로 알아듣게 하려면 사용자 AI 에이전트도 켠다 (선택, `apps/user-agent/README.md`).
켜지 않거나 API 키가 없으면 정해진 말을 규칙으로 해석한다. 에이전트 주소는 `NEXT_PUBLIC_AGENT_URL` (기본 http://localhost:4100).

```bash
pnpm dev:agent
```

http://localhost:3000 이 사용자 화면, http://localhost:3000/admin 이 관리자 화면이다.

## 데이터 소스: API 또는 모의 데이터

`apps/web/.env.local`의 `NEXT_PUBLIC_API_MODE`로 고른다 (`.env.example` 참고).

| 값 | 데이터 | 언제 |
| --- | --- | --- |
| `http` (기본) | 백엔드 API와 PostgreSQL. 모든 브라우저가 같은 데이터를 본다 | 평소 개발 |
| `mock` | 브라우저 저장소(localStorage, IndexedDB)의 모의 백엔드 `src/mock` | 서버 없이 화면만 빨리 볼 때 |

어느 쪽이든 두 화면은 같은 데이터를 본다.

1. 관리자 화면에서 영상을 올리면 AI 초안이 만들어진다.
2. 다른 승인권자가 승인하고 "사용자에게 공개"를 누른다.
3. 사용자 화면을 새로 열면 그 운동이 목록에 나오고, 올린 영상 파일도 재생된다.

처음 상태는 공개 운동 4개와 관리자 흐름 시연용 3개(검수 중·초안·수정 요청)다.
처음 상태로 되돌리려면 http 모드는 `pnpm db:seed`, mock 모드는 관리자 화면 왼쪽 아래 "데이터 초기화".

## 로그인

- 처음 화면 오른쪽 위 **로그인**에서 계정으로 로그인한다. 로그인은 사용자 화면과 관리자 화면이 같은 것을 쓴다.
- 관리자 계정으로 로그인하면 처음 화면에 **관리자 페이지** 버튼이 생긴다. 처음 화면 맨 아래 **관리자 페이지로 가기**는 누구나 볼 수 있고, 로그인하지 않았으면 관리자 로그인으로 보낸다.
- 일반 회원으로 `/admin`에 가면 관리자 계정이 필요하다는 안내와 함께 로그인 화면으로 간다.
- http 모드에서는 API가 이메일·비밀번호를 확인하고 토큰을 준다. 토큰은 브라우저에 보관하고 관리자 API를 부를 때 붙인다 (`src/lib/auth.ts`).
- mock 모드에서는 서버 없이 모의 로그인을 쓴다 (`src/mock/auth.ts`).
- 로그인 화면의 "체험용 계정"을 누르면 바로 들어간다. DB 처음 데이터와 같은 계정이다.

| 계정 | 이메일 | 비밀번호 |
| --- | --- | --- |
| 체험 회원 (일반) | member@example.com | member1234 |
| 김편집 (편집자) | editor@example.com | editor1234 |
| 이승인 (승인권자) | approver@example.com | approver1234 |
| 박관리 (최고 관리자) | super@example.com | super1234 |
| 최조회 (조회자) | viewer@example.com | viewer1234 |

개발·시연용 값이다. 실제 서비스에서는 로그인 화면에 이 목록을 보여 주지 않는다.

## 구조

```
src/
├── app/
│   ├── layout.tsx        # 공통 껍데기 (html, body)
│   ├── globals.css       # 색 토큰, .user-root / .admin-root 영역별 스타일
│   ├── (user)/
│   │   ├── (assistant)/  # / 와 /exercises/[id]. 레이아웃에 비서 화면이 있어 주소가 바뀌어도 마이크·대화가 이어진다
│   │   └── login/        # 로그인 (사용자·관리자 공통)
│   └── admin/            # 관리자 화면 페이지 (/admin/...)
├── user/                 # 사용자 화면 코드 (화면, 말 해석, 재생, UserApi)
├── admin/                # 관리자 화면 코드 (편집기, 타임라인, AdminApi)
├── lib/                  # 두 화면이 함께 쓰는 로그인(auth.ts)과 데이터 소스 설정(api-mode.ts)
└── mock/                 # 두 화면이 함께 쓰는 모의 백엔드와 예시 데이터 (mock 모드)
```

- 사용자 화면과 관리자 화면은 서로의 화면 코드를 가져다 쓰지 않는다. 함께 쓰는 것은 `src/lib`, `src/mock`, `@yconic/shared-types`뿐이다.
- 사용자 화면은 공개 중인 콘텐츠만, 사용자에게 필요한 칸만 받는다 (`src/user/lib/api/user-api.ts`). 관리자 내부 메모·검수 의견은 넘어가지 않는다.
- 바탕색·글자 크기·초점 표시는 `.user-root`, `.admin-root` 안에서만 적용되어 서로 섞이지 않는다.

## 테스트

```bash
pnpm --filter @yconic/web test
```

## 주의

- 관리자 데이터는 API가 로그인·권한을 검사해서 막는다. `/admin` 화면 자체(빈 껍데기)는 아직 화면에서만 막는다.
