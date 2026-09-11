# 実機テスト（Chrome 拡張 / Playwright）調査レポート

Issue #8 に関連して、「タブに紐づくメモ」のタブ同一性機構を設計するにあたり、
`sessionStorage` に置いたトークンがタブの復元・再起動をまたいで生き残るかを
**自動テストで検証できるか** を調べた記録。

対象コード: `experiments/tab-identity-probe/`
実行: `cd experiments/tab-identity-probe && npm install && npm run probe`

---

## 1. 結論サマリ

| 問い | 答え |
| --- | --- |
| playwright MCP / devtools MCP で検証を自動化できるか | **このセッションでは不可**（MCP 未接続）。かつ、接続できても拡張機能テストには**向かない**（後述 §2） |
| 素の Playwright スクリプトで自動化できるか | **できる**。ただし後述の落とし穴を踏み抜く必要がある |
| フォーカスを奪わずに実行できるか | **できる**。`channel:"chromium"` + `headless:true` で拡張が動く |
| 検証したかった仮説は確認できたか | **S3・S5 とも SURVIVES**（S4 のみ測定不能） |
| で、その方式を採用するのか | **しない**。別途のストレージ調査により、動くが使うべきでないと判明（§7） |

---

## 2. MCP という選択肢について

### このセッションの状況
本セッションで利用可能な MCP サーバは BigQuery / Confluence / DesignDoc / Redash / Slack のみで、
**playwright MCP も chrome-devtools MCP も接続されていなかった**。リポジトリにも MCP 設定はない。

### 仮に接続できたとしても不適だった
今回やりたかったのは以下で、いずれも MCP のツール境界の外側にある。

- **拡張機能をロードした状態でブラウザを起動する**
  MCP サーバは起動オプション（`--load-extension` 等）を呼び出し側から差し込めない。
- **Service Worker / 拡張ページの文脈で `chrome.*` API を叩く**
  playwright MCP が公開するのは「ページに対する操作」であって、
  `context.serviceWorkers()` 相当のハンドルは取れない。
  `chrome.sessions.restore()` や `chrome.tabs.discard()` を呼ぶ手段がない。
- **ブラウザを落として再起動し、セッション復元させる**
  MCP はブラウザのライフサイクルを握っているので、
  「一度殺してプロファイルを書き換えて起動し直す」ができない。

**所感**: MCP は「人間の代わりに画面を触る」のは得意だが、
「ブラウザそのものの起動条件・プロセス寿命・拡張ランタイムを操作する」用途には設計が合っていない。
そして拡張機能のテストは後者そのもの。

さらに実利面で、素のスクリプトのほうが優れている点がある。

- **リポジトリにコミットできる** → 再現可能・レビュー可能・将来の回帰テストに転用できる
- **CI に載せられる**
- 会話のターンを消費せず、1 コマンドで全シナリオが流れる

→ **結論: 拡張機能の実機テストは素の Playwright スクリプトで書く。MCP は使わない。**

---

## 3. 環境面で踏んだ落とし穴（重要）

### 3-1. Chrome 137 以降、自動化下では `--load-extension` が無効

最初 `channel: "chrome"` で起動したところ、
`waitForEvent("serviceworker")` が 30 秒でタイムアウトし続けた。
診断したところ、そもそも拡張がひとつもロードされていなかった（`installed extension ids: []`）。

原因は Chrome 本体の仕様変更。Chrome 137 以降、
ブランド版 Chrome は自動化フラグ下での `--load-extension` を無視する（不正利用対策）。
ローカルの Chrome は 152.0.7977.83 で、当然これに該当していた。

`--disable-features=DisableLoadExtensionCommandLineSwitch` を足しても**回避できない**。

> **対処**: `channel: "chromium"`（Playwright 同梱の Chromium）を使う。
> 事前に `npx playwright install chromium` が必要。

### 3-2. 既定の headless は拡張をロードできない（が、解はある）

Playwright の既定 headless は `chromium-headless-shell` という別バイナリで、拡張機能に非対応。
ここから「拡張テスト = headed 必須」と思い込みがちだが、**そうではない**。

| 組み合わせ | 拡張ロード | フォーカス奪取 |
| --- | --- | --- |
| `channel:"chrome"` | ❌（3-1） | – |
| 既定 headless（headless shell） | ❌ | なし |
| `channel:"chromium"` + `headless:true` | **✅** | **なし** |
| `channel:"chromium"` + `headless:false` | ✅ | あり |

