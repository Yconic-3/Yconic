/**
 * 서버 목소리 (docs/decisions/0021): 서버가 글을 음성 파일로 만들어 준다.
 * 기기마다 다른 브라우저 목소리 대신 늘 같은 목소리로 읽기 위해서다. 로그인 없이 쓴다.
 *   GET  /tts/config → TtsConfig                (켜져 있는지)
 *   POST /tts        TtsRequest → TtsResponse   (음성 파일 주소. 같은 글은 한 번만 만든다)
 * 꺼져 있거나(404) 한도를 넘거나(403) 만들지 못하면(500) 화면은 기기의 목소리로 읽는다.
 */
export interface TtsConfig {
  /** 서버 목소리를 쓸 수 있는지 (서버에 음성 만들기 키가 있는지) */
  enabled: boolean;
  /** 한 번에 보낼 수 있는 글자 수 */
  maxChars: number;
}

export interface TtsRequest {
  /** 읽을 글 (한 문장 정도) */
  text: string;
}

export interface TtsResponse {
  /** 음성 파일(MP3) 주소. 그대로 재생할 수 있다 */
  url: string;
}
