// LLM 모델 가격 → KRW 환산 (대략, 시연용)
// 실제 가격은 각 공식 페이지 확인 (Anthropic, Google AI)

const USD_TO_KRW = 1380;

const PRICING_PER_MTOK_USD: Record<string, { input: number; output: number }> = {
  // Anthropic Claude
  "claude-opus-4-7": { input: 15, output: 75 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4 },

  // Google Gemini 2.5 (정식)
  "gemini-2.5-pro": { input: 1.25, output: 10 },                 // ≤200K context
  "gemini-2.5-flash": { input: 0.30, output: 2.50 },
  "gemini-2.5-flash-lite": { input: 0.10, output: 0.40 },

  // Google Gemini 3.x (Preview)
  "gemini-3.1-pro-preview": { input: 2.00, output: 12 },
  "gemini-3-flash-preview": { input: 0.50, output: 3.00 },
  "gemini-3.1-flash-lite": { input: 0.25, output: 1.50 },
};

export function estimateCostKrw(model: string, tokensIn: number, tokensOut: number): number {
  // 정확한 매칭 → 부분 매칭 (e.g., "gemini-2.5-flash-002" → "gemini-2.5-flash")
  let p = PRICING_PER_MTOK_USD[model];
  if (!p) {
    const matchKey = Object.keys(PRICING_PER_MTOK_USD).find(k => model.startsWith(k));
    p = matchKey ? PRICING_PER_MTOK_USD[matchKey] : PRICING_PER_MTOK_USD["claude-sonnet-4-6"];
  }
  const usd = (tokensIn / 1_000_000) * p.input + (tokensOut / 1_000_000) * p.output;
  return Math.round(usd * USD_TO_KRW);
}
