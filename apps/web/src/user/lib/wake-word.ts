/**
 * 부르면 듣기 (호출어). 시각장애인은 버튼을 찾아 누르기 어려울 수 있으므로,
 * 마이크는 계속 켜 두되 "소리벗"이라고 부른 뒤의 말만 명령으로 받는다 (docs/decisions/0009).
 * 영상 속 강사의 말이나 주변 소리는 호출어가 없으면 명령으로 받지 않는다.
 *
 * - "소리벗, 멈춰"처럼 한 번에 말하면 호출어 뒤의 말을 바로 명령으로 받는다
 * - "소리벗"만 말하면 듣기 상태가 되고, 그다음 한 마디를 명령으로 받는다 (정해진 시간 안에)
 * - 큰 버튼을 누르는 것은 "소리벗"이라고 부른 것과 같다
 */

/** 호출어. 음성 인식이 "소리 벗", "소리벗아"처럼 받아 적어도 알아듣는다 */
export const WAKE_WORD = "소리벗";
const WAKE_PATTERN = /소\s*리\s*(벗|벚|볏|빗)/g;

/** 호출어 뒤에 붙는 부름말과 문장 부호 ("소리벗아,", "소리벗야") */
const CALL_SUFFIX = /^(아|야|이|님)?[\s,.!?~]*/;

/** 듣기 상태로 기다리는 시간 */
export const ARM_MS = 8000;

/** 말에서 마지막 호출어를 찾아, 그 뒤의 말을 돌려준다. 호출어가 없으면 null */
export function afterWakeWord(text: string): string | null {
  let last: RegExpExecArray | null = null;
  for (const m of text.matchAll(WAKE_PATTERN)) last = m as RegExpExecArray;
  if (!last) return null;
  return text.slice(last.index + last[0].length).replace(CALL_SUFFIX, "").trim();
}

export type GateResult = { kind: "armed" } | { kind: "command"; text: string } | null;

export interface CommandGate {
  /** 버튼을 눌렀거나 호출어를 들었다: 다음 한 마디를 명령으로 받는다 */
  arm(): void;
  disarm(): void;
  isArmed(): boolean;
  /** 음성 인식이 받아 적은 말을 넣는다 */
  feed(text: string): GateResult;
}

export function createCommandGate(now: () => number = () => Date.now(), armMs = ARM_MS): CommandGate {
  let armedUntil = 0;
  const isArmed = () => now() < armedUntil;
  return {
    arm() {
      armedUntil = now() + armMs;
    },
    disarm() {
      armedUntil = 0;
    },
    isArmed,
    feed(raw) {
      const text = raw.trim();
      if (!text) return null;
      const rest = afterWakeWord(text);
      if (rest !== null) {
        if (rest) {
          armedUntil = 0;
          return { kind: "command", text: rest };
        }
        armedUntil = now() + armMs;
        return { kind: "armed" };
      }
      if (isArmed()) {
        armedUntil = 0;
        return { kind: "command", text };
      }
      return null;
    },
  };
}
