// 引入必要的庫
const { Connection, PublicKey } = require('@solana/web3.js');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

// ================= 設定區 (建議放入 .env 檔案) =================

// 1. Solana RPC 節點 (建議使用 Helius, Alchemy 或 QuickNode 的免費 API Key，公共節點容易被擋)
// 如果沒有 API Key，暫時使用公共節點，但極易 429 Too Many Requests
const SOLANA_RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';

// 2. Telegram 設定
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN';
const TG_CHAT_ID = process.env.TG_CHAT_ID || 'YOUR_CHAT_ID';

// 3. 監控的地址
const TREASURY_ADDRESS = 'SACKKQcRPAVAMVXZNLyH9avG9sdfYW2iE3Nw2te7Lj7'; // 金庫
const MINTER_ADDRESS = 'SACKsfkq2BoUELVv8PZ8LhnMfQ4rorFAJbCZWi6eVLQ';   // 發幣器

// ===============================================================

// 初始化
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
const bot = new TelegramBot(TG_BOT_TOKEN, { polling: false }); // 我們只用來發訊息，不需要接收

// 用來記錄最後處理過的交易簽名 (避免重複發送)
let lastTreasurySig = null;
let lastMinterSig = null;

console.log('🚀 Solana 監控機器人啟動中...');
console.log(`🔗 連接節點: ${SOLANA_RPC_URL}`);
console.log(`👀 監控金庫: ${TREASURY_ADDRESS}`);
console.log(`👀 監控發幣: ${MINTER_ADDRESS}`);

// 輔助函式：發送 TG 訊息
async function sendTelegramAlert(message) {
    try {
        await bot.sendMessage(TG_CHAT_ID, message, { parse_mode: 'HTML', disable_web_page_preview: true });
        console.log('✅ TG 訊息已發送');
    } catch (error) {
        console.error('❌ 發送 TG 失敗:', error.message);
    }
}

// 輔助函式：縮短地址顯示
const shortAddr = (addr) => `${addr.slice(0, 4)}...${addr.slice(-4)}`;

// -------------------------------------------------------------
// 核心邏輯 1: 監控金庫 (接收 SOL)
// -------------------------------------------------------------
async function checkTreasury() {
    try {
        const pubKey = new PublicKey(TREASURY_ADDRESS);
        
        // 獲取最近的交易簽名
        const signatures = await connection.getSignaturesForAddress(pubKey, { limit: 5 });
        
        if (signatures.length === 0) return;

        // 如果是第一次運行，只記錄最新的一筆，不發通知，避免刷屏
        if (!lastTreasurySig) {
            lastTreasurySig = signatures[0].signature;
            return;
        }

        // 找出比上次記錄更新的交易
        const newSigs = [];
        for (let sigInfo of signatures) {
            if (sigInfo.signature === lastTreasurySig) break;
            newSigs.push(sigInfo);
        }

        // 從舊到新處理
        for (let sigInfo of newSigs.reverse()) {
            console.log(`🔍 檢測到金庫新交易: ${sigInfo.signature}`);
            
            // 獲取交易詳細內容
            const tx = await connection.getParsedTransaction(sigInfo.signature, {
                maxSupportedTransactionVersion: 0
            });

            if (!tx) continue;

            // 分析餘額變化 (這是最準確判斷是否收到錢的方法)
            const accountIndex = tx.transaction.message.accountKeys.findIndex(
                k => k.pubkey.toBase58() === TREASURY_ADDRESS
            );

            if (accountIndex !== -1) {
                const preBalance = tx.meta.preBalances[accountIndex];
                const postBalance = tx.meta.postBalances[accountIndex];
                const diff = postBalance - preBalance; // 單位是 lamports

                // 只有當餘額增加 (收到錢) 時才通知
                if (diff > 0) {
                    const solAmount = diff / 1e9; // 轉換為 SOL
                    const sender = tx.transaction.message.accountKeys[0].pubkey.toBase58(); // 通常第一個是付款人(Payer)

                    const msg = `
💰 <b>金庫收到款項！</b>

<b>金額:</b> ${solAmount.toFixed(4)} SOL
<b>來自:</b> <a href="https://solscan.io/account/${sender}">${shortAddr(sender)}</a>
<b>交易:</b> <a href="https://solscan.io/tx/${sigInfo.signature}">Solscan Link</a>
`;
                    await sendTelegramAlert(msg);
                }
            }
        }

        // 更新最後處理的簽名
        if (newSigs.length > 0) {
            lastTreasurySig = newSigs[newSigs.length - 1].signature;
        }

    } catch (error) {
        console.error('⚠️ 金庫監控錯誤:', error.message);
    }
}

