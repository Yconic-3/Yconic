import { describe, expect, it } from "vitest";
import { createStreamSpeaker, takeSpeakable } from "./stream-speech";

describe("takeSpeakable: 지금 읽을 조각 떼어 내기", () => {
  it("문장이 끝나고 다음 말이 시작되면 그 문장을 뗀다", () => {
    expect(takeSpeakable("무릎이 아프면 멈추세요. 그리고", { first: true })).toEqual({ chunk: "무릎이 아프면 멈추세요.", consumed: "무릎이 아프면 멈추세요. ", rest: "그리고" });
    expect(takeSpeakable("괜찮으세요? 천천", { first: false }).chunk).toBe("괜찮으세요?");
  });

  it("문장 부호만 오고 아직 뒤가 없으면 기다린다 (숫자 1.5 같은 것을 끊지 않으려고)", () => {
    expect(takeSpeakable("무릎이 아프면 멈추세요.", { first: true }).chunk).toBeNull();
    expect(takeSpeakable("1.5초 동안", { first: false }).chunk).toBeNull();
  });

  it("끝난 문장이 여럿이면 한 번에 뗀다", () => {
    expect(takeSpeakable("하나요. 둘이요. 셋", { first: false })).toEqual({ chunk: "하나요. 둘이요.", consumed: "하나요. 둘이요. ", rest: "셋" });
  });

  it("맨 처음 조각은 쉼표에서도 끊는다. 앞의 말이 충분히 길 때만", () => {
    const first = takeSpeakable("의자 등받이를 두 손으로 잡고, 엉덩이를", { first: true });
    expect(first).toEqual({ chunk: "의자 등받이를 두 손으로 잡고,", consumed: "의자 등받이를 두 손으로 잡고, ", rest: "엉덩이를" });
    // 너무 짧은 앞말은 끊지 않고, 충분히 길어지는 다음 쉼표에서 끊는다
    expect(takeSpeakable("먼저, 의자를", { first: true }).chunk).toBeNull();
    expect(takeSpeakable("먼저, 의자 등받이를 두 손으로 잡고, 엉덩이를", { first: true }).chunk).toBe("먼저, 의자 등받이를 두 손으로 잡고,");
  });

  it("처음이 아니면 쉼표에서 끊지 않는다", () => {
    expect(takeSpeakable("의자 등받이를 두 손으로 잡고, 엉덩이를", { first: false }).chunk).toBeNull();
  });
});

/** 읽으라고 넘긴 조각을 모으는 가짜 읽기. ok가 false면 그 조각에서 끊긴 것으로 한다 */
function fakeSpeech(interruptAt?: string) {
  const spoken: string[] = [];
  return {
    spoken,
    speakOne: async (text: string) => {
      spoken.push(text);
      return text !== interruptAt;
    },
  };
}

const feed = (speaker: { push(d: string): void }, text: string, size = 3) => {
  for (let i = 0; i < text.length; i += size) speaker.push(text.slice(i, i + size));
};

describe("createStreamSpeaker: 받는 대로 차례로 읽기", () => {
  const ANSWER = "의자 등받이를 두 손으로 잡고, 엉덩이를 뒤로 천천히 빼며 앉아 보세요. 무릎은 발끝보다 앞으로 나가지 않게 해 주세요.";

  it("첫 쉼표에서 읽기 시작하고, 그 뒤는 문장 단위로, 마지막은 다 받은 뒤에 읽는다", async () => {
    const s = fakeSpeech();
    const speaker = createStreamSpeaker(s.speakOne);
    expect(speaker.started()).toBe(false);
    feed(speaker, ANSWER);
    expect(speaker.started()).toBe(true);
    expect(await speaker.finish(ANSWER)).toBe(true);
    expect(s.spoken).toEqual(["의자 등받이를 두 손으로 잡고,", "엉덩이를 뒤로 천천히 빼며 앉아 보세요.", "무릎은 발끝보다 앞으로 나가지 않게 해 주세요."]);
    // 읽은 조각을 이으면 답 전체다 (빠지거나 두 번 읽은 말이 없다)
    expect(s.spoken.join(" ")).toBe(ANSWER);
  });

  it("짧은 한 문장은 다 받은 뒤 한 번에 읽는다", async () => {
    const s = fakeSpeech();
    const speaker = createStreamSpeaker(s.speakOne);
    feed(speaker, "네, 좋아요.");
    expect(speaker.started()).toBe(false);
    await speaker.finish("네, 좋아요.");
    expect(s.spoken).toEqual(["네, 좋아요."]);
  });

  it("사람이 말을 끊으면(조각을 끝까지 못 읽으면) 뒤의 조각은 읽지 않는다", async () => {
    const s = fakeSpeech("의자 등받이를 두 손으로 잡고,");
    const speaker = createStreamSpeaker(s.speakOne);
    feed(speaker, ANSWER);
    expect(await speaker.finish(ANSWER)).toBe(false);
    expect(s.spoken).toEqual(["의자 등받이를 두 손으로 잡고,"]);
  });

  it("그만두면 아직 읽지 않은 조각과 뒤에 오는 글은 읽지 않는다", async () => {
    const s = fakeSpeech();
    const speaker = createStreamSpeaker(async (t) => {
      await Promise.resolve();
      return s.speakOne(t);
    });
    feed(speaker, "찾아볼게요, 잠시만 기다려 주세요. 그러니까");
    speaker.cancel();
    speaker.push(" 더 온 말입니다. 또");
    expect(await speaker.finish("다른 답입니다.")).toBe(false);
    expect(s.spoken).toEqual([]);
  });

  it("받은 글과 끝난 답이 어긋나면 더 읽지 않는다 (같은 말을 두 번 읽지 않게)", async () => {
    const s = fakeSpeech();
    const speaker = createStreamSpeaker(s.speakOne);
    feed(speaker, "첫 문장은 이렇게 읽었어요. 둘째");
    await speaker.finish("전혀 다른 답이 왔어요.");
    expect(s.spoken).toEqual(["첫 문장은 이렇게 읽었어요."]);
  });

  it("띄어쓰기가 조금 달라도 이어서 읽는다", async () => {
    const s = fakeSpeech();
    const speaker = createStreamSpeaker(s.speakOne);
    feed(speaker, "첫 문장입니다.  둘째 문장");
    await speaker.finish("첫 문장입니다. 둘째 문장입니다.");
    expect(s.spoken).toEqual(["첫 문장입니다.", "둘째 문장입니다."]);
  });
});
