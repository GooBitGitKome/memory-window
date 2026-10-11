# デモ納品報告 / 2026-10-10

1. 実装概要: Phase 0–7を通して体験するデモと実接続用コード。線画・生活動作・季節/時刻・ノック・固定挨拶、会話状態とWebRTC、設定/認証、暗号化キー、会員制限/Stripeテスト、PWA/Capacitor、テレビ/ラジオ/写真、生活ニーズ候補と本人同意・招待・共有・訂正・撤回・削除。
2. 変更ファイル: 新規プロジェクト全体。主な場所はapps/web/src、apps/web/android、apps/web/ios、packages/core、packages/api-contracts、supabase/functions、supabase/migrations、scripts/demo-*、tests、docs、README、AGENTS、CIと構成ファイル。
3. アーキテクチャへの影響: TypeScriptのモジュラーモノリス/モノレポ。UI・Application・純粋Domain・外部接続を分離。実接続と模擬版を別ビルド/APIに分離。
4. セキュリティ: AES-GCMの利用者分離とAAD、RLS、サーバー認可/会員判定、Webhook署名・重複・順序、入力制限、明示同意と版管理、会話全文無保存、ログ最小化。実課金と本番公開は行わず、Realtimeは既定無効。最終監査は開発者レビュー待ち。
5. テスト結果: 詳細・最新件数はvalidation.md。実マイグレーションをローカルPostgreSQL互換環境で検証し、Chromiumで操作・メディア・権限を確認。CI実行・実API・ネイティブコンパイルの成功を代替しない。
6. 未解決事項: 実Supabase/OpenAI/Stripe環境の往復、料金と遠隔切断の運用保証、実機マイク/音声/長時間/アクセシビリティ、認証メール、プライバシー方針と同意能力、正式価格/コンテンツ権利運用、ストア課金規約。
7. 開発者が確認すべき事項: 認証/認可、決済、BYOKと鍵運用、RLS、同意と保存期間、公開設定のレビュー。仕様の正式受け入れと本番公開は未承認。
8. 次の推奨作業: デモ操作レビュー→重要設計レビュー→テストサービス環境と費用上限を設定→実API/対象端末での受け入れ検証→限定公開の判断。MVP外の追加機能は増やさず検証を優先。

[デモ操作ガイド](demo-guide.md) / [起動](../../README.md) / [接続条件](../operations/connected-services.md)

## 追加改修 / 2026-10-11

1. 実装概要: 通常画面と全画面の窓を拡大、屋外窓とキャラクターの線画を刷新。読書・着席・短い歩行とランダムな生活動作、任意の地域天候表示を追加。
2. 変更ファイル: `apps/web/src/main.tsx`、`scenes/WindowScene.tsx`、`application/useWindow.ts`・`useWeather.ts`、`components/WeatherControls.tsx`、`services/weather.ts`、`style.css`、`packages/core`、CSP、テストと文書。
3. アーキテクチャ: 動作・WMO天候分類はcore、天候通信と測位はservices、更新はapplication、描画はpresentationへ分離。
4. セキュリティ: 現在地は操作時のみ要求し、0.1度へ丸めて外部送信。地域検索語・IPアドレスの外部通信をUIに明示。保存は画面内メモリのみ。CSPと位置情報許可を対象サービス・自サイトに限定。
5. テスト: 追加機能と既存機能の回帰をNode/Chromium/ビルドで検証し、結果はvalidation.mdへ記録。
6. 未解決事項: 実機での位置情報・全画面、地域天候との実際の一致、人物表現の利用者評価、商用API契約は未検証。
7. 開発者確認: 外部サービスの利用条件とプライバシー説明、人物デザインの承認、対象端末の動作。
8. 次の作業: 対象端末での受け入れ確認後、窓クリックのアクション仕様を確定する。
