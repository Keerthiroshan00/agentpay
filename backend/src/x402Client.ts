import 'dotenv/config';
import { CdpX402Client } from '@coinbase/cdp-sdk/x402';
import { wrapFetchWithPayment } from '@x402/fetch';

const BASE_SEPOLIA_USDC = '0x036cbd53842c5426634e7929541ec2318f3dcf7e';
const ATOMIC_UNITS = 1_000_000;

function toAtomic(usdc: number): bigint {
  return BigInt(Math.max(0, Math.floor(usdc * ATOMIC_UNITS + 1e-7)));
}

/**
 * Creates a CDP-managed x402 payer with SDK-enforced payment, rolling spend,
 * and network caps. Credentials and wallet signing remain backend-only.
 */
export function createX402Fetch(maxPaymentUsdc: number, remainingDailyUsdc: number): typeof fetch | null {
  const configured = Boolean(process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET && process.env.CDP_WALLET_SECRET);
  if (!configured) return null;
  if (maxPaymentUsdc <= 0 || remainingDailyUsdc <= 0) return null;

  const client = new CdpX402Client({
    environment: 'development',
    spendControls: {
      maxAmountPerPayment: { atomic: toAtomic(maxPaymentUsdc), asset: BASE_SEPOLIA_USDC },
      maxCumulativeSpend: { atomic: toAtomic(remainingDailyUsdc), asset: BASE_SEPOLIA_USDC },
      maxCumulativeSpendWindow: '24h',
      allowedNetworks: ['eip155:84532'],
    },
  });
  return wrapFetchWithPayment(globalThis.fetch, client as unknown as Parameters<typeof wrapFetchWithPayment>[1]);
}