`channel:"chromium"` を指定すると headless でも**完全版 Chromium** が使われるため、拡張が動く。
これが「見えないけど全部動く」構成。

### 3-3. フォーカスを奪わない運用

上記に加えて実際にやったこと。

- **`page.bringToFront()` を使わない**。これがフォーカス奪取の主犯。
  コード中にコメントで理由を残してある（うっかり足すと再発するため）。
- 代わりに `recordVideo` と `context.tracing` で**後から目視できる**ようにした。
  - 動画: `artifacts/video/*.webm`
  - トレース: `npx playwright show-trace artifacts/trace-before-restart.zip`
- 目で見たいときだけ `PROBE_HEADED=1 npm run probe`。

**所感**: 「見たい」欲求は headed である必要がなく、動画とトレースでむしろ十分すぎる。
トレースはステップごとの DOM スナップショットが残るので、リアルタイムで睨むより精度が高い。

### 3-4. MV3 Service Worker はサスペンドする

`context.serviceWorkers()[0]` で取得したハンドルは、
SW がアイドル（約 30 秒）でサスペンドすると無効化され、
以降の `worker.evaluate()` が `Target page, context or browser has been closed` で落ちる。
`waitForEvent("serviceworker")` は**再度は発火しない**ので、待っても復帰しない。

> **対処**: `chrome.*` の呼び出し口を **拡張ページ** に置く。
> 検証専用の `probe.html` を拡張に同梱し、それを普通のタブとして開いて
> `page.evaluate()` から `chrome.*` を叩く。拡張ページはサスペンドしないので安定する。

これは今後の拡張機能テスト全般に効く定石。

### 3-5. ブラウザ再起動 + セッション復元のやり方

`context.close()` したあと、プロファイル内の `Preferences` を書き換えてから再起動する。

```js
prefs.session = { ...prefs.session, restore_on_startup: 1 };
prefs.profile = { ...prefs.profile, exit_type: "Normal", exited_cleanly: true };
```

`exit_type: "Normal"` を入れないと Chrome が「異常終了」とみなし、
復元バブルを出して自動復元してくれない。
そのうえで `--restore-last-session` を付けて `launchPersistentContext` し直す。

### 3-6. タブを閉じるときは `chrome.tabs.remove()` を使う

`page.close()` は CDP の `Target.closeTarget` を呼ぶため、
Chrome の `TabRestoreService`（Cmd+Shift+T の実体）に記録が残らない可能性がある。
セッション復元を検証する文脈では、拡張側から `chrome.tabs.remove()` で閉じるほうが実際のユーザー操作に近い。

（今回は実測ではどちらでも S3 は通ったが、意味論的に正しいほうを採用した）

---

## 4. 検証結果

環境: Chromium 153.0.8010.12 / Playwright 1.63.0 / headless
（システム Chrome 152.0.7977.83 は §3-1 により使用不可）

検証対象は、content script が `sessionStorage` に書き込む UUID トークン
`__cpe_probe_token__`。「これはタブの同一性の目印として使えるか」を問うている。

| ID | シナリオ | 結果 |
| --- | --- | --- |
| S0 | content script が書いた値をページ自身の JS から読めるか | ✅ **読める** |
| S1 | リロードをまたぐか | ✅ SURVIVES |
| S2 | 同一タブ内のクロスオリジン遷移をまたぐか | ❌ **LOST**（設計どおり） |
| S3 | タブを閉じて `chrome.sessions.restore()` したとき | ✅ **SURVIVES** |
| S4 | `chrome.tabs.discard()` → 再活性化したとき | ⚠️ **測定不能** |
| S5 | ブラウザ再起動 + セッション復元をまたぐか | ✅ **SURVIVES** |

生データ: `experiments/tab-identity-probe/probe-result.json`

### 各結果の意味

**S0 — 読める（＝これは分離された領域ではない）**
content script は isolated world で動くが、`sessionStorage` は**ページと同じ名前空間**を共有する。
つまり拡張が書いた値を、そのページの JS が読むことも、上書きすることも、消すこともできる。
これは「拡張のデータをページに晒している」ことを意味し、
MV3 のベストプラクティス上の論点そのもの（ユーザ指摘のとおり）。別途調査中。

**S2 — 失われる（想定内）**
`sessionStorage` はオリジン単位。同一タブでも別オリジンに移れば見えない。
よって「タブに 1 個の永続 ID を持たせる」用途にそのまま使うことはできず、
**遷移のたびに background から再スタンプする**実装が必須になる。

