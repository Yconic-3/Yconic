import { describe, expect, it } from "vitest";
import { createUtteranceBuffer, END_OF_SPEECH_MS } from "./recognition";
import { endOfSpeechWaitMs, isBackchannelEcho, looksLikeQuestion, looksUnfinished, pickBackchannel, QUICK_WAIT_MS, UNFINISHED_WAIT_MS, type TurnContext } from "./turn-taking";

const HOME: TurnContext = { awaitingAnswer: false, onExercise: false };
const EXERCISING: TurnContext = { awaitingAnswer: false, onExercise: true };
const ASKED: TurnContext = { awaitingAnswer: true, onExercise: true };

describe("endOfSpeechWaitMs: 말이 끝났다고 보기까지 기다리는 시간", () => {
  it("보통의 말은 예전 그대로 기다린다 (빨리 답하려고 말을 끊지 않는다)", () => {
    for (const text of ["하체 운동 찾아줘", "스쿼트 어떻게 해", "허리가 뻐근한데 뭐가 좋을까", "오늘은 가볍게 하고 싶어요", "목 스트레칭 틀어 줘", "이거 너무 어려워"]) {
      expect(endOfSpeechWaitMs(text, HOME), text).toBe(END_OF_SPEECH_MS);
      expect(endOfSpeechWaitMs(text, EXERCISING), text).toBe(END_OF_SPEECH_MS);
    }
  });

  it("호출어만 부르면 바로 듣기 시작한다", () => {
    expect(endOfSpeechWaitMs("소리벗", HOME)).toBe(QUICK_WAIT_MS);
    expect(endOfSpeechWaitMs("소리벗아", HOME)).toBe(QUICK_WAIT_MS);
  });

  it("운동 중의 짧은 조작은 덜 기다린다. 운동 화면이 아니면 그대로 기다린다", () => {
    for (const text of ["다음", "멈춰", "다시", "이전", "소리벗 다음"]) {
      expect(endOfSpeechWaitMs(text, EXERCISING), text).toBe(QUICK_WAIT_MS);
      expect(endOfSpeechWaitMs(text, HOME), text).toBe(END_OF_SPEECH_MS);
    }
    // 어느 화면에서나 바로 처리하는 짧은 말
    for (const text of ["뒤로 가", "처음으로", "천천히", "사용법 알려줘"]) expect(endOfSpeechWaitMs(text, HOME), text).toBe(QUICK_WAIT_MS);
  });

  it("짧은 조작으로 시작해도 말이 길어지면 끝까지 기다린다", () => {
    expect(endOfSpeechWaitMs("다음 운동은 뭐가 있는지 알려줘", EXERCISING)).toBe(END_OF_SPEECH_MS);
    expect(endOfSpeechWaitMs("멈추고 다른 운동 찾아줘", EXERCISING)).toBe(END_OF_SPEECH_MS);
  });

  it("물어본 것에 대한 짧은 대답은 덜 기다린다. 묻지 않았을 때의 같은 말은 그대로 기다린다", () => {
    for (const text of ["네", "응", "좋아", "아니", "잠깐만"]) {
      expect(endOfSpeechWaitMs(text, ASKED), text).toBe(QUICK_WAIT_MS);
    }
    expect(endOfSpeechWaitMs("네", HOME)).toBe(END_OF_SPEECH_MS);
    expect(endOfSpeechWaitMs("아니", HOME)).toBe(END_OF_SPEECH_MS);
    // 긴 말은 대답이 아니라 새 말이다
    expect(endOfSpeechWaitMs("아니 그거 말고 다른 운동으로 바꿔 줘", ASKED)).toBe(END_OF_SPEECH_MS);
  });

  it("위험 신호는 길이와 상관없이 빨리 받는다", () => {
    expect(endOfSpeechWaitMs("아파요", EXERCISING)).toBe(QUICK_WAIT_MS);
    expect(endOfSpeechWaitMs("무릎이 너무 아파요", EXERCISING)).toBe(QUICK_WAIT_MS);
    expect(endOfSpeechWaitMs("어지러워", HOME)).toBe(QUICK_WAIT_MS);
  });

  it("말이 덜 끝난 것처럼 들리면 더 오래 기다린다", () => {
    for (const text of ["허리가 뻐근한데", "스쿼트는", "하체 운동 하고", "음", "그리고", "어제 운동을 했는데 오늘은", "무릎이 안 좋아서", "근데"]) {
      expect(endOfSpeechWaitMs(text, HOME), text).toBe(UNFINISHED_WAIT_MS);
      expect(endOfSpeechWaitMs(text, EXERCISING), text).toBe(UNFINISHED_WAIT_MS);
    }
  });
});

