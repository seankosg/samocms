/** 안전리포트 텔레그램 발송 설정 기본값·공통 상수 (클라이언트 안전) */

export const SAFETY_KEYS = {
  enabled: "safety_tg_enabled",
  sendTime: "safety_tg_send_time",
  retryUntil: "safety_tg_retry_until",
  retryInterval: "safety_tg_retry_interval_min",
  coverKo: "safety_tg_cover_ko",
  coverEn: "safety_tg_cover_en",
  resultTo: "safety_tg_result_to",
} as const;

export const DEFAULT_COVER_KO = `📋 <b>일일 안전 리포트 — {date}</b>

{date} 금일 작업현황과 AI 가 예측한 위험 요인 리포트를 송부합니다.

각 팀·협력사는 TBM 시 본 내용을 근로자에게 정확히 전파하고, 리포트에 제시된 안전 조치를 반드시 이행한 후 작업에 착수하시기 바랍니다.

오늘도 안전한 하루가 되도록 다 같이 노력합시다.

— HDEC HMMME 현장 HSE`;

export const DEFAULT_COVER_EN = `📋 <b>Daily Safety Report — {date}</b>

Please find attached today's work status and the AI-generated risk forecast report for {date}.

All teams and subcontractors shall brief this report to their workers at the TBM (Tool Box Meeting) and ensure that the safety measures stated in the report are in place before starting work.

Let us all work together for another safe day on site.

— HDEC HMMME Site HSE`;

export const SAFETY_DEFAULTS = {
  enabled: false,
  sendTime: "05:00",
  retryUntil: "05:20",
  retryInterval: 5,
  coverKo: DEFAULT_COVER_KO,
  coverEn: DEFAULT_COVER_EN,
  resultTo: [] as string[],
};

export const hmTime = /^([01]?\d|2[0-3]):[0-5]\d$/;

/** "9:0", "09：00", 전각/공백 등을 HH:mm 로 정규화 */
export const normalizeTimes = (v: string): string[] =>
  v
    .replace(/[：]/g, ":")
    .replace(/[，、]/g, ",")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const m = /^(\d{1,2}):(\d{1,2})$/.exec(t);
      return m ? `${m[1]!.padStart(2, "0")}:${m[2]!.padStart(2, "0")}` : t;
    });

export type SafetySendLog = {
  received_at: string;
  warnings: {
    day?: string;
    seq?: number;
    attempt?: number;
    sent_ko?: number;
    sent_en?: number;
    failed?: { id?: string; name?: string; company?: string }[];
    pending?: number;
    reported?: boolean;
  } | null;
};