// -------------------------------------------------------------
// 核心邏輯 2: 監控發幣器 (SPL Token Mint/Transfer)
// -------------------------------------------------------------
async function checkMinter() {
    try {
        const pubKey = new PublicKey(MINTER_ADDRESS);
        const signatures = await connection.getSignaturesForAddress(pubKey, { limit: 5 });

        if (signatures.length === 0) return;

        if (!lastMinterSig) {
            lastMinterSig = signatures[0].signature;
            return;
        }

        const newSigs = [];
        for (let sigInfo of signatures) {
            if (sigInfo.signature === lastMinterSig) break;
            newSigs.push(sigInfo);
        }

        for (let sigInfo of newSigs.reverse()) {
            console.log(`🔍 檢測到發幣器新交易: ${sigInfo.signature}`);

            const tx = await connection.getParsedTransaction(sigInfo.signature, {
                maxSupportedTransactionVersion: 0
            });

            if (!tx) continue;

            // 我們需要尋找 "mintTo" 或者是代幣轉帳的指令
            // 遍歷所有內部指令尋找 Token Program 的操作
            let actions = [];

            // 檢查主指令和內部指令 (Inner Instructions)
            // 簡化邏輯：檢查 Token Balances 的變化
            // 如果某個非發幣器地址的 Token 餘額增加了，且發幣器參與了交易，通常意味著發幣或轉幣
            
            const preTokenBalances = tx.meta.preTokenBalances || [];
            const postTokenBalances = tx.meta.postTokenBalances || [];

            // 找出誰的代幣餘額增加了 (接收者)
            postTokenBalances.forEach(post => {
                const owner = post.owner;
                // 排除掉發幣器自己 (如果是自己轉給自己)
                if (owner === MINTER_ADDRESS) return;

                // 找到對應的 preBalance
                const pre = preTokenBalances.find(p => p.accountIndex === post.accountIndex);
                const preAmount = pre ? pre.uiTokenAmount.uiAmount : 0;
                const postAmount = post.uiTokenAmount.uiAmount;

                if (postAmount > preAmount) {
                    const amount = postAmount - preAmount;
                    const mint = post.mint;
                    
                    // 檢查這筆交易是否真的由發幣器發起或簽名 (確保是我們監控的對象做的)
                    const isSigner = tx.transaction.message.accountKeys.some(
                        k => k.pubkey.toBase58() === MINTER_ADDRESS && k.signer
                    );

                    // 只有當發幣器是簽署者(Signer)或者是付款人，才視為發幣器發出的動作
                    if (isSigner) {
                        actions.push({
                            recipient: owner,
                            amount: amount,
                            mint: mint
                        });
                    }
                }
            });

            // 發送通知
            for (let action of actions) {
                const msg = `
🖨️ <b>發幣/轉幣通知！</b>

<b>發幣器:</b> ${shortAddr(MINTER_ADDRESS)}
<b>數量:</b> ${action.amount.toLocaleString()} 
<b>代幣:</b> <a href="https://solscan.io/token/${action.mint}">${shortAddr(action.mint)}</a>
<b>接收者:</b> <a href="https://solscan.io/account/${action.recipient}">${shortAddr(action.recipient)}</a>
<b>交易:</b> <a href="https://solscan.io/tx/${sigInfo.signature}">Solscan Link</a>
`;
                await sendTelegramAlert(msg);
            }
        }

        if (newSigs.length > 0) {
            lastMinterSig = newSigs[newSigs.length - 1].signature;
        }

    } catch (error) {
        console.error('⚠️ 發幣器監控錯誤:', error.message);
    }
}

// -------------------------------------------------------------
// 主迴圈
// -------------------------------------------------------------
async function main() {
    // 初次執行先獲取當前最新狀態，不發通知
    console.log('⏳ 初始化狀態...');
    try {
        const tSigs = await connection.getSignaturesForAddress(new PublicKey(TREASURY_ADDRESS), { limit: 1 });
        if (tSigs.length > 0) lastTreasurySig = tSigs[0].signature;

        const mSigs = await connection.getSignaturesForAddress(new PublicKey(MINTER_ADDRESS), { limit: 1 });
        if (mSigs.length > 0) lastMinterSig = mSigs[0].signature;
        
        console.log('✅ 初始化完成，開始監控...');
        
        // 設定輪詢間隔 (例如每 10 秒檢查一次)
        setInterval(async () => {
            await checkTreasury();
            await checkMinter();
        }, 10000); // 10000 ms = 10秒

    } catch (e) {
        console.error('初始化失敗:', e);
    }
}

main();