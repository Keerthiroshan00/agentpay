import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { HTTPFacilitatorClient, x402ResourceServer } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { paymentMiddleware } from '@x402/express';
import { policy, validateBudget, type SpendingPolicy } from './policy.js';
import { createX402Fetch } from './x402Client.js';

const app = express();
const port = Number(process.env.PORT ?? 4021);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const frontendDist = path.join(projectRoot, 'dist');
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
const NETWORK = 'eip155:84532' as const;
const USDC = 'USDC';
const groqCompletionSchema = z.object({
  choices: z.array(z.object({
    message: z.object({ content: z.string().nullable().optional() }).passthrough(),
  })).optional(),
  error: z.object({ message: z.string() }).optional(),
}).passthrough();

app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: frontendOrigin.split(',').map((item) => item.trim()), credentials: false }));
app.use(express.json({ limit: '32kb' }));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false }));

// Demo storage for the starter. Replace with PostgreSQL/Supabase before multi-user deployment.
type TxStatus = 'Settled' | 'Pending' | 'Rejected';
type Transaction = { id: string; service: string; detail: string; amount: string; status: TxStatus; time: string; hash: string; createdAt: number };
type AgentTask = { id: string; task: string; budgetUsdc: number; status: 'Previewed' | 'Completed' | 'Blocked' | 'Failed'; createdAt: string; result: string };
const transactions: Transaction[] = [];
const tasks: AgentTask[] = [];
let policyOverrides: SpendingPolicy = { ...policy };
let sequence = 2050;
let inFlightReservedUsdc = 0;

function todaySpent(): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return transactions.filter((tx) => tx.createdAt >= today.getTime() && (tx.status === 'Settled' || tx.status === 'Pending'))
    .reduce((sum, tx) => sum + Number.parseFloat(tx.amount), 0);
}

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res, next)).catch(next);
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'agentpay-api', network: NETWORK, mode: process.env.NODE_ENV ?? 'development', x402ClientConfigured: Boolean(process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET && process.env.CDP_WALLET_SECRET), groqConfigured: Boolean(process.env.GROQ_API?.trim()) }));

app.get('/api/metrics', (_req, res) => {
  const spent = todaySpent();
  const settled = transactions.filter((tx) => tx.status === 'Settled').length;
  res.json({ walletBalance: null, spentTodayUsdc: spent, dailyBudgetUsdc: policyOverrides.dailyBudgetUsdc, maxPaymentUsdc: policyOverrides.maxPaymentUsdc, tasksCompleted: tasks.filter((task) => task.status === 'Completed').length, paymentsSettled: settled, network: NETWORK, note: 'Wallet balance and historical metrics require a wallet/indexer integration.' });
});

app.get('/api/transactions', (req, res) => {
  const q = String(req.query.q ?? '').toLowerCase();
  const rows = transactions.filter((tx) => `${tx.id} ${tx.service} ${tx.detail} ${tx.status}`.toLowerCase().includes(q))
    .sort((a, b) => b.createdAt - a.createdAt).map(({ createdAt: _createdAt, ...tx }) => tx);
  res.json({ transactions: rows, count: rows.length });
});

app.get('/api/policy', (_req, res) => res.json({ ...policyOverrides, spentTodayUsdc: todaySpent(), remainingTodayUsdc: Math.max(0, policyOverrides.dailyBudgetUsdc - todaySpent()), network: NETWORK }));

const policySchema = z.object({
  maxPaymentUsdc: z.number().positive().max(100),
  dailyBudgetUsdc: z.number().positive().max(1000),
}).strict();
app.put('/api/policy', (req, res) => {
  const parsed = policySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid policy values.', details: parsed.error.flatten() });
  if (parsed.data.maxPaymentUsdc > parsed.data.dailyBudgetUsdc) return res.status(400).json({ error: 'Per-payment cap cannot exceed the daily budget.' });
  policyOverrides = { ...policyOverrides, ...parsed.data };
  return res.json({ message: 'Backend policy updated.', policy: policyOverrides });
});

