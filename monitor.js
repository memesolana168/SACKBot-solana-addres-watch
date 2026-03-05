/**
 * SACKbot - Solana 監控機器人 (GitHub Actions + Git-as-DB 版)
 * Mentor 觀點：利用 Git 本身來存放狀態，極致的低成本解決方案
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const CONFIG = require('./config');

// ================= 環境設定 =================

const STATE_FILE = path.join(__dirname, 'data', 'state.json');
const IS_ACTIONS = process.env.GITHUB_ACTIONS === 'true';
const ENV = {
    rpcUrl: process.env.RPC_URL || 'https://api.mainnet-beta.solana.com',
    tgToken: process.env.TG_BOT_TOKEN,
    tgChatId: process.env.TG_CHAT_ID,
    interval: parseInt(process.env.POLLING_INTERVAL || CONFIG.interval, 10),
};

const tgBot = new TelegramBot(ENV.tgToken);
const connection = new Connection(ENV.rpcUrl, 'confirmed');

// ================= 服務模組 =================

const StateService = {
    data: {},
    load() {
        try {
            if (fs.existsSync(STATE_FILE)) {
                this.data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
            }
        } catch (e) {
            console.error('[State] 讀取失敗', e.message);
        }
    },
    save() {
        try {
            if (!fs.existsSync(path.dirname(STATE_FILE))) {
                fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
            }
            fs.writeFileSync(STATE_FILE, JSON.stringify(this.data, null, 2));
            console.log('[State] 狀態已儲存');
        } catch (e) {
            console.error('[State] 儲存失敗', e.message);
        }
    }
};

const PriceService = {
    solPrice: 0,
    lastUpdate: 0,
    async updatePrice() {
        const now = Date.now();
        if (now - this.lastUpdate < 300000 && this.solPrice > 0) return this.solPrice;
        try {
            const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const data = await res.json();
            this.solPrice = data.solana.usd;
            this.lastUpdate = now;
            console.log(`[Price] 當前 SOL 價格: $${this.solPrice}`);
            return this.solPrice;
        } catch (e) {
            console.error('[Price] 獲取價格失敗', e.message);
            return this.solPrice || 150;
        }
    }
};

const NotifyService = {
    async send(htmlMessage) {
        try {
            await tgBot.sendMessage(ENV.tgChatId, htmlMessage, { 
                parse_mode: 'HTML', 
                disable_web_page_preview: true 
            });
        } catch (e) {
            console.error('[Notify] 發送失敗', e.message);
        }
    }
};

// ================= 核心引擎 =================

class MonitorEngine {
    constructor() {
        this.newSignaturesFound = false;
    }

    async init() {
        console.log(`🚀 SACKbot 啟動... (${IS_ACTIONS ? 'Actions 模式' : '長駐模式'})`);
        StateService.load();
        await PriceService.updatePrice();
        
        // 如果是長駐模式且沒有紀錄，先抓取初始值
        if (!IS_ACTIONS) {
            for (const task of CONFIG.tasks) {
                if (!StateService.data[task.address]) {
                    try {
                        const sigs = await connection.getSignaturesForAddress(new PublicKey(task.address), { limit: 1 });
                        if (sigs.length > 0) StateService.data[task.address] = sigs[0].signature;
                    } catch (e) {
                        console.error(`[Init] ${task.name} 初始化失敗`, e.message);
                    }
                }
            }
        }
    }

    async run() {
        console.log(`\n--- 掃描開始 (${new Date().toLocaleTimeString()}) ---`);
        await PriceService.updatePrice();

        for (const task of CONFIG.tasks) {
            await this.processTask(task);
        }

        // 如果在 Actions 模式下發現新交易，儲存狀態以便後續 Commit
        if (IS_ACTIONS && this.newSignaturesFound) {
            StateService.save();
        }
    }

    async processTask(task) {
        try {
            const pubKey = new PublicKey(task.address);
            const lastSig = StateService.data[task.address];
            
            const signatures = await connection.getSignaturesForAddress(pubKey, { 
                limit: 10,
                until: lastSig
            });

            if (signatures.length === 0) return;

            // 更新最後處理的簽名
            StateService.data[task.address] = signatures[0].signature;
            this.newSignaturesFound = true;

            const filteredSigs = signatures.reverse(); // 由舊到新處理

            console.log(`[Task] ${task.name} 檢測到 ${filteredSigs.length} 筆新交易`);

            for (const sigInfo of filteredSigs) {
                await this.handleTransaction(task, sigInfo.signature);
            }
        } catch (e) {
            console.error(`[Task] ${task.name} 執行錯誤:`, e.message);
        }
    }

    async handleTransaction(task, signature) {
        const tx = await connection.getParsedTransaction(signature, {
            maxSupportedTransactionVersion: 0
        });

        if (!tx || !tx.meta) return;

        const payer = tx.transaction.message.accountKeys[0].pubkey.toBase58();
        if (task.type === 'SWAP' && CONFIG.internalAddresses[payer]) return; 

        const solPrice = PriceService.solPrice;

        if (task.type === 'SOL_INFLOW' || task.type === 'SOL_TRANSFER') {
            await this.processSolTransfer(task, tx, signature, solPrice);
        } else if (task.type === 'TOKEN_OUTFLOW') {
            await this.processTokenOutflow(task, tx, signature);
        } else if (task.type === 'SWAP') {
            await this.processSwap(task, tx, signature, solPrice);
        }
    }

    async processSolTransfer(task, tx, signature, solPrice) {
        const accountIndex = tx.transaction.message.accountKeys.findIndex(k => k.pubkey.toBase58() === task.address);
        if (accountIndex === -1) return;

        const diff = (tx.meta.postBalances[accountIndex] - tx.meta.preBalances[accountIndex]) / 1e9;
        if (task.type === 'SOL_INFLOW' && diff <= 0) return;
        if (Math.abs(diff) < 0.001) return;

        const usdValue = Math.abs(diff) * solPrice;
        if (task.minUSD > 0 && usdValue < task.minUSD) return;

        const isIn = diff > 0;
        const sender = tx.transaction.message.accountKeys[0].pubkey.toBase58();
        const msg = `<b>${task.name}</b>\n━━━━━━━━━━━━━━━━━━\n<b>類型:</b> ${isIn ? '📥 收到 SOL' : '📤 支出 SOL'}\n<b>金額:</b> ${Math.abs(diff).toFixed(4)} SOL (~$${usdValue.toFixed(2)})\n<b>對手方:</b> <code>${sender.slice(0, 4)}...${sender.slice(-4)}</code>\n<b>交易:</b> <a href="https://solscan.io/tx/${signature}">Solscan</a>`;
        await NotifyService.send(msg);
    }

    async processTokenOutflow(task, tx, signature) {
        const preTokenBalances = tx.meta.preTokenBalances || [];
        const postTokenBalances = tx.meta.postTokenBalances || [];
        for (const post of postTokenBalances) {
            if (post.owner === task.address) continue;
            const pre = preTokenBalances.find(p => p.accountIndex === post.accountIndex);
            const preAmt = pre ? pre.uiTokenAmount.uiAmount : 0;
            const postAmt = post.uiTokenAmount.uiAmount;
            if (postAmt > preAmt) {
                const amount = postAmt - preAmt;
                const msg = `<b>${task.name}</b>\n━━━━━━━━━━━━━━━━━━\n<b>行為:</b> 🏗️ 發放代幣\n<b>數量:</b> ${amount.toLocaleString()} ${post.mint.slice(0, 4)}...\n<b>接收者:</b> <code>${post.owner.slice(0, 4)}...${post.owner.slice(-4)}</code>\n<b>交易:</b> <a href="https://solscan.io/tx/${signature}">Solscan</a>`;
                await NotifyService.send(msg);
            }
        }
    }

    async processSwap(task, tx, signature, solPrice) {
        const payer = tx.transaction.message.accountKeys[0].pubkey.toBase58();
        const solDiff = (tx.meta.postBalances[0] - tx.meta.preBalances[0]) / 1e9;
        const sackAccount = tx.meta.postTokenBalances.find(tb => tb.owner === payer && tb.mint === task.address);
        if (!sackAccount) return;
        const preSack = tx.meta.preTokenBalances.find(tb => tb.accountIndex === sackAccount.accountIndex);
        const preAmt = preSack ? preSack.uiTokenAmount.uiAmount : 0;
        const postAmt = sackAccount.uiTokenAmount.uiAmount;
        const sackDiff = postAmt - preAmt;
        if (sackDiff === 0 || solDiff === 0) return;
        const usdValue = Math.abs(solDiff) * solPrice;
        if (task.minUSD > 0 && usdValue < task.minUSD) return;
        const isBuy = sackDiff > 0;
        const msg = `<b>${isBuy ? '📈 SACK 買入' : '📉 SACK 賣出'}</b>\n━━━━━━━━━━━━━━━━━━\n<b>玩家:</b> <code>${payer.slice(0, 4)}...${payer.slice(-4)}</code>\n<b>數量:</b> ${Math.abs(sackDiff).toLocaleString()} SACK\n<b>價值:</b> ${Math.abs(solDiff).toFixed(3)} SOL (~$${usdValue.toFixed(2)})\n<b>交易:</b> <a href="https://solscan.io/tx/${signature}">Solscan</a>`;
        await NotifyService.send(msg);
    }
}

// ================= 執行啟動 =================

async function main() {
    const engine = new MonitorEngine();
    await engine.init();

    if (IS_ACTIONS) {
        await engine.run();
        console.log('✅ Actions 掃描完畢');
    } else {
        setInterval(() => engine.run(), ENV.interval);
    }
}

main();