# 思い出の窓 / Memory Window

白黒線画の窓の向こうに、静かな小さな暮らしを描くWeb/PWAアプリ。SRS v2.0に沿い、Phase 0–7を体験できるローカルデモと実接続用コードを作成しました。実サービス・ネイティブ実機・本番公開の検証と開発者レビューは未完了です。

## デモを起動

Node.js 22.12以上とnpmが必要です。

```sh
npm ci
npm run demo
```

**http://localhost:4174** を開きます。停止はCtrl+C。データはサーバーのメモリ内のみで、再起動または設定の「デモの全データを初期化」で消えます。デモサーバーはループバック限定です。

1. 窓を2回タップすると振り向き・手振り・固定挨拶。設定で1回タップに変更可能。Enter/Spaceでも反応します。
2. 「アカウントを選ぶ」でPremium利用者を選び、窓に戻り「会話を始める」。デモは録音せず、入力と端末の音声合成で会話の流れを再現します。
3. 「電球が切れた」と話す→候補を確認→非公開で保存。招待コードを作り、ログアウトして支援者へ切り替え、招待を受けます。
4. 利用者に戻り、内容を確認して同意・共有。支援者にはその項目だけ表示されます。権限のない支援者には表示されません。撤回・訂正・削除も体験できます。
5. 無料プランから会話の制限、模擬Premium申込、デモ用接続登録、会話終了、模擬解約を確認できます。**本物のAPIキーをデモへ入力しないでください。**
6. テレビ・ラジオ・写真を開き「オリジナルのデモ素材を表示」で再生・スライドショーを体験できます。端末内の利用可能なファイルも選べます。アップロードは行いません。

AI、アカウント、決済は明示された模擬動作です。実際の課金や外部AI送信はありません。固定挨拶はローカル日本語音声がある場合に再生し、非対応端末は文字で表示します。

## 開発・検証

```sh
npm run dev
npm run typecheck
npm test
npm run build
npm run build:demo
npx playwright install --with-deps chromium
npm run test:e2e
npx --yes deno@2.9.6 check --config supabase/functions/deno.json supabase/functions/memory-window/index.ts supabase/functions/stripe-webhook/index.ts
npx --yes deno@2.9.6 test --allow-env --config supabase/functions/deno.json supabase/functions/_shared/handlers_test.ts
npm run mobile:sync
```

開発URLは http://localhost:5173 。実接続用静的ビルドは `apps/web/dist`、模擬版は `apps/web/dist-demo`。バックエンドの模擬認証・決済を実接続APIに含めません。

## 構成と公開前の確認

React/TypeScriptと生成画像の室内・人物、UIに依存しない `packages/core`、Zodの `packages/api-contracts`、Supabase Edge Functions/PostgreSQL、Stripeテストモード、Realtime WebRTC、Capacitorのモノレポです。秘密鍵はサーバーで利用者別にAES-GCM暗号化し、RLSとサーバー認可でデータを分離します。会話全文・音声を永続保存しません。

- [システムアーキテクチャ仕様書](docs/architecture/system-architecture.md)
- [GitHubでの共同作業ガイド](CONTRIBUTING.md)
- [実サービス接続と安全設定](docs/operations/connected-services.md)
- [モバイルと実機検証](docs/operations/mobile.md)
- [コンテンツの利用](docs/operations/content.md)
- [全フェーズの到達状況](docs/specifications/all-phases-plan.md)
- [設計判断](docs/decisions/0002-connected-phases.md)
- [検証結果](docs/specifications/validation.md)

PWAは静的アプリだけをキャッシュし、APIや選択ファイルをキャッシュしません。ページ非表示・ネイティブ中断時に会話とメディアを停止します。動きを減らす設定に対応します。

実サービス接続にはSupabase、Stripeテスト環境、OpenAI契約と運用上限の準備が必要です。Realtimeは安全設定を確認するまで無効です。本番課金・公開・ストア配布は実施していません。認証、決済、キー管理、RLS、同意の設計を開発者がレビューし、実API・実端末で確認してからリリースしてください。

## 窓・全画面・地域の天候

窓を画面に合わせて大きく表示します。右上の「全画面」から切り替えられ、ブラウザの全画面機能に対応しない場合はアプリ内で拡大します。会話終了と全画面解除は常に操作できます。

人物はお茶、読書、着席、数歩の移動、窓を見る、休む動作を静かな間隔で行います。ノックや会話が優先されます。「動きを減らす」設定では連続動作を抑えます。

左の壁には端末のローカル日付・時刻を表示し、分の切り替わりと画面復帰時に更新します。会話を始めると人物が約2.6秒かけて手前へ近づき、会話中は胸から上を大きく表示します。会話を終えると通常の窓へ戻ります。「動きを減らす」設定では接近アニメーションを省きます。

人物は歩行中に左右の足を出した2枚を切り替え、待機・傾聴中に短くまばたきし、発話中に口を開閉します。発話状態との連動であり、音声波形に同期したリップシンクではありません。「動きを減らす」設定ではこれらのコマ切り替えも停止します。

室内と約3頭身の人物は別々の生成画像です。人物は状態ごとに完成した姿勢へ切り替えます。天候も線の少ない生成画像を使い、室内画像の窓ガラス2面だけを透過して背後に表示します。Live2Dはパーツ分けした原画とモデル制作が必要なため、[設計判断](docs/decisions/0003-generated-art-animation.md)に従い今回のデモには導入していません。

「外の天候」設定から、許可した現在地か手動検索した地域の天候を室内の窓に表示できます。位置情報はボタン操作時に一度だけ要求します。天候はOpen-Meteoから取得し、現在地の座標は0.1度単位に丸めて送信します。地域検索時は地域名を送信します。通信先にはIPアドレスも伝わります。地域と天候はこの画面を閉じるまでのメモリ内に保持し、会話やアカウントのDBには保存しません。天候連動の初期状態はOFFです。無料APIは非商用向けのため、商用公開前に契約・条件を確認します。デモでは模擬天候も選べます。

Macで `npm ci` が既存の `~/.npm` キャッシュの権限エラーになる場合は、`npm ci --cache "$(mktemp -d)"` を実行してください。依存関係の取得後に `npm run demo` でデモを起動します。

Mac（Intel）でデモのビルド時に `Cannot find module @rollup/rollup-darwin-x64` と表示された場合は、npmがプラットフォーム用のオプション依存を入れ損ねています。リポジトリのルートで `npm install --no-save --package-lock=false @rollup/rollup-darwin-x64@4.64.4 --cache "$(mktemp -d)"` を実行してから、`npm run demo` を再実行してください。`package-lock.json` は削除しないでください。
