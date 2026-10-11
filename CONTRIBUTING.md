# 共同作業ガイド

「思い出の窓」はデモと実接続コードを含むレビュー用ベースラインです。実サービス、実機、本番公開の確認は終わっていません。最初に [README](README.md)、[システムアーキテクチャ仕様書](docs/architecture/system-architecture.md)、[実接続手順](docs/operations/connected-services.md)、[未検証事項](docs/specifications/validation.md) を読んでください。AI エージェントは [AGENTS.md](AGENTS.md) も適用します。

## ローカルで確認

Node.js 22.12 以上と npm が必要です。リポジトリのルートで実行します。

```sh
npm ci
npm run demo
```

`http://localhost:4174` にアクセスし、Ctrl+C で停止します。デモはメモリ内の模擬アカウント・会話・課金を使います。**本物の API キー、個人情報、決済情報をデモへ入力しないでください。** `npm run dev` は Web 開発サーバー、`npm run build` は実接続用ビルドです。実接続の設定は [運用手順](docs/operations/connected-services.md) を参照してください。

## 変更先を探す

| 変更内容 | 入口 |
|---|---|
| 窓、人物、生成画像、操作・表示 | `apps/web/src/scenes`、`apps/web/public/art`、`apps/web/src/features` |
| 会話・アカウント・天候の画面フロー | `apps/web/src/application` |
| UI に依存しない状態・判定ルール | `packages/core` |
| Web と API のデータ形式 | `packages/api-contracts` |
| 外部通信と端末機能 | `apps/web/src/services` |
| 認証付き API、音声、キー、Webhook | `supabase/functions` |
| テーブル、RLS、DB 関数、保存期間 | `supabase/migrations`、`supabase/operations` |
| デモだけの模擬動作 | `scripts/demo-server.ts`、`scripts/demo-store.ts` |

状態遷移や権限ルールを画面の表示条件だけで完結させないでください。デモの模擬認証・課金を実接続 API に混ぜないでください。外部サービスの返答は検証し、会話全文・音声・秘密鍵をログやコミットに含めないでください。

## PR の作り方

1. 変更の目的と対象フェーズを絞り、既存の仕様・ADR・実装を確認する。重要な設計変更では ADR を追加する。
2. 変更箇所の単体/統合テストを実行し、共通チェック `npm run typecheck`、`npm test`、`npm run build`、`npm run build:demo` を実行する。UI を変えたら `npm run test:e2e`、Edge Functions を変えたら [README の Deno チェック](README.md#開発検証) も実行する。
3. [PR テンプレート](.github/pull_request_template.md) に目的、変更ファイル、影響範囲、テストの実結果、セキュリティ・プライバシー、未検証事項を書く。実行できなかったチェックは理由を明記する。
4. 認証、決済、API キー、RLS、個人情報・同意、外部送信、本番設定の変更は開発者レビューを受ける。テスト成功だけで本番承認済みとは扱わない。

CI の定義は [`.github/workflows/ci.yml`](.github/workflows/ci.yml) にあります。対象端末でのタッチ・音声・アクセシビリティと Supabase/OpenAI/Stripe の実サービス往復は、ローカルデモや Chromium の試験だけでは確認できません。新しい機能案は [backlog](docs/backlog/roadmap.md) に記録し、現在の変更と区別してください。
