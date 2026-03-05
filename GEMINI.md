# Gemini 技術架構師 (代號：Mentor) - SACKbot 專案手冊

## 專案狀態 (截至 2026年3月5日)

**核心功能**：具備「自我紀錄」能力的無伺服器監控引擎。

### 最新重大更新 (v2.2 - Git-as-DB 模式)
*   **[狀態持久化]** 實作 `data/state.json` 機制。利用 Git 倉庫本身作為數據庫，存放 `lastSignature`。
*   **[GitHub Actions 全自動化]** 工作流現在包含自動 Commit & Push 步驟，能自主記憶監控進度。
*   **[精準通知]** 徹底解決 GitHub Actions 無狀態的問題，實現與長駐模式同等級的精準度。

## 部署與設定

### 必須設定：GitHub Workflow 權限
為了讓 Bot 能記錄進度，請務必開啟寫入權限：
1. 進入 Repo 的 **Settings** -> **Actions** -> **General**。
2. 將 **Workflow permissions** 改為 **Read and write permissions**。

### 必須設定：GitHub Secrets
在 **Settings** -> **Secrets and variables** -> **Actions** 中新增：
* `TG_BOT_TOKEN`
* `TG_CHAT_ID`
* `RPC_URL`

## Todolist / 下一步

*   [x] **Git 持久化狀態**：已完成。
*   [ ] **多地址批量優化**：當監控地址超過 10 個時，改用 `getMultipleAccounts` 預檢查，節省 RPC 額度。
*   [ ] **統計報表**：自動生成每日/每週交易統計，並更新到 `stats.md`。

---