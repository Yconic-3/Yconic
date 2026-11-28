# 클라우드 서버에 올리기

소리벗의 DB·API·AI 에이전트·웹앱이 뮤즈 클라우드 서버(이모션웨이브) 한 대에서 돈다.
사용자는 Vercel 주소(`https://soribeot-yconic.vercel.app`)로 들어오고, Vercel이 이 서버의 API와 AI 에이전트를 대신 연결한다.
결정 기록: `docs/decisions/0014-클라우드-서버와-Vercel-연결.md`

## 구성

```
사용자 ─ https://soribeot-yconic.vercel.app (Vercel, 화면)
              │  /api/*, /agent/* 를 대신 연결
              ▼
         https://k7m4q9vz.cloud.aimple.io (업체 프록시, https 자동)
              │  8080번 하나만 바깥에 열려 있다
              ▼
         웹앱 8080 ─ /api  → API 4000 ─ PostgreSQL 5433
                  └ /agent → AI 에이전트 4100
```

- 서버 사양: CPU 2개, 메모리 3.3GB, 저장 공간 49GB, Ubuntu 26.04. 그래픽카드는 없다.
- 바깥에 열리는 포트는 하나(8080)뿐이다. 그래서 서버에서도 웹앱을 켜고, 웹앱이 API와 에이전트를 대신 연결한다 (결정 0010과 같은 방식).
- 서버 주소(`https://k7m4q9vz.cloud.aimple.io`)로 직접 열어도 같은 화면이 나온다.
- 접속 방법(SSH 주소·포트·계정·키 파일)은 업체가 보낸 이용 안내서에 있다. **키 파일과 접속 정보는 저장소에 올리지 않는다.**

## 서버에 있는 것

| 무엇 | 어디 |
|---|---|
| 코드 | `~/yconic` (`main`을 https로 받은 것) |
| Node 24, pnpm | `~/.local/node` |
| DB 데이터 | `~/.yconic/pgdata-5433` |
| 올린 영상 | `~/yconic/apps/api/storage/videos` |
| 받아쓰기 도구(faster-whisper) | `~/yconic-venv` |
| 설정(API 키 포함) | `~/yconic/apps/api/.env`, `~/yconic/apps/user-agent/.env`, `~/yconic/apps/web/.env.production.local` |
| 관리자 비밀번호 | `~/yconic-admin-passwords.txt` (본인만 읽을 수 있다) |

서비스 네 개가 systemd에 등록되어 있다. 죽으면 5초 뒤 다시 켜지고, 서버가 재부팅되어도 켜진다.

| 서비스 | 하는 일 | 포트 |
|---|---|---|
| `yconic-db` | PostgreSQL. 켤 때마다 마이그레이션을 반영한다 | 5433 (서버 안에서만) |
| `yconic-api` | API. 영상 분석 작업기도 이 안에서 돈다 | 4000 |
| `yconic-agent` | 사용자 AI 에이전트 | 4100 |
| `yconic-web` | 웹앱 (`next start`) | 8080 (바깥에 공개) |

## 자주 쓰는 명령 (서버에 접속해서)

```bash
# 상태 보기
systemctl status yconic-db yconic-api yconic-agent yconic-web

# 로그 보기 (예: API)
journalctl -u yconic-api -n 50

# 다시 켜기
sudo systemctl restart yconic-api yconic-agent yconic-web
```

## 코드 업데이트

`main`에 병합하면 Vercel은 자동으로 다시 배포된다. **서버는 자동으로 바뀌지 않는다.** 서버에 접속해서 아래를 실행한다.

```bash
cd ~/yconic
git pull
pnpm install --frozen-lockfile
(cd apps/web && pnpm exec next build)
sudo systemctl restart yconic-db yconic-api yconic-agent yconic-web
```

- 테이블이 바뀐 경우에도 따로 할 일은 없다. `yconic-db`가 켜질 때 마이그레이션을 반영한다.
- API나 공통 타입이 바뀌었는데 서버를 업데이트하지 않으면, Vercel의 새 화면이 옛 API를 부르게 된다. API를 바꾼 PR을 병합한 뒤에는 서버도 바로 업데이트한다.

## 설정

### 서버의 `.env`

`.env.example`과 다른 값만 적는다.

- `apps/api/.env`
  - `WEB_ORIGIN`: Vercel 주소와 서버 주소 (쉼표로)
  - `ANTHROPIC_API_KEY`: 있으면 실제 영상 분석과 AI 맞춤 안내를 쓴다
  - `PYTHON`: `~/yconic-venv/bin/python`의 전체 경로
  - `AI_DAILY_LIMIT_ANALYSIS=5`, `AI_DAILY_LIMIT_GUIDES=100`