**S3・S5 — 生き残る（これが本命）**
知りたかったのはこの 2 つ。
Chrome には Firefox の `sessions.setTabValue()` に相当する API が**存在しない**
（Bugzilla 1322060 相当の機能要望は Chrome 側で未実装）。
そのため「タブを閉じて復元した」「ブラウザを再起動した」ときに
同じタブだと言い当てる手段が標準では無い。
今回 S3・S5 がともに SURVIVES したことで、
`sessionStorage` トークンがその代替として**実際に機能する**ことは実測で確認できた。

ただし **機能することと採用してよいことは別**で、最終的には不採用とした。理由は §7。

**S4 — 測定不能（正直に記録する）**
`chrome.tabs.discard()` **自体は成功する**。戻り値は `{discarded: true}` で新しい tabId も採番される。
しかしその直後に、**Playwright が繋いでいる全ターゲットが消滅し、ブラウザごと切断される**。
`ctx.pages()` が空になり、新規 `newPage()` すら
`Target page, context or browser has been closed` で失敗する。

切り分けとして試して、いずれも同じ結果だったもの:

- SW ではなく拡張ページ（`probe.html`）から呼ぶ → 同じ
- 対象タブをバックグラウンド化してから discard する（keep-alive タブを作って activate） → 同じ
- **headed で実行する → 同じ**（headless 固有の問題ではないと確定）

→ Playwright での自動測定は諦め、**手動検証に回す**。手順は §6 に記載。

なお設計上のインパクトは限定的で、
仮に discard でトークンが失われても **URL フォールバック**が拾うため、
「メモが行方不明になる」ことはない（同 URL の別タブに誤爆させない制約は別途必要）。

---

## 5. 使ってみた所感（今後のための知見）

**良かった点**

- `launchPersistentContext` + `channel:"chromium"` + `headless:true` の 3 点セットが分かれば、
  拡張機能の実機テストは**普通に自動化できる**。想像していたより障壁は低い。
- 拡張ページを `chrome.*` の呼び出し口にする方式が非常に安定する。
  MV3 の SW サスペンド問題を丸ごと回避できるので、今後もこの型でいく。
- トレースが強力。フォーカスを奪わず、かつ headed より詳細に後追いできる。

**つらかった点**

- **失敗の出方が原因を示さない**。3-1 の実体は「拡張がロードされていない」なのに、
  症状は「`waitForEvent("serviceworker")` のタイムアウト」として現れる。
  拡張が絡むテストで詰まったら、まず
  `chrome.management.getAll()` 相当でロード済み拡張を数えるデバッグを最初に書くべき。
- ブラウザのライフサイクルを跨ぐ検証（S5）は `Preferences` 直接編集という力技が要る。
  公式な作法ではないので、Chrome 側の変更で壊れうる。
- discard のようにブラウザ内部の状態遷移を伴う操作は、CDP 接続と相性が悪い（S4）。
  **自動化できない領域は存在する**と割り切る必要がある。

**Puppeteer という代替**

Puppeteer には拡張機能ロード用の API（`enableExtensions` / `installExtension`）があり、
**ブランド版 Chrome でも拡張をロードできる**。
§3-1 の制約を正面から回避できるので、
「実際の Chrome 安定版そのもので検証したい」要件が出てきたら Puppeteer に乗り換える価値がある。
今回は Chromium での検証で十分だったため採用しなかった。

---

## 6. 手動で確認すべき残タスク（S4）

1. `chrome://extensions` から `experiments/tab-identity-probe/extension` をパッケージ化せずに読み込む
2. 任意のページを開き、DevTools Console で
   `sessionStorage.getItem("__cpe_probe_token__")` を控える
3. 別タブに移り、`chrome://discards` から対象タブを **Urgent Discard**
4. 対象タブに戻って再読み込みされたあと、同じキーを再取得する
5. 一致すれば SURVIVES

---

## 7. この検証が設計に与えた結論

並行して実施した「MV3 ストレージのベストプラクティス調査」の結果と合わせると、
**`sessionStorage` トークン方式は採用しない**という結論になった。
実測（S3 / S5 が SURVIVES）は「動く」ことを示したが、**「動く」と「使ってよい」は別**だった。

### 実測が正しかった点

調査で判明した Chromium の実装と、今回の実測は完全に整合する。

- S5（再起動 + セッション復元）が通ったのは偶然ではない。
  Chromium は `components/sessions` に `session_storage_persistent_id` を永続化し、
  復元時に `DOMStorageContext::RecreateSessionStorage()` で**意図的に再結合している**。
