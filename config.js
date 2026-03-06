/**
 * SACKbot 配置檔案 (v2.3 智能地址簿版)
 */

module.exports = {
    interval: 60000,

    // 🏆 智能地址簿 (Address Book)
    // 這裡定義了「熟人地址」，可以控制是否警報以及如何顯示
    addressBook: [
        {
            address: 'SACKKQcRPAVAMVXZNLyH9avG9sdfYW2iE3Nw2te7Lj7',
            label: '金庫 (Treasury)',
            category: 'INTERNAL',
            silent: true,      // true = 完全不發出通知 (安靜模式)
            emoji: '🏦'
        },
        {
            address: 'SACKsfkq2BoUELVv8PZ8LhnMfQ4rorFAJbCZWi6eVLQ',
            label: '發幣器 (Minter)',
            category: 'INTERNAL',
            silent: false,     // false = 要通知，但會加上 [內部] 標籤
            emoji: '🖨️'
        },
        {
            address: 'Sack7bZAMtwVU1ceMwV6V293GXCyBtkhQNYYUGAWMqu',
            label: 'SACK 代幣',
            category: 'TOKEN',
            silent: false,
            emoji: '💎'
        }
        // ,
        // {
        //     address: '5sgFJxh1oewHjBvnkRY9qMau8pCLDfxCzFjCMJAGKke5',
        //     label: '大莊家 A',
        //     category: 'WHALE',
        //     silent: false,
        //     emoji: '🐋'
        // }
    ],

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
            name: 'SACK/sol 交易',
            address: 'Sack7bZAMtwVU1ceMwV6V293GXCyBtkhQNYYUGAWMqu',
            type: 'SWAP',
            minUSD: 0,
        },
        {
            name: 'SACK/usdc 交易',
            address: 'f25uh5ravdhbd7phlxprtpjnrpann4qcrsvvm2a8cb4',
            type: 'SWAP',
            minUSD: 0,
        },
        {
            name: 'GEOD 交易',
            address: '5sgFJxh1oewHjBvnkRY9qMau8pCLDfxCzFjCMJAGKke5',
            type: 'SOL_TRANSFER',
            minUSD: 20,
        }
    ]
};