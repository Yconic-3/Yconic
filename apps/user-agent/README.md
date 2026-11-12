# user-agent — 사용자 AI 에이전트

사용자 화면(`apps/web`의 `/`)에서 한 말을 Claude로 알아듣고, 답할 말과 화면이 할 일을 돌려준다. 포트 4100.
결정 기록: `docs/decisions/0006-사용자-AI-에이전트.md`

```
화면 ──말·앞선 대화·지금 화면──▶ user-agent ──공개 운동 읽기──▶ api (GET /exercises)
     ◀──답할 말 + 할 일────────           └──────▶ Claude (packages/ai-common)
```

## 실행

API 서버(`pnpm dev:api`)를 먼저 켠다.

```bash
pnpm dev:agent
```

http://localhost:4100/health 가 `{"ok":true,"ai":true}`이면 AI가 켜진 것이다.

**AI를 켜려면** `.env.example`을 `.env`로 복사하고 `ANTHROPIC_API_KEY`에 키를 넣는다. `.env`는 Git에 올라가지 않는다.
키가 없으면 `"ai":false`로 켜지고, 웹앱은 예전처럼 규칙 기반으로 말을 해석한다. 에이전트를 켜지 않아도 웹앱은 그대로 쓸 수 있다.

| 설정 | 기본값 | 뜻 |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | 없음 | Claude API 키. 없으면 AI 꺼짐 |
| `AI_MODEL` | `claude-opus-5-5` | 쓸 모델 |
| `AI_EFFORT` | `low` | 생각 깊이 (`low`~`max`). 높일수록 느리고 비싸다 |
| `AGENT_RATE_LIMIT` | `30` | IP마다 1분에 받을 요청 수 |
| `API_BASE_URL` | `http://localhost:4000` | 운동 정보를 가져올 백엔드 |
| `WEB_ORIGIN` | `http://localhost:3000` | 부를 수 있는 웹앱 주소 |

## 주소

형식은 `packages/shared-types/src/agent.ts`. 오류는 `{ code, message }`.

| 주소 | 하는 일 |
| --- | --- |
| `GET /health` | `{ ok, ai }`: AI가 켜졌는지 |
| `POST /chat` | `{ message, history, context }` → `{ reply, actions }` |

오류 코드:

| 코드 | 상태 | 뜻 |
| --- | --- | --- |
| `VALIDATION` | 400 | 요청 모양이 틀림 |
| `RATE_LIMITED` | 429 | 1분 요청 수 초과 |
| `AI_DISABLED` | 503 | 키 없음 |
| `AI_BUSY` | 503 | AI 서비스가 잠시 응답 없음 |
| `AI_FAILED` | 502 | AI 처리 실패 |
| `BACKEND_UNAVAILABLE` | 502 | API 서버에 연결 못 함 |

웹앱은 오류가 나면 그 말을 규칙 기반으로 처리한다.

## 도구

| 도구 | 종류 | 하는 일 |
| --- | --- | --- |
| `search_exercises` | 정보 (+화면) | 공개 운동을 분류·낱말로 찾기. `show_on_screen`이면 처음 화면 목록도 거른다 |
| `get_exercise_detail` | 정보 | 요약·주의사항·단계별 음성 안내 |
| `open_exercise` | 화면 | 운동 화면 열기 (`autoplay`면 바로 시작) |
| `control_playback` | 화면 | 시작·멈춤·다음·이전·다시, 위험 신호면 중단(STOP) |
| `change_speech_rate` | 화면 | 말 속도 |
| `go_to` | 화면 | 처음 화면, 이전 화면 |

화면 도구는 실제로 화면을 바꾸지 않고 할 일(`AgentAction`)만 모은다. 화면(`apps/web/src/user/components/assistant-app.tsx`)이 실행한다.
공개되지 않은 운동 id나, 운동 화면이 아닐 때의 재생 조작은 도구가 오류로 돌려준다.

## 구조

```
src/
├── main.ts       # 서버 시작 (.env 읽기)
├── server.ts     # HTTP 서버: CORS, 요청 수 제한, 오류 형식
├── agent.ts      # 말 한 마디 처리: Claude 호출 → 도구 실행 → 반복 (최대 5번)
├── tools.ts      # 도구 정의와 실행
├── prompt.ts     # 역할(시스템 프롬프트), 앱 상태·공개 운동 목록 글
├── backend.ts    # 백엔드 API 읽기 (나중에 backend-mcp로 바꾼다)
├── validate.ts   # 요청 모양 검사
└── config.ts
test/             # 가짜 Claude 응답으로 확인하는 테스트 (키 필요 없음)
```

- Claude 연결(모델, 생각 깊이, 거절 시 대체 모델, 사용량 기록)은 `packages/ai-common`에 있다. 관리자 에이전트도 같은 것을 쓴다.
- 사용량은 호출마다 콘솔에 한 줄 남긴다 (대화 내용은 남기지 않는다).

## 테스트

```bash
pnpm --filter @yconic/user-agent test
```
