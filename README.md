# Virtual Driving School

Virtual Driving School へようこそ。このプロジェクトは、Next.js と React Three Fiber を使用したブラウザベースの 3D ドライビングシミュレーターです。MediaPipe を統合し、Webカメラを使用したジェスチャー（顔の向き、手の動き、足の動き）による直感的な運転操作を実現しています。

## 主な機能

*   **リアルな 3D シミュレーション**: React Three Fiber (Three.js) による車両挙動と環境描画。物理挙動は外部エンジンを使わず Three.js のベクトル/回転演算で実装しています。
*   **ビジョンコントロール**: MediaPipe を活用し、ハンドル操作・アクセル/ブレーキ・ギア（ドライブ/リバース）を身体の動きでエミュレート。
*   **ミッション & トラフィック**: 交通ルールを意識したミッションシステムと、NPC車両による交通システム。
*   **段階的な学習**: チュートリアルから実践的な走行までをサポート。
*   **多言語対応 (i18n)**: 日本語・英語の切り替えに対応（初期表示は英語）。
*   **走行履歴 & フィードバック**: Firebase 認証と Firestore を用いて、ユーザーごとの走行履歴とフィードバックを保存・表示。

## 始め方 (Getting Started)

開発サーバーを起動するには、以下のコマンドを実行してください。