const taskSchema = z.object({
  task: z.string().trim().min(4).max(2000),
  budgetUsdc: z.number().positive().max(100),
}).strict();
app.post('/api/tasks', asyncHandler(async (req, res) => {
  const parsed = taskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Provide a task (4–2000 characters) and a numeric budget.', details: parsed.error.flatten() });
  const { task, budgetUsdc } = parsed.data;
  const violation = validateBudget(budgetUsdc, todaySpent() + inFlightReservedUsdc, policyOverrides);
  if (violation) {
    const blocked: AgentTask = { id: `TASK-${Date.now()}`, task, budgetUsdc, status: 'Blocked', createdAt: new Date().toISOString(), result: violation };
    tasks.unshift(blocked);
    return res.status(403).json({ error: 'Spending policy blocked this task.', reason: violation, task: blocked });
  }

  const id = `TASK-${Date.now()}`;
  const paidApiUrl = process.env.X402_PAID_API_URL?.trim();
  const remainingDailyUsdc = Math.max(0, policyOverrides.dailyBudgetUsdc - todaySpent() - inFlightReservedUsdc);
  const allowedPaymentCap = Math.min(policyOverrides.maxPaymentUsdc, budgetUsdc);
  const x402Fetch = createX402Fetch(allowedPaymentCap, remainingDailyUsdc);
  if (paidApiUrl && x402Fetch) {
    // Reserve the maximum budget synchronously before the first await to limit concurrent overspend.
    inFlightReservedUsdc += budgetUsdc;
    // This request can trigger a real testnet payment. Server-side policy is checked first.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await x402Fetch(paidApiUrl, { signal: controller.signal, headers: { 'x-agentpay-task-id': id } });
      const bodyText = await response.text();
      const safeBody = bodyText.length > 4000 ? `${bodyText.slice(0, 4000)}…` : bodyText;
      const taskRecord: AgentTask = { id, task, budgetUsdc, status: response.ok ? 'Completed' : 'Failed', createdAt: new Date().toISOString(), result: safeBody || `Paid API returned HTTP ${response.status}.` };
      tasks.unshift(taskRecord);
      if (response.ok) transactions.unshift({ id: `TX-${++sequence}`, service: new URL(paidApiUrl).host, detail: task.slice(0, 80), amount: `${budgetUsdc.toFixed(6)} ${USDC} cap`, status: 'Pending', time: 'just now', hash: 'Pending chain reconciliation', createdAt: Date.now() });
      return res.status(response.ok ? 200 : 502).json({ task: taskRecord, paidApiStatus: response.status, note: 'The payment outcome must be confirmed from the facilitator / chain before treating it as final.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown x402 client error';
      const taskRecord: AgentTask = { id, task, budgetUsdc, status: 'Failed', createdAt: new Date().toISOString(), result: `x402 request failed: ${message}` };
      tasks.unshift(taskRecord);
      return res.status(502).json({ error: 'x402 paid API request failed.', task: taskRecord });
    } finally { clearTimeout(timeout); inFlightReservedUsdc = Math.max(0, inFlightReservedUsdc - budgetUsdc); }
  }

  const groqApiKey = process.env.GROQ_API?.trim();
  if (!groqApiKey) {
    return res.status(503).json({ error: 'Groq AI is not configured. Set GROQ_API in backend/.env and restart the backend.' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-120b',
        temperature: 0.2,
        max_tokens: 1500,
        messages: [
          {
            role: 'system',
            content: 'You are the AgentPay task assistant. Directly fulfill the user task as clearly and usefully as possible. You have no web browser, external tools, or ability to perform actions outside this response. Never claim that you browsed, executed an external action, or verified live information. For requests requiring current information, state that limitation and do not invent facts, sources, or links.',
          },
          { role: 'user', content: task },
        ],
      }),
      signal: controller.signal,
    });
    const body: unknown = await response.json().catch(() => null);
    const parsed = groqCompletionSchema.safeParse(body);
    if (!response.ok) {
      const message = parsed.success ? parsed.data.error?.message : undefined;
      throw new Error(message || `Groq API returned HTTP ${response.status}.`);
    }
    if (!parsed.success) throw new Error('Groq returned an invalid response.');
    const result = parsed.data.choices?.[0]?.message.content?.trim();
    if (!result) throw new Error('Groq returned an empty response.');

    const completed: AgentTask = { id, task, budgetUsdc, status: 'Completed', createdAt: new Date().toISOString(), result };
    tasks.unshift(completed);
    return res.json({ task: completed, paymentAttempted: false, note: 'AI response generated by Groq. No blockchain payment was made.' });
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? 'Groq request timed out. Please try again.'
      : error instanceof Error ? error.message : 'Groq request failed.';
    const failed: AgentTask = { id, task, budgetUsdc, status: 'Failed', createdAt: new Date().toISOString(), result: message };
    tasks.unshift(failed);
    return res.status(502).json({ error: message, task: failed });
  } finally {
    clearTimeout(timeout);
  }
}));

app.get('/api/tasks', (_req, res) => res.json({ tasks: tasks.slice(0, 50) }));

// Optional seller-side sample endpoint. It is enabled only with a real receiver address.
// The public x402.org facilitator is intended for testnet development, not production mainnet.
const payTo = process.env.PAY_TO;
if (payTo && /^0x[0-9a-fA-F]{40}$/.test(payTo) && payTo !== '0x0000000000000000000000000000000000000000') {
  const facilitator = new HTTPFacilitatorClient({ url: process.env.X402_FACILITATOR_URL ?? 'https://x402.org/facilitator' });
  const resourceServer = new x402ResourceServer(facilitator);
  resourceServer.register(NETWORK, new ExactEvmScheme());
  await resourceServer.initialize();
  app.use(paymentMiddleware({
    'GET /api/paid/sample': {
      accepts: [{ scheme: 'exact', price: '$0.001', network: NETWORK, payTo }],
      description: 'AgentPay sample report, protected by x402 on Base Sepolia.',
      mimeType: 'application/json',
    },
  }, resourceServer));
  app.get('/api/paid/sample', (_req, res) => res.json({ data: 'This is a sample paid report.', network: NETWORK, protocol: 'x402', generatedAt: new Date().toISOString() }));
}

app.use(express.static(frontendDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  return res.sendFile(path.join(frontendDist, 'index.html'));
});
app.use((req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` }));
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : 'Unexpected server error';
  console.error('[AgentPay API]', message);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(port, () => console.log(`AgentPay API listening on http://localhost:${port} (${NETWORK})`));
