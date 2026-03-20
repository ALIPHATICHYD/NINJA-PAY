<div align="center">
  <img src="public/favicon.ico" alt="NinjaPay Logo" width="80" height="80" />
  <h1>NinjaPay</h1>
  <p><strong>Africa's Crypto Premium Super-App on Injective</strong></p>
  
  <p>
    <a href="https://ninjapay.xyz">Website</a> •
    <a href="#-features">Features</a> •
    <a href="#-tech-stack">Tech Stack</a> •
    <a href="#-getting-started">Getting Started</a>
  </p>
</div>

---

## 📖 About
NinjaPay is a community-first financial super-app built on **Injective (inEVM)** that bridges the gap between decentralized finance and real-world utility in Africa. It allows users to off-ramp directly to Nigerian bank accounts, pay local utility bills, run crypto payrolls, and distribute on-chain rewards—all powered by INJ and USDT, wrapped in a sleek, premium Web3 interface.

## ✨ Features

- **💳 Native Off-ramp (Onboard API):** Convert INJ or USDT directly into NGN and receive it in your Nigerian bank account in under 60 seconds.
- **⚡ Zero-Friction Transfers:** Send INJ or USDT to any EVM wallet address instantly with sub-second finality and near-zero fees.
- **📱 Real-World Bill Payments:** Pay for Airtime, Data, Electricity, and Cable TV subscriptions directly from your crypto wallet.
- **🎁 Claim Links:** Generate shareable claim pools. Distribute tokens equally, by percentage, or custom amounts to a group via a simple link.
- **👥 Bulk Payroll:** Batch-pay your entire DAO, team, or community in a single transaction (MsgMultiSend).
- **📈 Real-Time Analytics:** Track your transaction volume, beneficiary count, and spending breakdown using live CoinGecko INJ/USD pricing and D3-style charts.
- **🔌 Multi-Wallet Support:** Fully integrated with RainbowKit, Wagmi, and Viem to support MetaMask, Trust Wallet, and WalletConnect natively on Injective's EVM layer.

---

## 🛠 Tech Stack

**Frontend & Core:**
- [Next.js 14](https://nextjs.org/) (App Router, React)
- [Tailwind CSS](https://tailwindcss.com/) (Custom glassmorphism & gradient design system)
- [Lucide React](https://lucide.dev/) (Icons)

**Web3 & Blockchain:**
- [Injective inEVM Testnet](https://injective.com/) (Chain ID: 2424)
- [Wagmi](https://wagmi.sh/) & [Viem](https://viem.sh/) (EVM interactions & hooks)
- [RainbowKit](https://www.rainbowkit.com/) (Wallet Connection modal)

**Backend & Data:**
- [Supabase](https://supabase.com/) (PostgreSQL for Claims & Transaction History)
- [CoinGecko API](https://www.coingecko.com/en/api) (Live INJ & USDT pricing)

---

## 🚀 Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/ninjapay.git
cd ninjapay
```

### 2. Install Dependencies
```bash
npm install
# or yarn install / pnpm install
```

### 3. Environment Variables
Create a `.env.local` file in the root directory and add the following keys. You will need a Supabase project set up for the backend.

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Supabase Database Setup
Execute the following SQL in your Supabase SQL Editor to spin up the required tables:

```sql
-- Create Claims Table
CREATE TABLE claim_pools (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  creator_address TEXT NOT NULL,
  total_amount TEXT NOT NULL,
  claim_type TEXT NOT NULL,
  shares JSONB,
  claimed_by JSONB,
  link_code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Transactions Table
CREATE TABLE transactions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_address TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  amount TEXT NOT NULL,
  recipient TEXT,
  tx_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 5. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

---

## 🌐 Network Configuration (Injective EVM)
NinjaPay interacts automatically with the Injective EVM Testnet. If you are configuring your wallet manually, use:

- **Network Name:** inEVM Testnet
- **RPC URL:** `https://testnet.rpc.inevm.com/http`
- **Chain ID:** `2424`
- **Currency Symbol:** `INJ`
- **Block Explorer URL:** `https://testnet.explorer.injective.network`

---

## 🔐 Security & Non-Custodial Architecture

NinjaPay is **strictly non-custodial**. 
1. Your private keys never leave your device.
2. All transactions (sends, off-ramps, payrolls) are natively signed by the user via Wagmi/Viem.
3. The platform simply constructs the EVM transaction payload and broadcasts it directly to the Injective RPC.

---

## 🤝 Contributing
Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 🌍 Other Community Products
- [Injective By Examples](https://injective-by-examples.vercel.app/) - Built for the African Community for onboarding into the Injective ecosystem.

---

<div align="center">
  <p>Built for the continuous expansion of Web3 utility in Africa. ⚡</p>
</div>
