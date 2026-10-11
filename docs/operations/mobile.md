# モバイル開発

Capacitor 8を使用。Node.js 22.12以上。Webコードとnpm workspacesを共有し、ネイティブアプリの中断・復帰イベントで音声とメディアを停止する。

```sh
npm ci
npm run mobile:sync
npm run mobile:android -w @memory-window/web
npm run mobile:ios -w @memory-window/web
```

AndroidはAndroid Studio/SDK/JDK、iOSはmacOSとXcodeが必要。このLinux環境には実機・Xcode・Android SDK/JDKがないため、ネイティブビルドと長時間動作は未検証。

現在のappId `app.memorywindow.mobile` は開発用仮値。署名・バンドルID・ストアアカウント・アイコンの正式決定は配布前に行う。

## 音声フェーズ前のレビュー

iOSのマイク用途説明、Androidの録音権限、WebViewのマイク許可、アプリ中断・復帰時のWebRTC切断を対象端末で確認する。用途説明とAndroid録音権限の宣言を追加済み。録音の要求は利用者が実会話を開始するときに限る。実機上の許可・拒否・復帰は未検証。

StripeのWebチェックアウトをストアアプリへ流用せず、App Store/Google Playの配布・課金規約に適合する方式を別途確認する。ストア版の課金経路が承認されるまで公開しない。

## 2026-10-11: 拡大表示と天候

Web側に全画面表示と、端末の位置情報または手動地域検索での天候連動を追加した。Android/iOSへは通常のWebビルドを同期する。端末ごとの全画面API、位置情報許可、背景化・復帰、画面回転の挙動は実機で確認が必要。位置情報は初期状態OFFで、明示操作時のみ要求する。
