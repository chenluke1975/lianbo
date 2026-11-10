# 連撥 Lianbo

忙線就再打。「連撥」是一個 Android 上的自動重撥小幫手：記住號碼、幫你數撥了幾通，並在每通之間倒數，讓你一通接一通撥到有人接為止。

- 每一通都是你親手點一下才撥出，交給手機內建的電話 App（不需要「直接撥打電話」權限）
- 從電話回到 App 會自動倒數（3／5／10／15／30 秒）
- 次數上限 5／10／20／50 或不限，記錄每通結果（忙線、沒人接、語音、接通）
- 倒數結束有提示音與震動，連撥期間螢幕保持常亮
- 擋下 110、119、112 等緊急專線
- **完全離線**：沒有帳號、沒有伺服器、沒有廣告、沒有追蹤或分析；資料只存在手機裡（WebView localStorage）

授權：[MIT](LICENSE) © 2026 Luke Chen

## 技術架構

- 網頁介面：Vite + React + TypeScript + Tailwind CSS（`src/`），建置成純靜態檔 `dist/`
- Android 外殼：[Capacitor](https://capacitorjs.com/)（Apache-2.0），`android/` 專案直接放在版本庫中
- 外掛：`@capacitor/app`（從電話返回時觸發倒數）、`@capacitor-community/keep-awake`（螢幕常亮）
- 不含任何 Google Play Services／Firebase；字型 Fraunces 隨 App 打包（`@fontsource/fraunces`，OFL），中文使用系統內建 Noto Sans CJK
- 撥號：按鈕是 `tel:` 連結，Capacitor 會把非 App 網址交給 Android `ACTION_VIEW`，因此會開啟系統撥號畫面

## 建置

需要 Node.js ≥ 22、JDK 21、Android SDK（platform 36、build-tools 36）。

```bash
npm ci
npm run build            # 產生 dist/
npx cap sync android     # 複製 dist/ 到 android/ 並更新外掛
cd android && ./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

只想在瀏覽器試用：`npm run dev`。

## 更換 appId（套件名稱）

預設是 `io.github.chenluke1975.lianbo`，應該對應原始碼放的位置（F-Droid 慣例）：

| 原始碼位置 | appId |
| --- | --- |
| github.com/&lt;帳號&gt;/lianbo | `io.github.<帳號>.lianbo` |
| codeberg.org/&lt;帳號&gt;/lianbo | `org.codeberg.<帳號>.lianbo` |
| gitlab.com/&lt;帳號&gt;/lianbo | `io.gitlab.<帳號>.lianbo` |

一行完成：`scripts/set-app-id.sh io.github.<帳號>.lianbo && npm run cap:sync`。**上架後就不能再改。**

## 發新版

1. 改 `package.json` 的 `version`、`android/app/build.gradle` 的 `versionCode`（+1）與 `versionName`
2. 新增 `fastlane/metadata/android/{zh-TW,en-US}/changelogs/<versionCode>.txt`
3. commit 後打 tag `vX.Y.Z` 並推上去，F-Droid 會依 tag 自動抓新版

## F-Droid

- 上架說明與截圖：`fastlane/metadata/android/`
- 給 [fdroiddata](https://gitlab.com/fdroid/fdroiddata) 的草稿：`fdroid/metadata/io.github.chenluke1975.lianbo.yml`

---

## English

**Lianbo (連撥)** is a small, fully offline redial helper for Android. Enter a number, tap to dial (your phone's own dialer places the call), and when you come back it counts down to the next attempt, tracks how many times you've tried and the outcome of each call. No account, no network, no ads, no tracking. UI is in Traditional Chinese (Taiwan).

Built with Vite + React + Tailwind, wrapped with Capacitor. Build: `npm ci && npm run build && npx cap sync android && cd android && ./gradlew assembleDebug` (Node ≥ 22, JDK 21, Android SDK 36).

License: MIT © 2026 Luke Chen
