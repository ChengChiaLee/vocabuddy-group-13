## 【VocaBuddy 分組作業】

組別：第 13 組  
組員姓名：黃柏諺、林子博、高大崴、潘鈺程、李承嘉  
組員 GitHub 帳號：@Bryan0324、@kohiro961021、@Okowa0814、@Cheng-0928、@ChengChiaLee  

Repository 網址：  
https://github.com/Okowa0814/vocabuddy-group-13  

Colab 網址：  
https://colab.research.google.com/github/Okowa0814/vocabuddy-group-13/blob/main/VocaBuddy.ipynb  

本組新增的單字：  
`algorithm（演算法）`、`data structure（資料結構）`、`time complexity（時間複雜度）`、`space complexity（空間複雜度）`、`recursion（遞迴）`、`dynamic programming（動態規劃）`、`greedy algorithm（貪婪演算法）`、`binary search（二分搜尋）`、`depth-first search（深度優先搜尋）`、`breadth-first search（廣度優先搜尋）`、`graph theory（圖論）`、`shortest path（最短路徑）`、`minimum spanning tree（最小生成樹）`、`sorting（排序）`、`pointer（指標）`、`array（陣列）`、`linked list（鏈結串列）`、`stack（堆疊）`、`queue（佇列）`、`hash table（雜湊表）`  

本組新增的功能：  
- 隨機選擇英文單字出題
- 產生中文四選一答案
- 隨機排列答案選項
- 使用 A、B、C、D 作為選項標籤
- 接收使用者輸入答案
- 自動判斷答案是否正確
- 顯示答題結果
- 答錯時顯示正確答案
- 預設進行 10 題測驗
- 統計答對題數
- 顯示測驗準確率
- 支援透過 JSON 擴充單字內容

組員分工：
1. @kao.okowa ：建立 Repository 與邀請 Collaborators
2. @grass.cat_www ：修改 colab 使其能運作
3. @cheng0928 ：新增單字

繳交者： @grass.cat_www

---

## YTP VocaBuddy 網頁版

完整 React/Vite 網頁版已加入本資料夾內的 Git 儲存庫 `vocabuddy-group-13/`，原始分組作業、Python notebook 與單字 JSON 均保留。

先安裝 Node.js 22.12 以上版本（或 20.19 以上的 Node.js 20），在目前資料夾執行：

```bash
npm install
npm run dev
```

開啟終端機顯示的網址，預設為 `http://127.0.0.1:5173`。外層指令會自動轉交給內層應用程式。也可直接進入 `vocabuddy-group-13/` 執行相同指令。

`npm test` 執行邏輯測試；`npm run build` 建立正式版；`npm run preview` 預覽正式版。

提供四評分 SRS 間隔複習、四選一／拼字／聽力測驗、自訂匯入、搜尋、發音與新版 localStorage 進度保存。選用 AI 情境例句支援難度、用法說明、離線快取與安全的伺服器端介面；未設定服務時不會呼叫模型。

`npm run serve` 可在正式建置後，以本機 Node 服務提供網站及選用 AI 端點。詳細排程演算法、舊進度遷移、金鑰設定及測試方式皆記錄於內層 README。

完整使用方式、快捷鍵、資料儲存說明及選用 AI 後端介面，請見 [網頁版 README](vocabuddy-group-13/README.md)。
