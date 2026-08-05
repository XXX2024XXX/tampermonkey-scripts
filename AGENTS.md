# AGENTS.md

このリポジトリは、ChatGPT・Codex・その他のAIエージェントからTampermonkeyスクリプトを安全に更新するための管理用リポジトリです。

## 必須ルール

- 修正前に、対象の `scripts/*.user.js` を必ず読み込む。
- 既存機能を削除しない。
- 既存機能を壊さない。
- 変更対象の `.user.js` はGitHubへ直接更新する。
- ユーザーへTampermonkey用コードのコピー・貼り付けを求めない。
- `@version` は更新のたびに必ず変更し、同じ番号を再利用しない。
- 例：`1.0 → 1.1 → 1.2`、`1.9 → 1.10`、`2.18.19 → 2.18.20`。
- `@updateURL` と `@downloadURL` は、対象ファイルのGitHub Raw URLを維持する。
- `@name`、`@namespace`、`@version`、`@description`、`@match`、`@grant`、`@updateURL`、`@downloadURL` を必ず維持する。
- `@match` は、ユーザーの明示的な指示がない限り変更しない。
- 文字コードはBOM付きUTF-8を優先する。
- `CHANGELOG.md` に変更内容を記録する。
- GitHubへコミットまで完了する。

## 標準の更新手順

1. 対象ファイルをGitHubから取得する。
2. 現在の `@version` を確認する。
3. 指示された内容だけを修正する。
4. `@version` を新しい番号へ変更する。
5. `@updateURL` と `@downloadURL` が正しいRaw URLか確認する。
6. `CHANGELOG.md` を更新する。
7. GitHubへ直接コミットする。
8. ユーザーには、更新したファイル名・新しいバージョン・Raw URLだけを簡潔に報告する。

## リポジトリ

- Repository: `XXX2024XXX/tampermonkey-scripts`
- Scripts: `scripts/`
- Raw URL形式: `https://raw.githubusercontent.com/XXX2024XXX/tampermonkey-scripts/main/scripts/<file>.user.js`

## ユーザーの標準依頼

ユーザーが次のように短く依頼した場合も、このルールを適用する。

- 「修正して」
- 「改善して」
- 「機能追加して」
- 「動かない」
- 「バグを直して」

対象ファイルが分からない場合だけ、候補を複数提示して確認する。
