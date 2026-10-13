# AgentPay — Full-stack starter

A React + Vite + TypeScript dashboard with a Node.js + Express + TypeScript API, backend-enforced spending policies, and optional x402 client/seller integrations for **Base Sepolia testnet**.

## Features

- Responsive AgentPay dashboard UI.
- Express API: health, metrics, transactions, tasks, and spending-policy routes.
- Server-side budget enforcement before any x402 request: per-payment cap and daily budget.
- Zod request validation, Helmet security headers, CORS allowlist, JSON body limit, and API rate limit.
- x402 client using `@x402/fetch` + CDP-managed wallet with SDK-enforced per-payment cap, rolling cumulative cap, and Base Sepolia-only network allowlist.
- Optional x402 seller route protected by `@x402/express` and a compatible HTTP facilitator (`https://x402.org/facilitator` by default) on Base Sepolia.
- Safe preview mode by default: no payment is attempted unless both `X402_PAID_API_URL` and CDP-managed x402 credentials are configured.

## Requirements

- Node.js 20+ (22+ recommended)
- npm
- For actual testnet payment: CDP developer credentials and a CDP-managed wallet funded with Base Sepolia test USDC.

## Run locally

1. Extract the project.
2. From the project root, install frontend/root dependencies:

   ```bash
   npm install
   ```

3. Install backend dependencies:

   ```bash
   npm --prefix backend install
   ```

4. Copy `backend/.env.example` to `backend/.env` and edit values as needed.
5. Start frontend and backend together:

   ```bash
   npm run dev
   ```

6. Open `http://localhost:5173`. Backend API is at `http://localhost:4021/api/health`.

## x402 configuration

`backend/.env.example` documents every setting. Defaults are intentionally safe:

- `X402_NETWORK=eip155:84532` — Base Sepolia CAIP-2 identifier.
- `X402_FACILITATOR_URL=https://x402.org/facilitator` — public testnet facilitator URL.
- `PAY_TO` — optional receiver address. Set a wallet address you control to enable the paid sample route `GET /api/paid/sample`.
- `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET` — optional server-side CDP-managed x402 payer credentials, used only when `X402_PAID_API_URL` is configured. **Never expose these values to Vite or commit them.** The client enforces the per-payment amount, rolling cumulative cap and Base Sepolia network allowlist.
- `X402_PAID_API_URL` — optional URL of a real x402-protected API that the agent should request.
- `MAX_PAYMENT_USDC` and `DAILY_BUDGET_USDC` — backend enforcement caps in USDC dollar units.

A task is only sent to an external paid API after the backend validates the requested budget against the per-payment and daily caps. If the paid API URL or CDP credentials are missing, the task is stored as a preview and no payment is attempted.

## API routes

- `GET /api/health`
- `GET /api/metrics`
- `GET /api/transactions?q=...`
- `GET /api/policy`
- `PUT /api/policy` body: `{ "maxPaymentUsdc": 0.001, "dailyBudgetUsdc": 0.01 }`
- `POST /api/tasks` body: `{ "task": "Research three DeFi protocols", "budgetUsdc": 0.001 }`
- `GET /api/tasks`
- `GET /api/paid/sample` — x402-protected sample route, only registered if `PAY_TO` is set to a non-zero valid address.

## Production checklist — do not skip

- Current transaction/task/policy storage is in memory for local development. Use a persistent database and atomic ledger before multi-user use.
- The current task endpoint treats the requested task budget as a policy reservation, not as a cryptographically verified settlement amount. Before production, parse the facilitator's settlement result and verify chain transaction hashes/receipts, payer, payee, token contract, network and amount. Do not mark a transaction settled from an HTTP 200 alone.
- Add authentication and user/workspace isolation; current routes are not authenticated.
- Add idempotency keys, a durable reservation/ledger, concurrency-safe daily caps, provider allowlists, transaction reconciliation, and audit logs.
- The public facilitator URL is for testnet development only. Select a supported production facilitator for mainnet, and never switch to mainnet without reviewing pricing, assets, allowlists and security controls.
- Never use a wallet holding real funds for development. Never put secrets in frontend environment variables (`VITE_*`).

## Build

```bash
npm run build
```

The x402 SDK is evolving; if package API versions change, follow the current official x402 TypeScript SDK examples and keep all payment signing on the server.
