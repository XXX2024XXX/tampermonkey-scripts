# GitHub自動読込 本番設計

## 目的

ChatGPTで修正依頼を行った後、GitHub更新とWebページの再読み込みだけで最新版を実行できるようにする。

## 絶対条件

- Tampermonkeyへのコード貼り付けを不要にする
- 更新確認ボタンを押さない
- GitHub更新後はページ再読み込みだけで反映する
- 既存のTampermonkeyスクリプトを壊さない
- GitHub取得失敗時は前回正常版を使う
- 構文エラーや空コードを正常版として保存しない
- 本番移行はスクリプト単位で行う

## 採用方式

Chrome拡張機能の `chrome.userScripts` APIを利用する。

```text
ChatGPTへ修正依頼
↓
GitHubのスクリプトを更新
↓
対象ページを再読み込み
↓
Chrome拡張機能がGitHub最新版を取得
↓
最新版を実行
```

## 移行方針

### そのまま移行可能

- `@grant none`
- DOM操作だけを行うもの
- ページ内のJavaScriptだけで完結するもの

### 確認後に移行

- `GM_getValue`
- `GM_setValue`
- `GM_xmlhttpRequest`
- `GM_download`
- `GM_registerMenuCommand`
- `@require`
- Tampermonkey独自権限を使用するもの

確認後にChrome拡張機能APIへ置き換える。

## 本番構成

```text
extension/github-loader/
├─ manifest.json
├─ background.js
├─ popup.html
├─ popup.js
├─ config.json
└─ ARCHITECTURE.md
```

## config.json

スクリプトごとに次を管理する。

- ID
- 名前
- 有効・無効
- GitHub Raw URL
- 対象URL
- 実行タイミング
- 実行順

## 更新処理

1. 対象ページを検出
2. `config.json`を取得
3. URLが一致するスクリプトだけ取得
4. コードが空でないことを確認
5. 最新版を実行
6. 正常実行後にキャッシュへ保存
7. 失敗時は前回正常版を実行

## 安全機能

- 二重実行防止
- GitHubキャッシュ回避
- スクリプト単位の停止
- 全体緊急停止
- 前回正常版への復旧
- エラー記録
- 実行版と取得版の表示

## 導入順

1. テスト用スクリプトで3回連続更新確認
2. `@grant none`の簡単なスクリプトを1本移行
3. 実運用で確認
4. 問題がないものだけ順次移行
5. Tampermonkey専用機能を使うものは個別対応

## 不採用

- Tampermonkey標準自動更新だけに依存する方式
- 外部コードを`eval`で直接実行する方式
- 既存スクリプトを一度に全部移行する方式
