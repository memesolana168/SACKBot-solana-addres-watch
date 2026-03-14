/**
 * SACKbot - 通用型 Solana 監控引擎 (v2.6 終極版)
 * Mentor 觀點：實現了 Mint 地址全域監控，支援所有 DEX 池子與 P2P 轉帳。
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

const AddressBookService = {
    get(address) {
        return CONFIG.addressBook.find(a => a.address === address) || null;
    },
    format(address) {
        const entry = this.get(address);
        if (!entry) return `<code>${address.slice(0, 4)}...${address.slice(-4)}</code>`;
        const prefix = entry.category === 'INTERNAL' ? '[內部] ' : (entry.category === 'WHALE' ? '[巨鯨] ' : '');
        return `<b>${prefix}${entry.emoji} ${entry.label}</b>`;
    }
};

const StateService = {
    data: {},
    load() {
        try {
            if (fs.existsSync(STATE_FILE)) {
                this.data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
            }
        } catch (e) { console.error('[State] 載入失敗', e.message); }
    },
    save() {
        try {
            if (!fs.existsSync(path.dirname(STATE_FILE))) fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
            fs.writeFileSync(STATE_FILE, JSON.stringify(this.data, null, 2));
        } catch (e) { console.error('[State] 儲存失敗', e.message); }
    }
};

const PriceService = {
    solPrice: 0,
    async updatePrice() {
        try {
            const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
            const data = await res.json();
            this.solPrice = data.solana.usd;
            return this.solPrice;
        } catch (e) { return this.solPrice || 150; }
    }
};

const NotifyService = {
    async send(htmlMessage) {
        try {
            await tgBot.sendMessage(ENV.tgChatId, htmlMessage, { parse_mode: 'HTML', disable_web_page_preview: true });
        } catch (e) { console.error('[Notify] 發送失敗', e.message); }
    }
};

// ================= 核心引擎 =================

class MonitorEngine {
    constructor() {
        this.newSignaturesFound = false;
        this.WSOL = 'So11111111111111111111111111111111111111112';
        this.USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
        this.USDT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
        this.DEX_PROGRAMS = [
            '675k1q2WmJAgD2uVPN87qc6pBaC46u7Z4j9fF974Wve', // Raydium
            '5quBuc3SSTU6MDM2uXueZafChJbR49E6qn86v5LqNdwV', // Raydium CPMM
            'JUP6LkbZbjS1jKKpphs6U1f3pPs7d4YfB385yLq8B3r', // Jupiter
            '6EF8rrecthR5DkwiPGXnTXJXzbcC3MTY77MqeTGLqmfL', // Pump.fun
            'MoonCVVgeJuyYncRE2hf9DSeb1MiCc78h77zBDeuob2', // Moonshot
            'whirLbMiicVdio4nUfT5MB768CC8MRShPkYxpQidD4g', // Orca
            '2wTebS75LSEuMuLZpZAVvQQL7gNInS6pDCNYAnF6Xy7o'  // Meteora
        ];
    }

    async init() {
        console.log(`🚀 SACKbot v2.6 啟動 (全域 Mint 監控模式)`);
        StateService.load();
        await PriceService.updatePrice();
        
        for (const task of CONFIG.tasks) {
            try {
                if (!task.address || task.address.length < 32) {
                    throw new Error(`地址長度不足或為空: ${task.address}`);
                }
                
                const pubKey = new PublicKey(task.address);
                if (!StateService.data[task.address]) {
                    console.log(`[Init] 正在追蹤新地址: ${task.name}...`);
                    const sigs = await connection.getSignaturesForAddress(pubKey, { limit: 1 });
                    if (sigs.length > 0) StateService.data[task.address] = sigs[0].signature;
                }
            } catch (e) {
                console.error(`\n❌ [Init] 任務 "${task.name}" 地址無效，已自動跳過！`);
                console.error(`   原因: ${e.message}`);
                console.error(`   提示: 請檢查地址是否包含非法字元 (0, O, I, l) 或長度是否正確。\n`);
                // 標記為無效，避免 processTask 再次報錯
                task.invalid = true;
            }
        }
    }

    async run() {
        console.log(`\n--- 掃描中 (${new Date().toLocaleTimeString()}) ---`);
        await PriceService.updatePrice();
        for (const task of CONFIG.tasks) {
            if (task.invalid) continue; // 跳過無效地址
            await this.processTask(task);
        }
        if (this.newSignaturesFound) StateService.save();
    }

    async processTask(task) {
        try {
            const pubKey = new PublicKey(task.address);
            const signatures = await connection.getSignaturesForAddress(pubKey, { 
                limit: 50, 
                until: StateService.data[task.address] 
            });

            if (signatures.length === 0) return;
            StateService.data[task.address] = signatures[0].signature;
            this.newSignaturesFound = true;

            for (const sigInfo of signatures.reverse()) {
                await this.handleTransaction(task, sigInfo.signature);
            }
        } catch (e) { console.error(`[Task] ${task.name} 錯誤:`, e.message); }
    }

    async handleTransaction(task, signature) {
        try {
            const tx = await connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 });
            if (!tx || !tx.meta) return;

            const payer = tx.transaction.message.accountKeys[0].pubkey.toBase58();
            const payerInfo = AddressBookService.get(payer);
            if (payerInfo && payerInfo.silent) return;

            // 分流處理不同任務類型
            if (task.type === 'SWAP') {
                await this.analyzeSwap(task, tx, signature, payer);
            } else if (task.type === 'TOKEN_OUTFLOW') {
                await this.processTokenOutflow(task, tx, signature);
            } else if (task.type === 'SOL_INFLOW' || task.type === 'SOL_TRANSFER') {
                const accountIndex = tx.transaction.message.accountKeys.findIndex(k => k.pubkey.toBase58() === task.address);
                if (accountIndex !== -1) {
                    const diff = (tx.meta.postBalances[accountIndex] - tx.meta.preBalances[accountIndex]) / 1e9;
                    if (Math.abs(diff) > 0.001) await this.notifyTransfer(task, diff, payer, signature);
                }
            }
        } catch (e) { console.error(`[TX] 失敗 ${signature.slice(0, 8)}:`, e.message); }
    }

    async processTokenOutflow(task, tx, signature) {
        const preToken = tx.meta.preTokenBalances || [];
        const postToken = tx.meta.postTokenBalances || [];
        
        // 找出誰是接收者 (餘額增加了，且不是監控地址本人)
        for (const post of postToken) {
            if (post.owner === task.address) continue;
            
            const pre = preToken.find(p => p.accountIndex === post.accountIndex && p.mint === post.mint);
            const preAmt = pre ? (pre.uiTokenAmount.uiAmount || 0) : 0;
            const postAmt = post.uiTokenAmount.uiAmount || 0;
            
            if (postAmt > preAmt) {
                const amount = postAmt - preAmt;
                const tokenSymbol = task.name.split(' ')[0] || post.mint.slice(0, 4);
                const recipient = AddressBookService.format(post.owner);
                
                const msg = `<b>📦 ${task.name} 代幣流出</b>\n━━━━━━━━━━━━━━━━━━\n<b>行為:</b> 🏗️ 分發代幣\n<b>數量:</b> ${amount.toLocaleString()} ${tokenSymbol}\n<b>接收者:</b> ${recipient}\n<b>交易:</b> <a href="https://solscan.io/tx/${signature}">Solscan</a>`;
                await NotifyService.send(msg);
            }
        }
    }

    async analyzeSwap(task, tx, signature, payer) {
        const preToken = tx.meta.preTokenBalances || [];
        const postToken = tx.meta.postTokenBalances || [];
        
        // 1. 檢測目標代幣變動 (鎖定 payer)
        const getBal = (list, mint, owner) => list.filter(b => b.mint === mint && b.owner === owner).reduce((s, b) => s + (b.uiTokenAmount.uiAmount || 0), 0);
        
        const targetDiff = getBal(postToken, task.address, payer) - getBal(preToken, task.address, payer);
        if (Math.abs(targetDiff) < 0.000001) return;

        // 2. 檢測對價價值 (SOL/USDC/USDT)
        let usdValue = 0;
        let valueText = '';

        const wsolDiff = Math.abs(getBal(postToken, this.WSOL, payer) - getBal(preToken, this.WSOL, payer));
        const usdcDiff = Math.abs(getBal(postToken, this.USDC, payer) - getBal(preToken, this.USDC, payer));
        const usdtDiff = Math.abs(getBal(postToken, this.USDT, payer) - getBal(preToken, this.USDT, payer));

        if (usdcDiff > 0.1 || usdtDiff > 0.1) {
            usdValue = usdcDiff || usdtDiff;
            valueText = `$${usdValue.toFixed(2)} ${usdcDiff > 0 ? 'USDC' : 'USDT'}`;
        } else {
            // 如果沒有 WSOL 變動，檢查原生 SOL
            const nativeDiff = Math.abs(tx.meta.postBalances[0] - tx.meta.preBalances[0]) / 1e9;
            const solAmount = wsolDiff > 0.001 ? wsolDiff : (nativeDiff > 0.005 ? nativeDiff : 0);
            usdValue = solAmount * PriceService.solPrice;
            valueText = `${solAmount.toFixed(3)} SOL (~$${usdValue.toFixed(2)})`;
        }

        if (task.minUSD > 0 && usdValue < task.minUSD) return;

        const isBuy = targetDiff > 0;
        const isDex = tx.transaction.message.accountKeys.some(k => this.DEX_PROGRAMS.includes(k.pubkey.toBase58()));
        
        const tokenLabel = task.name.split(' ')[0] || 'Token';
        const msg = `<b>${isBuy ? '📈' : '📉'} ${tokenLabel} ${isBuy ? '買入' : '賣出'}</b>\n━━━━━━━━━━━━━━━━━━\n<b>玩家:</b> ${AddressBookService.format(payer)}\n<b>數量:</b> ${Math.abs(targetDiff).toLocaleString()} ${tokenLabel}\n<b>對價:</b> ${valueText}\n<b>類型:</b> ${isDex ? 'DEX 交易' : '直接轉帳'}\n<b>交易:</b> <a href="https://solscan.io/tx/${signature}">Solscan</a>`;
        
        await NotifyService.send(msg);
    }

    async notifyTransfer(task, diff, payer, signature) {
        if (task.type === 'SOL_INFLOW' && diff < 0) return;
        
        const usdValue = Math.abs(diff) * PriceService.solPrice;
        
        // 🚀 修正點：加入 minUSD 過濾
        if (task.minUSD > 0 && usdValue < task.minUSD) return;

        const msg = `<b>${task.name}</b>\n━━━━━━━━━━━━━━━━━━\n<b>類型:</b> ${diff > 0 ? '📥 收到 SOL' : '📤 支出 SOL'}\n<b>金額:</b> ${Math.abs(diff).toFixed(3)} SOL (~$${usdValue.toFixed(2)})\n<b>對手:</b> ${AddressBookService.format(payer)}\n<b>交易:</b> <a href="https://solscan.io/tx/${signature}">Solscan</a>`;
        await NotifyService.send(msg);
    }
}

async function main() {
    const engine = new MonitorEngine();
    await engine.init();
    if (IS_ACTIONS) await engine.run();
    else setInterval(() => engine.run(), ENV.interval);
}
main();