- `apps/user-agent/.env`
  - `WEB_ORIGIN`: 위와 같다
  - `ANTHROPIC_API_KEY`, `AI_DAILY_LIMIT=300`
- `apps/web/.env.production.local`
  - `NEXT_PUBLIC_API_BASE_URL=/api`, `NEXT_PUBLIC_AGENT_URL=/agent`, `NEXT_PUBLIC_SHARE_MODE=1`

### Vercel 환경 변수

| 이름 | 값 |
|---|---|
| `NEXT_PUBLIC_API_MODE` | 없음 (지운다) |
| `NEXT_PUBLIC_API_BASE_URL` | `/api` |
| `NEXT_PUBLIC_AGENT_URL` | `/agent` |
| `API_INTERNAL_URL` | `https://k7m4q9vz.cloud.aimple.io/api` |
| `AGENT_IN_WEB` | `0` |
| `AGENT_INTERNAL_URL` | `https://k7m4q9vz.cloud.aimple.io/agent` |
| `NEXT_PUBLIC_SHARE_MODE` | `1` |

`NEXT_PUBLIC_`으로 시작하는 값은 빌드할 때 들어간다. 바꾼 뒤에는 Vercel에서 다시 배포해야 한다.

## 관리자 계정

- 저장소가 공개라 예시 관리자 계정의 비밀번호도 공개되어 있다. API는 Cloudflare 임시 링크로 들어온 경우에만 관리자 로그인을 막는다 (결정 0010). 이 서버와 Vercel 주소는 그 대상이 아니다.
- 그래서 **서버 DB의 관리자 비밀번호 4개를 무작위 값으로 바꿨다.** 새 비밀번호는 서버의 `~/yconic-admin-passwords.txt`에만 있다.
- **서버에서 `pnpm db:seed`를 실행하면 안 된다.** 데이터가 모두 지워지고 관리자 비밀번호가 공개된 값으로 돌아간다. 실행했다면 바로 비밀번호를 다시 바꾼다.
- 화면의 체험 계정에는 일반 회원만 보인다 (`NEXT_PUBLIC_SHARE_MODE=1`). 관리자는 이메일과 새 비밀번호를 직접 입력한다.
- 체험 회원 계정의 비밀번호는 공개된 그대로다. 누구나 로그인해 영상을 올리고 검수를 요청할 수 있다. 공개는 승인권자만 한다.

## 알려진 제한

- **영상 올리기는 약 1MB까지만 된다.** 업체 프록시(nginx)가 그보다 큰 요청을 막는다 (413). 서버 주소로 직접 올려도, Vercel 주소로 올려도 마찬가지다. 업체에 올리기 크기 한도를 올려 달라고 요청해야 한다. 한도가 풀린 뒤에는 Vercel을 거치는 길도 다시 확인한다.
- 그래픽카드가 없어서 받아쓰기는 CPU로 돈다. 영상 길이만큼, 또는 그보다 오래 걸릴 수 있다.
- 서버가 꺼지면 Vercel 주소도 운동 목록을 불러오지 못한다.
- DB와 영상을 따로 백업하지 않는다. 서버 사용 기한이 끝나기 전에 옮겨야 한다.
- 영상은 서버 폴더에 저장한다. 설계 문서의 S3·BullMQ·TTS는 아직이다.

## 처음 설치한 순서 (다시 만들 때)

1. Node 24를 nodejs.org에서 받아 `~/.local/node`에 풀고, `corepack`으로 pnpm을 켠다.
2. `git clone https://github.com/Yconic-3/Yconic.git ~/yconic` 후 `pnpm install --frozen-lockfile`. 서버에서 밖으로는 HTTP/HTTPS만 나가므로 `git@…` 주소는 쓸 수 없다.
3. `sudo apt-get install ffmpeg python3-venv`, `python3 -m venv ~/yconic-venv`, `~/yconic-venv/bin/pip install faster-whisper`.
4. 위 '설정'대로 `.env` 세 개를 만든다. 키가 든 파일은 `chmod 600`으로 둔다.
5. `apps/web`에서 `pnpm exec next build`.
6. 서비스 네 개를 `/etc/systemd/system/`에 등록한다. 모두 `Restart=always`이고, 실행 명령은 아래와 같다.
   - `yconic-db`: `packages/database`에서 `pnpm exec tsx scripts/db-start.ts` (`KillSignal=SIGINT`)
   - `yconic-api`: `apps/api`에서 `pnpm exec tsx src/main.ts`
   - `yconic-agent`: `apps/user-agent`에서 `pnpm exec tsx src/main.ts`
   - `yconic-web`: `apps/web`에서 `pnpm exec next start -p 8080 -H 0.0.0.0`
7. DB가 처음 켜지면 예시 데이터가 들어간다. 바로 관리자 비밀번호를 바꾼다.
8. 업체에 쓸 포트 번호(8080)를 알린다.
