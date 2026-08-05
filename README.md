# Tampermonkey Scripts

Tampermonkey スクリプトを GitHub で一元管理するためのリポジトリです。

## フォルダー構成

```text
scripts/               Tampermonkey 本体（.user.js）
common/                複数スクリプトで共有するコードや資料
tools/                 管理・自動更新用ツール
.github/workflows/     GitHub Actions
CHANGELOG.md           自動生成される更新履歴
```

## 基本運用

1. Tampermonkey 本体は `scripts/` に `.user.js` 形式で保存します。
2. 各スクリプトには次のメタデータを入れます。

```javascript
// ==UserScript==
// @name         スクリプト名
// @namespace    https://github.com/XXX2024XXX/tampermonkey-scripts
// @version      1.0
// @updateURL    https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/scripts/ファイル名.user.js
// @downloadURL  https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/scripts/ファイル名.user.js
// ==/UserScript==
```

3. `scripts/**/*.user.js` を GitHub で更新すると、GitHub Actions が次を自動実行します。
   - `@version` を自動で1段階更新
   - `@updateURL` と `@downloadURL` をGitHub Raw URLへ統一
   - `CHANGELOG.md` に更新内容を追記
   - 自動更新内容をリポジトリへコミット
4. Tampermonkeyへ最初の1回だけGitHub Raw URLから登録します。
5. 以後はTampermonkeyの更新確認でGitHub上の最新版を取得できます。

## バージョン更新ルール

- `1.0` → `1.1`
- `1.9` → `1.10`
- `2.18.19` → `2.18.20`

同じバージョン番号は再使用しません。

## 手動実行

GitHubの「Actions」から `Tampermonkey Auto Update` を選び、`Run workflow` でも実行できます。

## 注意

- 自動処理が作成したコミットでは、同じワークフローを再実行しないようにしています。
- `@match`、`@include`、スクリプト本体の機能は自動変更しません。
- `.user.js` 以外のファイルはバージョン自動更新の対象外です。
