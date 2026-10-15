export type SpendingPolicy = {
  maxPaymentUsdc: number;
  dailyBudgetUsdc: number;
  allowedNetwork: 'eip155:84532';
};

export const policy: SpendingPolicy = {
  maxPaymentUsdc: positiveNumber(process.env.MAX_PAYMENT_USDC, 0.001),
  dailyBudgetUsdc: positiveNumber(process.env.DAILY_BUDGET_USDC, 0.01),
  allowedNetwork: 'eip155:84532',
};

function positiveNumber(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function validateBudget(requested: number, spentToday: number, active: SpendingPolicy = policy): string | null {
  if (!Number.isFinite(requested) || requested <= 0) return 'Budget must be a positive number.';
  if (requested > active.maxPaymentUsdc) return `Requested budget exceeds the per-payment cap of ${active.maxPaymentUsdc} USDC.`;
  if (spentToday + requested > active.dailyBudgetUsdc) return `Requested budget exceeds the remaining daily budget (${Math.max(0, active.dailyBudgetUsdc - spentToday).toFixed(6)} USDC).`;
  return null;
}
