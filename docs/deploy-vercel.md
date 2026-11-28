# Vercel로 공개 URL 만들기

Vercel에 웹앱(`apps/web`)을 올리면 고정된 공개 주소가 생긴다. 지금 주소는 `https://soribeot-yconic.vercel.app`이다. GitHub와 연결해 두어서 `main`에 병합될 때마다 자동으로 다시 배포된다. 도메인은 무료다.

**지금은 클라우드 서버에 연결되어 있다** (2026-11-28부터, `docs/decisions/0014-클라우드-서버와-Vercel-연결.md`). Vercel은 화면을 보여 주고, 데이터와 AI는 서버가 맡는다. 서버 쪽 설명은 `docs/deploy-cloud.md`에 있다.

## 무엇이 어디서 도나

| 기능 | 어디서 |
|---|---|
| 화면 (운동하기, 콘텐츠 올리기, 설정, 관리자 화면) | Vercel |
| 운동 목록·운동 안내, 로그인·내 강의·내 동작 | 서버의 API와 DB. Vercel이 `/api`를 서버로 대신 연결한다 |
| AI 대화 (운동 중 말 걸기, 쉽게 설명) | 서버의 AI 에이전트. Vercel이 `/agent`를 서버로 대신 연결한다 |
| 영상 올리기·AI 영상 분석 | 서버. 단, 지금은 약 1MB보다 큰 파일을 올릴 수 없다 (`docs/deploy-cloud.md`의 '알려진 제한') |

## 환경 변수 (지금 값)

Vercel의 **Settings → Environment Variables**에 있다.

| 이름 | 값 | 설명 |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `/api` | 화면이 API를 부르는 주소 |
| `NEXT_PUBLIC_AGENT_URL` | `/agent` | 화면이 AI 에이전트를 부르는 주소 |
| `API_INTERNAL_URL` | `https://k7m4q9vz.cloud.aimple.io/api` | `/api`를 대신 연결할 곳 |
| `AGENT_INTERNAL_URL` | `https://k7m4q9vz.cloud.aimple.io/agent` | `/agent`를 대신 연결할 곳 |
| `AGENT_IN_WEB` | `0` | 웹앱 안 에이전트를 끈다 (서버의 에이전트를 쓴다) |
| `NEXT_PUBLIC_SHARE_MODE` | `1` | 체험 계정에 일반 회원만 보여 준다 |

- `NEXT_PUBLIC_API_MODE`는 두지 않는다 (없으면 `http`: API를 쓴다).
- 값을 바꾼 뒤에는 **Deployments → 맨 위 배포의 ⋯ → Redeploy**로 다시 배포해야 반영된다.
- `ANTHROPIC_API_KEY`, `AI_DAILY_LIMIT`, `AGENT_RATE_LIMIT`은 웹앱 안 에이전트를 켤 때만 쓴다. 남겨 두어도 된다.

## 처음 한 번 (직접 해 주세요)

Vercel 가입과 GitHub 연결은 계정 주인이 직접 해야 한다.

1. https://vercel.com 에 **GitHub 계정으로 가입**한다.
2. **Add New → Project**에서 `Yconic-3/Yconic` 저장소를 **Import**한다. GitHub 앱 권한을 물으면 이 저장소를 허용한다.
3. 설정 화면에서:
   - **Root Directory**: `apps/web`
   - **Framework Preset**: Next.js (자동으로 잡힌다)
   - 설치·빌드 명령은 `apps/web/vercel.json`에 있으므로 그대로 둔다.
4. **Environment Variables**에 위 표의 값을 넣는다.
5. **Deploy**를 누른다. 몇 분 뒤 `https://…vercel.app` 주소가 나온다.
6. 주소를 바꾸고 싶으면 **Settings → Domains**에서 비어 있는 이름으로 바꾼다 (무료). 바꾸면 서버의 `WEB_ORIGIN`도 새 주소로 고친다.

## 그다음부터

- `main`에 PR이 병합되면 Vercel이 알아서 다시 배포한다.
- **서버는 자동으로 바뀌지 않는다.** API나 공통 타입을 바꾼 PR을 병합했으면 서버도 업데이트한다 (`docs/deploy-cloud.md`의 '코드 업데이트').
- PR마다 미리보기 주소도 만들어 준다. PR 화면에 댓글로 나온다. 미리보기 주소는 서버의 `WEB_ORIGIN`에 없지만, 화면이 `/api`로 부르고 Vercel이 대신 연결하므로 그대로 동작한다.

## 서버 없이 예시 데이터로 돌리기

서버가 꺼졌거나 사용 기한이 끝났을 때, 화면만이라도 열어 두려면 환경 변수를 아래처럼 바꾸고 다시 배포한다.

| 이름 | 값 | 설명 |
|---|---|---|
| `NEXT_PUBLIC_API_MODE` | `mock` | 예시 데이터 모드 |
| `NEXT_PUBLIC_AGENT_URL` | `/agent` | AI 대화를 웹앱 안 서버 함수로 |
| `AGENT_IN_WEB` | `1` | 웹앱 안 에이전트 켜기 |
| `ANTHROPIC_API_KEY` | (발급받은 키) | **Sensitive**로 표시해서 넣는다. 깃허브에는 절대 올리지 않는다 |
| `AI_DAILY_LIMIT` | `300` | 하루 AI 대화 수 한도 (서버 함수 인스턴스마다 센다) |
| `AGENT_RATE_LIMIT` | `20` | 한 사람이 1분에 보낼 수 있는 대화 수 |

- 이 모드에서 데이터는 **보는 사람의 브라우저에만 저장**된다. 다른 사람과 공유되지 않는다.
- 실제 영상 올리기와 AI 영상 분석은 되지 않는다.
- AI 비용은 Anthropic 콘솔에서 확인한다. 많이 나오면 `AI_DAILY_LIMIT`을 줄이거나 `AGENT_IN_WEB`을 `0`으로 바꾼다. 끄면 AI 대신 규칙 기반으로 동작한다.
