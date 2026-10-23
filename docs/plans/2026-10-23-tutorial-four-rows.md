# Tutorial four-row progression implementation plan

Goal: 承認済みの全11課題、4段固定、自動進行とクリア練習を実装・公開する。
Spec: ../specs/2026-10-23-tutorial-four-rows.md
Architecture: 既存のTutorialSessionとブラウザ描画を維持し、課題座標を更新する。自動進行はブラウザ側の単一タイマーで制御する。

- [x] 課題・4段・一筆経路の単体テストを更新し、変更前の失敗を確認。
- [x] tutorial-steps.jsの後半を置換、visibleRowsを4段固定にする。
- [x] renderから単一の1500ms予約を管理。入力・未完成・非表示で解除、最終課題は停止。補助ボタンは完成時のみ表示。
- [x] 自動進行、Undo/reset/入力/非表示時の取消、クリア待ち、全11課題、320pxレイアウトを実操作で確認する。
- [x] 既存の点灯・音・紙吹雪・ポインター・タッチのテストを新進行へ適合し、Chromium/WebKitで実行する。
- [ ] 差分確認、対象ファイルのみcommit/push、Pages公開成功と配信ファイル・公開フローを確認する。

Constraints: 既存のユーザー変更を維持。チュートリアル以外のゲーム仕様は変更しない。実機検証とブラウザ検証を区別する。

公開前検証: 単体21件、Chromium全11課題の自動進行・タッチ、WebKit全スイート、タイマー取消の実操作テスト通過。コードレビューでブロッカーなし。
