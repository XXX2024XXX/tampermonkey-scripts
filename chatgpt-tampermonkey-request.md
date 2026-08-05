# ChatGPTへTampermonkey作成・修正を依頼する共通文

次の内容を新しいチャットや別のGPTへ送ってください。

```text
GitHubリポジトリ
XXX2024XXX/tampermonkey-scripts

Tampermonkeyスクリプトを作成・修正してください。

必須ルール
・GitHub上の scripts フォルダー内の .user.js を直接作成または更新する
・コードのコピーやTampermonkeyへの貼り付けをユーザーに求めない
・既存スクリプトを修正するときは、先にGitHub上の現在のファイルを読み込む
・既存機能を削除しない
・@version は毎回必ず変更し、同じ番号を再利用しない
・@name、@namespace、@version、@description、@match、@grant、@updateURL、@downloadURL を必ず入れる
・@updateURL と @downloadURL はGitHub Raw URLにする
・変更対象の .user.js だけをGitHubへ直接コミットする
・BOM付きUTF-8で保存する運用を維持する
・更新完了後、対象ファイル名、旧バージョン、新バージョン、Raw URLだけを報告する

新規スクリプトの場合
・scripts/＜分かりやすい英数字名＞.user.js として作成する
・初回だけTampermonkeyへRaw URLから登録する必要があることを案内する

修正内容
ここに依頼内容を書く
```

## リポジトリ

https://github.com/XXX2024XXX/tampermonkey-scripts
