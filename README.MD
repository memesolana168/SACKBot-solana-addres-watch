Solana 地址監控機器人

這是一個使用 Node.js 編寫的程式，用於監控指定的 Solana 地址異動，並透過 Telegram 發送通知。

功能

金庫監控: 當 SACK...Lj7 收到 SOL 時，通知來源地址與金額。

發幣監控: 當 SACK...VLQ 進行發幣或轉幣操作時，通知代幣種類、數量與接收者。

前置準備

安裝 Node.js (建議版本 v16 以上)。

建立一個 Telegram Bot 並取得 Bot Token 與 Chat ID。

(強烈建議) 申請一個免費的 Solana RPC URL (如 Helius 或 Alchemy)，因為公共節點很不穩定。

安裝步驟

下載本專案所有檔案到同一個資料夾。

開啟終端機 (Terminal) 或命令提示字元 (CMD)，進入該資料夾。

安裝依賴套件：

npm install


設定與執行

方法 A: 直接修改程式碼

打開 monitor.js，找到最上方的設定區，填入您的資訊：

const SOLANA_RPC_URL = '您的 RPC URL'; // 例如 [https://mainnet.helius-rpc.com/](https://mainnet.helius-rpc.com/)...
const TG_BOT_TOKEN = '您的 Telegram Bot Token';
const TG_CHAT_ID = '您的 Chat ID';


方法 B: 使用環境變數 (.env) - 推薦

在專案根目錄建立一個名為 .env 的檔案，填入內容：

RPC_URL=[https://api.mainnet-beta.solana.com](https://api.mainnet-beta.solana.com)
TG_BOT_TOKEN=123456:ABC-DEF...
TG_CHAT_ID=-100123456789


啟動程式

npm start


或是

node monitor.js


程式啟動後，當監控的地址發生交易時，您的 Telegram 就會收到通知。

常見問題

錯誤 429 Too Many Requests: 這表示您使用的 RPC 節點請求太頻繁。請將 monitor.js 中的輪詢時間 (setInterval) 從 10000 (10秒) 改長一點，或者使用付費/專屬的 RPC URL。

沒有收到通知: 程式只會通知「新」的交易。請嘗試轉入極小額的 SOL (例如 0.001 SOL) 到金庫地址進行測試。