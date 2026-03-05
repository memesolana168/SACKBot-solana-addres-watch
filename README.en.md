# 🚀 SACKbot - Smart Solana Monitor (v2.2)

English | [繁體中文](./README.MD)

SACKbot is a powerful and easy-to-use Solana blockchain monitoring tool. It tracks SOL movement, token distribution, and DEX trades (Buy/Sell) for specific wallet addresses and sends real-time alerts to your Telegram channel.

## ✨ Core Features

- 🛠️ **Minimalist Config**: Manage all monitoring tasks in a single file: `config.js`.
- 💰 **Value Filtering**: Set custom USD thresholds to filter out dust and capture only high-value transfers.
- ☁️ **Zero-Cost Deployment**: Seamlessly integrated with GitHub Actions—run 24/7 for free without any server.
- 🧠 **Auto-Memory**: Uses Git-as-DB technology to automatically record scan progress, ensuring no missed or duplicate alerts.
- 📈 **Multiple Modes**: Supports SOL transfers, Token distribution, and Raydium/DEX trade monitoring.

---

## 🛠️ Quick Start (GitHub Actions Deployment)

This is the recommended deployment method—fully free and maintenance-free.

### Step 1: Fork or Download
Fork this repository to your GitHub account.

### Step 2: Configure Targets (`config.js`)
Edit `config.js` to add your target addresses and USD thresholds:

```javascript
tasks: [
  {
    name: '🐋 Whale Monitor',
    address: 'Wallet_Address_Here',
    type: 'SOL_TRANSFER',
    minUSD: 500, // Notify only for transactions > $500
  }
]
```

### Step 3: Set Secrets (Telegram & RPC)
Go to your GitHub Repository -> **Settings** -> **Secrets and variables** -> **Actions**, and add these three **Repository secrets**:

1.  `TG_BOT_TOKEN`: Your Telegram Bot Token.
2.  `TG_CHAT_ID`: Your target Channel or Chat ID.
3.  `RPC_URL`: Recommended to use private endpoints from [Helius](https://www.helius.dev/) or [QuickNode](https://www.quicknode.com/).

### Step 4: Enable Write Permissions (CRITICAL!)
For the bot to record its progress, you MUST:
1. Go to **Settings** -> **Actions** -> **General**.
2. Scroll to the bottom to **Workflow permissions**.
3. Select **Read and write permissions** and click **Save**.

---

## 🤖 How to get Telegram Settings?

### 1. Get `TG_BOT_TOKEN`
- Search for [@BotFather](https://t.me/botfather) on Telegram.
- Type `/newbot` and follow the instructions.
- You will receive a token like `123456:ABC-DEF...`.

### 2. Get `TG_CHAT_ID`
- Add your bot to a group or channel as an admin.
- Send a test message.
- Search for [@userinfobot](https://t.me/userinfobot) or visit `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` to find the `chat.id`.

---

## 💻 Local Execution (Long-running)

If you prefer millisecond-level real-time monitoring:

1. Setup: `npm install`
2. Copy `.env.example` to `.env` and fill in your credentials.
3. Start: `npm start`

---

## 📜 License
This project is open-source under the MIT License.

---
*Designed by Gemini Technical Architect (Mentor)*