describe("looksUnfinished", () => {
  it("잇는 말, 조사, 말을 고르는 소리로 끝나면 덜 끝난 말이다", () => {
    for (const text of ["스쿼트를", "어깨가", "오늘은", "하고", "해서", "하면", "힘든데", "그러니까", "음…"]) expect(looksUnfinished(text), text).toBe(true);
  });
  it("문장을 맺는 말은 끝난 말이다", () => {
    for (const text of ["찾아줘", "알려 주세요", "뭐야", "시작", "다음", "좋을까", "하고 싶어요", "스쿼트", "네", ""]) expect(looksUnfinished(text), text).toBe(false);
  });
});

describe("말 모으기와 함께 쓰면", () => {
  const waitFor = (ctx: TurnContext) => (heard: string) => endOfSpeechWaitMs(heard, ctx);

  it("짧은 조작은 0.7초 뒤에 넘기고, 보통의 말은 1.3초를 채운다", () => {
    const quick = createUtteranceBuffer(waitFor(EXERCISING));
    quick.push("다음", 0);
    expect(quick.take(600)).toBeNull();
    expect(quick.take(700)).toBe("다음");

    const normal = createUtteranceBuffer(waitFor(EXERCISING));
    normal.push("이거 어떻게 해", 0);
    expect(normal.take(700)).toBeNull();
    expect(normal.take(1299)).toBeNull();
    expect(normal.take(1300)).toBe("이거 어떻게 해");
  });

  it("짧은 조작 뒤에 말을 이으면 끊지 않고 한 말로 모은다", () => {
    const b = createUtteranceBuffer(waitFor(EXERCISING));
    b.push("다음", 0);
    // 0.5초 뒤 다시 말하기 시작 (중간 결과)
    b.touch(500);
    expect(b.take(900)).toBeNull();
    b.push("운동은 뭐가 있어", 1500);
    // 이제는 긴 말이므로 1.3초를 기다린다
    expect(b.take(2300)).toBeNull();
    expect(b.take(2800)).toBe("다음 운동은 뭐가 있어");
  });

  it("덜 끝난 말은 2초까지 기다려 뒷말과 합친다", () => {
    const b = createUtteranceBuffer(waitFor(HOME));
    b.push("허리가 뻐근한데", 0);
    expect(b.take(1300)).toBeNull();
    expect(b.take(1900)).toBeNull();
    b.push("뭐가 좋을까", 1950);
    expect(b.take(3000)).toBeNull();
    expect(b.take(3250)).toBe("허리가 뻐근한데 뭐가 좋을까");
  });

  it("끝내 뒷말이 없으면 2초 뒤에 그대로 넘긴다", () => {
    const b = createUtteranceBuffer(waitFor(HOME));
    b.push("스쿼트는", 0);
    expect(b.take(2000)).toBe("스쿼트는");
  });
});

describe("맞장구", () => {
  it("묻는 말에는 확인해 보겠다고, 시키는 말에는 잠시만 기다리라고 한다", () => {
    for (const text of ["허리가 뻐근한데 뭐가 좋을까", "스쿼트 어떻게 해?", "이 운동 몇 분이야", "무릎에 괜찮은 운동 있나요"]) {
      expect(looksLikeQuestion(text), text).toBe(true);
      expect(pickBackchannel(text)).toBe("확인해 볼게요.");
    }
    for (const text of ["스쿼트 틀어줘", "하체 운동 찾아 줘", "조금 쉬운 걸로 바꿔 줘"]) {
      expect(looksLikeQuestion(text), text).toBe(false);
      expect(pickBackchannel(text)).toBe("잠시만요.");
    }
  });

  it("맞장구가 마이크로 다시 들어온 것(일부만 들린 것 포함)을 알아본다", () => {
    expect(isBackchannelEcho("잠시만요", "잠시만요.")).toBe(true);
    expect(isBackchannelEcho("잠시만", "잠시만요.")).toBe(true);
    expect(isBackchannelEcho("요", "잠시만요.")).toBe(true);
    expect(isBackchannelEcho("확인해 볼게", "확인해 볼게요.")).toBe(true);
  });

  it("사람이 한 다른 말은 맞장구의 메아리가 아니다", () => {
    expect(isBackchannelEcho("네", "잠시만요.")).toBe(false);
    expect(isBackchannelEcho("아니", "확인해 볼게요.")).toBe(false);
    expect(isBackchannelEcho("잠시만요 그거 말고", "잠시만요.")).toBe(false);
    expect(isBackchannelEcho("", "잠시만요.")).toBe(false);
  });
});
