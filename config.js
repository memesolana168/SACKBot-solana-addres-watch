/**
 * SACKbot 配置檔案
 * 這裡是唯一需要修改監控對象的地方
 */

module.exports = {
    // 輪詢間隔 (僅用於本地長駐模式，GitHub Actions 模式下不適用)
    interval: 60000,

    // 內部地址標籤
    internalAddresses: {
        'SACKKQcRPAVAMVXZNLyH9avG9sdfYW2iE3Nw2te7Lj7': '金庫 (Treasury)',
        'SACKsfkq2BoUELVv8PZ8LhnMfQ4rorFAJbCZWi6eVLQ': '發幣器 (Minter)',
        'Sack7bZAMtwVU1ceMwV6V293GXCyBtkhQNYYUGAWMqu': 'SACK 代幣'
    },

    // 監控任務清單
    tasks: [
        {
            name: '💰 金庫監控',
            address: 'SACKKQcRPAVAMVXZNLyH9avG9sdfYW2iE3Nw2te7Lj7',
            type: 'SOL_INFLOW',
            minUSD: 0,
        },
        {
            name: '🖨️ 發幣器動作',
            address: 'SACKsfkq2BoUELVv8PZ8LhnMfQ4rorFAJbCZWi6eVLQ',
            type: 'TOKEN_OUTFLOW',
            minUSD: 0,
        },
        {
            name: '📈 SACK 交易 ',
            address: 'Sack7bZAMtwVU1ceMwV6V293GXCyBtkhQNYYUGAWMqu',
            type: 'SWAP',
            minUSD: 0, // 只要改這裡：美金門檻
        },
        {
            name: '📈 GEOD 交易 (大額)',
            address: '5sgFJxh1oewHjBvnkRY9qMau8pCLDfxCzFjCMJAGKke5',
            type: 'SOL_TRANSFER',
            minUSD: 100, // 只要改這裡：美金門檻
        },
    ]
};