- S3（同一起動中のタブ復元）が通ったのも同様で、
  `sessions::ContentPlatformSpecificTabData` が in-memory の namespace ハンドルを保持している。

### それでも採用しない理由

| # | 理由 |
| --- | --- |
| 1 | **公式が明示的に非推奨**。`chrome.storage` のドキュメントが Web Storage を避ける理由として "Content scripts share storage with the host page" を挙げている。S0 で実測したとおり、書き込み先はサイトの領域そのもの |
| 2 | **`window.open()` / タブ複製でトークンが複製される**。Chromium の DOM Storage README に「新しいウィンドウは開いた側の Session Storage の**コピー**を受け取る」と明記。一意であるべき ID が複製されるのは、この用途にとって致命的 |
| 3 | **前回起動時に閉じたタブの `chrome.sessions.restore()` では戻らない**。`tab_restore_types.h` の `Tab` に `session_storage_persistent_id` は無く、`platform_data` は "null (e.g., if restoring from last session as this data is not persisted)"。**今回の S3 は同一起動中のケースしか踏んでいない**（後述の限界） |
| 4 | **セッション復元が起きない起動では消える**。起動設定が「新しいタブページ」のユーザーでは `StartScavengingUnusedSessionStorage()` がディスク上のデータを削除する |
| 5 | **カバレッジの穴**。`chrome://` / Web Store / PDF ビューア / `file://` では content script が動かない。サードパーティ Cookie ブロック時や opaque origin では、プロパティアクセス自体が `SecurityError` を投げる |
| 6 | **前例がない**。Tab Session Manager / OneTab / Workona いずれも不採用。Firefox 側の Tree Style Tab は公式 API の `sessions.setTabValue()` を使っている（Chrome には該当 API が無い） |

補足: crbug **40832933**「Regression: sessionStorage not restored when "Continue where you left off" is set」が
2022 年起票のまま未修正とみられる。
ただし**今回の S5 は macOS / Chromium 153 で SURVIVES しており、この環境では再現しなかった**
（当該バグの報告は Windows）。
つまり「環境によって挙動が違う」状態であり、これ自体が依存すべきでない根拠になる。

### 今回の検証の限界（正直な記録）

- **S3 は同一起動中のタブ復元しか検証していない。**
  「前回起動時に閉じたタブを、再起動後に Ctrl+Shift+T する」経路は未検証で、
  調査によればこれは**失われる**はず。仮に方式を採用するなら必須の検証項目だった。
- S4（discard）は測定不能。
- Windows / Linux では未検証。上記 crbug のとおり OS 差がありうる。

### 採用する設計

Chromium 自身が `SavedTabGroupTab` で採っている
「**不変 GUID を真実の源とし、ローカル ID は nullable な結びつけとして持つ**」構造に倣う。

1. メモ本体は `chrome.storage.local` に、自前の不変 `memoId` (UUID) をキーに保存する。
   再結合用のメタ（url / title / index / pinned / グループの title・color）を併せ持つ。
2. 実行中の `tabId → memoId` マップは `chrome.storage.session` に置く。
   「SW の停止はまたぐが、ブラウザ再起動では消える」という寿命が用途と完全に一致する。
   content script に読ませる必要が無ければ既定の `TRUSTED_CONTEXTS` のままにする。
3. `runtime.onStartup` で再結合する。URL 完全一致を軸に、
   ウィンドウ内 index の近さ・title・pinned でスコアリングして貪欲マッチする。
4. **同一 URL の複数タブは index で識別する。** 決めきれない場合は黙って結びつけず、
   未接続のまま保持してユーザーに選ばせる。
   （「参照用タブと編集用タブを取り違えない」という要件は、誤爆させないことで満たす）
5. `groupId` は識別子として保存しない。
   `session_restore.cc` が復元時に `TabGroupId::GenerateNew()` で振り直すため、**再起動で必ず変わる**。

なお tabId を主とし URL をフォールバックとする方針自体は変わらない。
変わったのは「その中間に `sessionStorage` トークンを挟むかどうか」だけで、挟まないことにした。

### 将来

Chrome には `sessions.setTabValue()` 相当が無い。
Chrome 内部には `SavedTabGroupTab::saved_tab_guid_` という形でまさにその仕組みがあるが、拡張には公開されていない。
標準化 Issue は w3c/webextensions#715 として open のまま。
これが入れば、ここまでの回避策はすべて不要になる。
