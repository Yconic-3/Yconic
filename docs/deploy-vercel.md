# Vercel로 공개 URL 만들기

Vercel에 웹앱(`apps/web`)을 올리면 고정된 공개 주소(예: `https://soribeot.vercel.app`)가 생긴다. GitHub와 연결해 두면 `main`에 병합될 때마다 자동으로 다시 배포된다. 도메인은 무료다.

## 무엇이 올라가나

| 기능 | Vercel에서 |
|---|---|
| 화면 (운동하기, 콘텐츠 올리기, 설정 등) | 됨 |
| 운동 목록·운동 안내 | 됨. 예시 운동 데이터를 쓴다 |
| AI 대화 (운동 중 말 걸기, 쉽게 설명) | 됨. 웹앱 안의 서버 함수(`/agent/chat`)가 맡는다 |
| 로그인·내 강의·내 동작 | 됨. 보는 사람의 브라우저에만 저장된다 |
| 실제 영상 올리기·AI 영상 분석 | 안 됨. 서버(API·DB)를 받은 뒤 연결한다 |

- 이 모드에서 데이터는 **보는 사람의 브라우저에 저장**된다(예시 데이터 모드). 다른 사람과 공유되지 않는다.
- 브라우저 저장소를 지우거나 예시 데이터가 바뀌어 다시 배포되면 처음 상태로 돌아간다.
- 서버를 받으면 API와 DB만 따로 띄우고 웹앱이 그쪽을 보게 바꾼다. 바꾸는 방법은 아래 '서버를 받은 뒤'에 있다.

## 처음 한 번 (직접 해 주세요)

Vercel 가입과 GitHub 연결은 계정 주인이 직접 해야 한다.

1. https://vercel.com 에 **GitHub 계정으로 가입**한다.
2. **Add New → Project**에서 `Yconic-3/Yconic` 저장소를 **Import**한다. GitHub 앱 권한을 물으면 이 저장소를 허용한다.
3. 설정 화면에서:
   - **Root Directory**: `apps/web`
   - **Framework Preset**: Next.js (자동으로 잡힌다)
   - 설치·빌드 명령은 `apps/web/vercel.json`에 있으므로 그대로 둔다.
4. **Environment Variables**에 아래를 넣는다.

   | 이름 | 값 | 설명 |
   |---|---|---|
   | `NEXT_PUBLIC_API_MODE` | `mock` | 예시 데이터 모드 (서버 없이) |
   | `NEXT_PUBLIC_AGENT_URL` | `/agent` | AI 대화를 웹앱 안 서버 함수로 |
   | `AGENT_IN_WEB` | `1` | 웹앱 안 에이전트 켜기 |
   | `ANTHROPIC_API_KEY` | (발급받은 키) | **Sensitive**로 표시해서 넣는다. 깃허브에는 절대 올리지 않는다 |
   | `AI_DAILY_LIMIT` | `300` | 하루 AI 대화 수 한도 (서버 함수 인스턴스마다 센다) |
   | `AGENT_RATE_LIMIT` | `20` | 한 사람이 1분에 보낼 수 있는 대화 수 |

5. **Deploy**를 누른다. 몇 분 뒤 `https://…vercel.app` 주소가 나온다.
6. 주소를 바꾸고 싶으면 **Settings → Domains**에서 `soribeot.vercel.app`처럼 비어 있는 이름으로 바꾼다 (무료).

## 그다음부터

- `main`에 PR이 병합되면 Vercel이 알아서 다시 배포한다.
- PR마다 미리보기 주소도 만들어 준다. PR 화면에 댓글로 나온다.
- AI 비용은 Anthropic 콘솔에서 확인한다. 많이 나오면 `AI_DAILY_LIMIT`을 줄이거나 `AGENT_IN_WEB`을 `0`으로 바꾼다. 끄면 AI 대신 규칙 기반으로 동작한다.

## 서버를 받은 뒤 (API·DB 연결)

1. 서버에서 `pnpm dev` 대신 API(`apps/api`), 에이전트(`apps/user-agent`), DB(PostgreSQL)를 띄운다. https 주소가 필요하다.
2. Vercel 환경 변수를 바꾼다.
   - `NEXT_PUBLIC_API_MODE` → 지운다 (기본 `http`)
   - `NEXT_PUBLIC_API_BASE_URL` → `/api`
   - `API_INTERNAL_URL` → 서버의 API 주소 (예: `https://api.example.com`)
   - `AGENT_IN_WEB` → `0`
   - `AGENT_INTERNAL_URL` → 서버의 에이전트 주소
3. API 서버의 `WEB_ORIGIN`에 Vercel 주소를 넣는다.
4. 다시 배포한다.
   - 웹앱이 `/api`, `/agent`를 서버로 대신 연결한다 (`apps/web/next.config.ts`).
   - 그 뒤로 데이터는 서버 DB에 남는다.