```bash
npm install
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開き、アプリケーションを確認してください。

> Node.js 24 以上が必要です（`.nvmrc` / `package.json` の `engines` を参照）。

## 技術スタック

*   **Framework**: [Next.js](https://nextjs.org/) (App Router)
*   **3D Library**: [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) / [drei](https://github.com/pmndrs/drei) (Three.js)
*   **Vision AI**: [MediaPipe](https://developers.google.com/mediapipe) (Tasks Vision)
*   **State Management**: [Zustand](https://github.com/pmndrs/zustand)
*   **Styling**: [Tailwind CSS](https://tailwindcss.com/)
*   **Backend/Storage**: [Firebase](https://firebase.google.com/) (Authentication / Firestore)
*   **Testing**: [Playwright](https://playwright.dev/) (E2E)、`@firebase/rules-unit-testing` + `node:test`（Firestore セキュリティルール）

## スクリプト

| コマンド | 説明 |
| --- | --- |
| `npm run dev` | 開発サーバーを起動。 |
| `npm run build` | 本番ビルドを作成。 |
| `npm run start` | ビルド済みアプリを起動。 |
| `npm run lint` | ESLint を実行。 |
| `npm run type-check` | TypeScript の型チェック（`tsc --noEmit`）。 |
| `npm run test:e2e` | Playwright による E2E テストを実行。 |
| `npm run test:rules` | Firestore エミュレータ上でセキュリティルールのテストを実行。 |
| `npm run deploy:rules` | Firestore セキュリティルールをデプロイ。 |

## ディレクトリ構造とファイル解説

プロジェクトの主要なファイルとディレクトリの構造について解説します。

### `src/app`
アプリケーションのエントリーポイントとルーティング定義です。
*   `layout.tsx`: 全ページの共通レイアウト。フォント読み込みやメタデータを設定。
*   `page.tsx`: トップページ。キャンバスの初期化やメインコンポーネントの読み込み。
*   `globals.css`: Tailwind のディレクティブを含むグローバルスタイル。
*   `debug/`: デバッグ用ページが含まれるディレクトリ。

### `src/components`
*   `ClientApp.tsx`: クライアントサイドのトップレベルコンポーネント。画面状態に応じて各シーン/UI を切り替えるエントリーポイント。

### `src/components/simulation`
3Dシーンとシミュレーションロジックに関するコンポーネント群です。
*   `Scene.tsx`: 3Dシーン全体のコンテナ。環境光やカメラ設定などを管理。
*   `Car.tsx`: プレイヤーが操作する車両のモデル、物理挙動、操作ロジック（ギアによる前進/後退を含む）。
*   `Road.tsx`: 道路の描画と生成ロジック。
*   `TrafficSystem.tsx`: NPC（他車）の生成と移動制御を行うシステム。
*   `MissionController.tsx`: ゲームのミッション（課題）、スコア、成功/失敗判定を管理。
*   `RearviewMirror.tsx`: バックミラー機能（後方視点の描画）。
*   `GarageScene.tsx`: 車両選択やプレビュー用のガレージシーン。
*   `GoalEffects.tsx`: ゴール到達時の演出エフェクト。
*   `KeyboardControls.tsx`: キーボードによる操作入力のハンドリング（デバッグや補助用）。
*   `Surroundings.tsx`: 木、建物などの環境オブジェクトの配置。
*   `ThreeModelLoader.tsx`: 3Dモデル（GLTF/GLB）を非同期で読み込むためのユーティリティ。
*   `RoadProps.tsx`: 道路に関連するプロパティや補助オブジェクト。
*   `objects/`: 標識や障害物など、シーン内の個別の静的オブジェクト。

### `src/components/simulation/objects` (詳細)
*   `TrafficLight.tsx`: 信号機のモデルと状態管理。
*   `Pedestrian.tsx`: 歩行者のモデルとアニメーション。
*   `Crosswalk.tsx`: 横断歩道の表示。
*   `Bicycle.tsx`: 自転車のモデル。
*   `RailroadCrossing.tsx`: 踏切のモデル。
*   `ModelErrorBoundary.tsx`: 3Dモデル読み込みエラー時のフォールバック表示。

### `src/components/vision`
カメラ入力と画像認識に関するコンポーネントです。
*   `VisionController.tsx`: Webカメラの映像を取得し、MediaPipeで顔・手・姿勢を検出。その結果をステアリング、アクセル/ブレーキ、ギア操作の入力値に変換します。

### `src/components/ui`
画面上にオーバーレイ表示される 2D UI コンポーネント群です。
*   `Dashboard.tsx`: 速度計、ギア、RPMなどを表示する計器盤。
*   `HomeScreen.tsx`: ゲーム開始前のメインメニュー画面。
*   `FeedbackScreen.tsx`: 走行終了後のリザルト画面やフィードバック表示。
*   `HistoryScreen.tsx`: 過去の走行履歴を表示する画面。
*   `LanguageScreen.tsx`: 表示言語（日本語/英語）を選択する画面。
*   `PauseMenu.tsx`: ゲーム一時停止中に表示されるメニュー。
*   `TutorialScreen.tsx`: チュートリアルの進行管理と説明表示。
*   `TutorialIndicators.tsx`: チュートリアル中の視覚的なヒント（矢印など）。
*   `TutorialPlainScene.tsx`: チュートリアル用の簡易的な3Dシーン背景。

### `src/components/auth`
*   `AuthScreen.tsx`: Firebase Authentication を用いたログイン/サインアップ画面。

### `src/lib`
ユーティリティ関数、定数、状態管理ライブラリです。
*   `store.ts`: Zustand を使用したグローバルな状態管理（ゲームの状態、入力値、設定など）。
*   `course.ts`: コースのウェイポイントや形状データ。
*   `oneEuroFilter.ts`: センサーや認識結果のノイズを除去して滑らかにするフィルタリング処理。
*   `footPedalRecognition.ts`: 映像から足の動きを認識してペダル操作と判定するロジック。
*   `firebase.ts`: Firebase の初期化設定と接続インスタンス。

### `src/hooks`
React カスタムフックです。
*   `useDrivingFeedback.ts`: 走行データに基づいて、リアルタイムまたは終了後のアドバイスを生成するフック。
*   `useMission.ts`: ミッションの採点（ゴール判定・チェックポイント通過・スコアリング）を毎フレーム行うフック。チェックポイント定義は `src/lib/mission/missions.ts` に集約。

## テストと CI

*   **E2E テスト**: Playwright を使用（`e2e/`、`playwright.config.ts`）。Webカメラが無い環境向けのフォールバックを含みます。
*   **Firestore ルールテスト**: Firestore エミュレータ上でセキュリティルールを検証（`tests/firestore-rules.test.mjs`、`npm run test:rules`）。JDK が必要です。
*   **セキュリティルール**: `firestore.rules` / `firestore.indexes.json` でオーナー単位のアクセス制御を定義。
*   **GitHub Actions**: `.github/workflows` でコード品質チェック、ビルドスモーク、E2E、Firestore ルールテストを自動実行します。

---
Created by Virtual Driving School Team.
