# Environment Variables Reference Guide

## Overview
This document outlines all environment variables used in NINJA PAY and where to obtain them.

---

## Variables by Category

### 🔐 SUPABASE (Database & Authentication)
**Status:** REQUIRED  
**Used for:** User storage, claims data, transactions database

| Variable | Where to Get | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | [Supabase Dashboard](https://app.supabase.com) → Settings → API | `https://xxxxxxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | [Supabase Dashboard](https://app.supabase.com) → Settings → API | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |

**Setup Guide:**
1. Go to https://app.supabase.com
2. Create a new project (or use existing)
3. Go to Settings → API
4. Copy "Project URL" and "anon public" key

---

### 💳 PAYSTACK (Payment Processing)
**Status:** REQUIRED for off-ramp functionality  
**Used for:** Bank transfers, account name resolution, payment processing

| Variable | Where to Get | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_PAYSTACK_KEY` | [Paystack Dashboard](https://dashboard.paystack.com) → Settings → Developer | `pk_test_xxxxx...` or `pk_live_xxxxx...` |

**Setup Guide:**
1. Go to https://paystack.com
2. Sign up or log in
3. Go to Settings → Developer
4. Find "Public Key" under Test / Live keys
5. Copy your Public Key

**⚠️ Important:**
- **Test keys start with:** `pk_test_`
- **Live keys start with:** `pk_live_`
- Use test keys first, switch to live only when ready

---

### 🌐 WALLET CONNECT (Web3 Connectivity)
**Status:** REQUIRED for any deployment (the hardcoded fallback is a shared id for local development only)  
**Used for:** Mobile and QR-code wallets that connect through WalletConnect. Browser-extension wallets such as MetaMask connect without it. Add the site's domains to the project's allowlist.

| Variable | Where to Get | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_WALLETCONNECT_ID` | [WalletConnect Cloud](https://cloud.walletconnect.com) | `b56e18d47c72ab683b10814fe9495694` |

**Setup Guide:**
1. Go to https://cloud.walletconnect.com
2. Create/sign in to your account
3. Create a new project
4. Copy your Project ID
5. (Optional) Recommended for production, works without it for testing

---

### 📱 VTPASS (Bill Payments)
**Status:** OPTIONAL (has demo defaults)  
**Used for:** Airtime, data, electricity, and cable bill payments

| Variable | Where to Get | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_VTPASS_USERNAME` | [VTPass Developer Portal](https://vtpass.com/developer) | `demo` |
| `NEXT_PUBLIC_VTPASS_PASSWORD` | [VTPass Developer Portal](https://vtpass.com/developer) | `demo` |

**Setup Guide:**
1. Go to https://vtpass.com
2. Sign up or log in
3. Go to Developer → API Documentation
4. Get your API credentials
5. (Optional) Demo credentials work for testing: username=`demo`, password=`demo`

---

### ⛓️ INJECTIVE BLOCKCHAIN (Backend)
**Status:** OPTIONAL (has defaults for development)  
**Used for:** Blockchain transactions, wallet interactions, transaction settlement

| Variable | Where to Get | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_BACKEND_URL` | Your backend deployment | `http://localhost:3001` |

**Setup Guide for Development:**
1. Ensure backend server runs on `http://localhost:3001`
2. Or set to your production backend URL

**Setup Guide for Production:**
1. Deploy backend to your hosting
2. Set `NEXT_PUBLIC_BACKEND_URL` to production endpoint

---

## Environment Configuration Legend

| Symbol | Meaning |
|--------|---------|
| 🟢 REQUIRED | Must be filled for app to work properly |
| 🟡 RECOMMENDED | Should be configured for production |
| 🟢 OPTIONAL | Has defaults; can be customized |

---

## Quick Start Checklist

### Minimum Setup (Development)
- [ ] Supabase URL and Anon Key
- [ ] Paystack Public Key (test mode)

### Recommended Setup (Development + Features)
- [ ] All of the above
- [ ] WalletConnect ID
- [ ] VTPass credentials (or use demo)

### Production
- [ ] All required variables with production keys
- [ ] Paystack live keys (not test)
- [ ] Production backend URL
- [ ] Production escrow wallet address

---

## File Setup

### Create `.env.local` File

```bash
# 1. In your project root directory, create .env.local
touch .env.local

# 2. Copy the contents of .env.example
cat .env.example > .env.local

# 3. Edit and fill in your actual values
# (This file is NOT committed to git, it's local-only)
```

### Verify All Variables Are Set

```bash
# Check what's currently loaded
npm run dev  # Start dev server and check for missing variable errors
```

---

## Test Your Configuration

After setting up `.env.local`:

```bash
# Start development server
npm run dev

# Should see: "ready - started server on 0.0.0.0:3000"
# Without any "undefined" errors about environment variables
```

---

## Troubleshooting

### "NEXT_PUBLIC_SUPABASE_URL is not configured"
- ✅ Add SUPABASE_URL to `.env.local`
- ✅ Stop and restart dev server: `npm run dev`

### Account Resolution Showing "Failed to resolve account"
- ✅ Check PAYSTACK_KEY is set
- ✅ Verify it's the correct Public Key (not Secret Key)
- ✅ Ensure you're using test keys for development

### "Cannot connect to wallet"
- ✅ Try with default WalletConnect ID
- ✅ Or get your own from https://cloud.walletconnect.com

### Bills/Payment features not working
- ✅ Use demo credentials: `demo` / `demo`
- ✅ Or get real credentials from VTPass

---

## Security Best Practices

1. **NEVER commit `.env.local`** to git (it's in `.gitignore`)
2. **Use test keys in development** (pk_test_...)
3. **Use live keys in production** (pk_live_...)
4. **Rotate keys regularly** if exposed
5. **Don't share your keys** in Slack/email/issues
6. **Use `.env.example`** as documentation template

---

## Resources

- 📚 [Supabase Docs](https://supabase.com/docs)
- 📚 [Paystack Docs](https://paystack.com/docs)
- 📚 [WalletConnect Docs](https://docs.walletconnect.com/)
- 📚 [VTPass Docs](https://vtpass.com/developer)
- 📚 [Next.js Environment Variables](https://nextjs.org/docs/basic-features/environment-variables)
