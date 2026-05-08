// Anthropic 모델 가격 → KRW 환산 (대략, 시연용)
// 실제 가격은 Anthropic 공식 페이지 확인.

const USD_TO_KRW = 1380;

const PRICING_PER_MTOK_USD: Record<string, { input: number; output: number }> = {
  "claude-opus-4-7": { input: 15, output: 75 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4 },
};

export function estimateCostKrw(model: string, tokensIn: number, tokensOut: number): number {
  const p = PRICING_PER_MTOK_USD[model] ?? PRICING_PER_MTOK_USD["claude-sonnet-4-6"];
  const usd = (tokensIn / 1_000_000) * p.input + (tokensOut / 1_000_000) * p.output;
  return Math.round(usd * USD_TO_KRW);
}
