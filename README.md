# NinjaPay - Africa's Crypto Super-App on Injective

**NinjaPay** is a community-first financial super-app built on Injective that lets Africans on-ramp, off-ramp, pay bills, run payroll, and distribute on-chain rewards — all powered by INJ and iUSDT, with zero gas friction.

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.local.example` to `.env.local` and fill in your configuration:

```bash
cp .env.local.example .env.local
```

**Required:**
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📱 Features

### ✅ Implemented (MVP)

- **Wallet Connection** - Keplr & Leap integration
- **Balance Display** - Real-time INJ/USDT with NGN conversion
- **Send Tokens** - Direct transfers between wallets
- **Pay Bills** - Airtime, data, electricity, cable
- **Create Claims** - Shareable reward distributions
- **Public Claim Links** - No auth required to claim
- **Batch Payroll** - Pay employees in one transaction
- **Transaction History** - Track all activity

## 🏗️ Architecture

**Tech Stack:**
- Next.js 16 + React 19 + Tailwind CSS
- Injective SDK (`@injectivelabs/sdk-ts`)
- Supabase (Claims database)
- Keplr & Leap Wallets

**Zero Gas:** Uses Injective's native zero-fee chain modules

## 💡 How It Works

### Send
Connect wallet → Enter recipient → Sign MsgSend → Complete

### Bills
Select provider → Enter identifier → Pay with USDT → Instant delivery

### Claims
Create pool → Get shareable link → Recipients claim → Backend sends MsgSend

### Payroll
Add employees → Set amounts → Execute MsgMultiSend → All paid at once

## 📊 Setup Supabase

Create these tables:

```sql
CREATE TABLE claim_pools (
  id UUID PRIMARY KEY,
  creator_address TEXT,
  total_amount TEXT,
  claim_type TEXT,
  shares JSONB,
  claimed_by JSONB,
  link_code TEXT UNIQUE,
  created_at TIMESTAMP
);

CREATE TABLE transactions (
  id UUID PRIMARY KEY,
  user_address TEXT,
  type TEXT,
  status TEXT,
  amount TEXT,
  recipient TEXT,
  tx_hash TEXT,
  created_at TIMESTAMP
);
```

## 🎯 Demo Flow

1. Connect Keplr/Leap wallet
2. View balance in INJ/USDT + NGN
3. Send tokens to another address
4. Pay airtime with USDT
5. Create claim pool & share link
6. Claim from public link
7. View transaction history

---

**Built for Africa on Injective ⚡**
