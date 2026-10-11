# 開発用の実接続手順

この構成はデモ到達のために実装したレビュー用ベースライン。リモート環境へのデプロイ・実課金・本番移行は未実施。

## Supabase

1. 開発プロジェクトを用意し、AuthのサイトURL・確認メール・パスワード設定を確認する。
2. `supabase/migrations` の新規スキーマをレビューし、開発DBで適用する。本番DBには未適用。
3. `supabase/.env.example` にあるサーバー用変数を秘密管理に設定する。サービスロールキーと暗号化マスターはブラウザへ渡さない。
4. `apps/web/.env.example` の公開URL・公開キーをWebビルドに設定する。
5. Edge Functions `memory-window` と `stripe-webhook` を開発環境に配置する。
6. 認証・複数利用者・RLS・招待の一回性を実Supabaseで確認する。

`verify_jwt=false` はプラットフォームの従来JWT検証を使わず、関数内で全利用者リクエストに `auth.getUser(token)` を実行する構成。`memory-window` は本文のユーザーIDやロールを信頼せず、検証済みユーザーとDBの役割を使う。`stripe-webhook` はStripe署名と時刻を検証する。認証なしアクセスを許可する設定ではない。未認証・偽造トークン拒否をテストしている。

### APIキー保管とローテーション

32バイトのランダムマスターを安全な秘密管理に置く。AES-GCMのAADに利用者IDと鍵版を含める。DBの暗号文・IV・版はサービスロールだけが読める。UIへは登録有無のみ返す。

マスター更新時は旧版と新版を同時にキーリングへ設定し、管理された移行処理で復号→新版暗号化を行う。旧版レコードがなくなったことを確認して旧マスターを失効する。異なる利用者への暗号文移動や改ざんは復号失敗となる。キー変更は会話中の競合をDBのロックで拒否する。キー削除は接続の終了確認後に行う。障害時にはOpenAI側でキーを失効する手段も案内する。

### 保存期間

お願いは30日で閲覧不可。期限切れの物理削除と技術ログ90日の削除には `supabase/operations/schedule-retention.sql` の日次ジョブを開発者レビュー後に設定する。物理削除は期限から最大約24時間以内となる。会話全文・音声をアプリDBに保存するテーブルはない。接続失敗時のログはコードと技術IDのみ。

## Stripe（テストのみ）

1. テストモードのPremium商品・価格を作成する。価格は仕様で未確定のため、コードへ金額を埋め込まない。
2. テスト秘密鍵、Premium price ID、Webhook secretを設定する。
3. `customer.subscription.created/updated/deleted` をWebhookへ配送する。
4. テスト購入、支払い失敗、解約、イベント再送・順序逆転を確認する。

秘密鍵は `sk_test_` のみ受け付ける。Webhookは生の本文を署名検証し、現在のSubscriptionをStripeから取得、サーバーで作ったCustomer対応表に照合する。イベントIDで重複を排除し、古いイベントによる状態の巻き戻しを防ぐ。同秒イベントのキャッシュ競合に備え、実音声開始時にもStripeの現在状態・価格・Customerを検証する。クライアントのPremium表示はアクセス権限の根拠にしない。

実課金の有効化は今回のデモ範囲外。ネイティブoriginからWebチェックアウトを開始しない。ストア課金方式は別途確定する。

## OpenAI Realtime

統合WebRTC方式を採用し、サーバーがSDPとセッション設定を `POST /v1/realtime/calls` へ送る。標準キーも短命キーもブラウザへ返さない。音声のメディアトラックはブラウザとOpenAI間で直接通信する。

会話開始前に本人・Premium・登録キー・当日枠をサーバーで検証。実接続は1セッション60秒、当日1800秒を予約制で上限管理。セッション生成POSTは二重課金を避け自動リトライしない。終了はサーバーのhangupを使用し、サイドバンドで使用トークンのみ収集する。全文や音声をログへ出さない。

`REALTIME_ENABLED` は初期false。プロバイダー側の予算設定、サイドバンド監視、Edge Runtimeのバックグラウンド動作、hangupを実環境で検証するまで有効にしない。`PROVIDER_BUDGET_CONFIRMED` は運用確認を記録するフラグで、単独でOpenAI側の費用上限を設定するものではない。

Edge Runtimeの監視が停止したり、ネットワーク障害でhangupできなければ、アプリの秒数制限だけでは課金額を保証できない。正常接続・割り込み・終了・ネットワーク障害・予算超過を実APIで確認し、必要ならCloud Run等の監視基盤へ移す。料金はトークン種別やモデルで異なり、この実装は正確な請求額を算出しない。OpenAI利用契約の請求画面で確認する。未確認の使用量はUIで未確認と表示する。

音声や一時的な文字起こしはOpenAIへ送信される。OpenAIの保持条件はアプリ側の無保存方針と異なるため、公開前に利用者向け説明と同意をレビューする。

## Cloudflare / PWA

通常ビルドは `apps/web/dist`。`wrangler.toml` と `_headers` を配置済み。公開は別途承認後に行う。CSPは標準の `*.supabase.co` 接続だけを許可し、カスタムドメイン利用時は送信先をレビューして更新する。

PWAは静的資産だけをキャッシュ。認証付きAPI応答や利用者ファイルはキャッシュしない。オフライン時は窓とノックを利用でき、会話・課金・共有操作はネットワーク復帰後に行う。

## 公式資料

- https://developers.openai.com/api/docs/guides/voice-webrtc
- https://developers.openai.com/api/reference/resources/realtime/subresources/calls/methods/hangup
- https://developers.openai.com/api/docs/guides/your-data
- https://supabase.com/docs/guides/functions/auth
- https://supabase.com/docs/guides/functions/background-tasks
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://docs.stripe.com/webhooks
