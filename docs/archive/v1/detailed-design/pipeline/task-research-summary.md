# AI動画生成パイプライン 事前調査報告書

- 調査担当: researcher
- 調査日: 2026-03-06
- ステータス: 完了

---

## 1. Runway Gen-4 Turbo API 最新仕様

### 1.1 エンドポイント

| メソッド | パス | 用途 |
|---------|------|------|
| POST | `/v1/text_to_video` | テキストから動画生成 |
| POST | `/v1/image_to_video` | 画像+テキストから動画生成 |
| GET | `/v1/tasks/{id}` | タスク状態取得（ポーリング） |
| DELETE | `/v1/tasks/{id}` | タスクキャンセル/削除 |
| POST | `/v1/uploads` | メディアアップロード |
| GET | `/v1/organization` | 組織情報・クレジット残高 |
| POST | `/v1/organization/usage` | クレジット使用量クエリ（最大90日） |

**Base URL**: `https://api.dev.runwayml.com`（要確認）

### 1.2 認証方式

```
Authorization: Bearer <API_KEY>
X-Runway-Version: 2024-11-06
```

- API キーは Runway Developer Portal で発行
- 組織（Organization）単位で管理

### 1.3 入力パラメータ

#### Text to Video（`gen4_turbo` は対象外、`gen4.5` / `veo3.1` 系のみ）

> **重要**: `gen4_turbo` は **Image to Video のみ対応**。Text to Video には使用不可。

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `model` | string | Yes | `gen4.5`, `veo3.1`, `veo3.1_fast`, `veo3` |
| `promptText` | string | Yes | 1-1000文字 |
| `ratio` | string | Yes | `1280:720`, `720:1280` |
| `duration` | integer | Yes | 2-10秒 |
| `seed` | integer | No | 0-4294967295 |

#### Image to Video（`gen4_turbo` 対応）

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `model` | string | Yes | `gen4.5`, `gen4_turbo`, `veo3.1`, `gen3a_turbo`, `veo3.1_fast`, `veo3` |
| `promptText` | string | Yes | 1-1000文字 |
| `promptImage` | string | Yes | HTTPS URL / Runway URI / data URI |
| `ratio` | string | Yes | `1280:720`, `720:1280`, `1104:832`, `960:960`, `832:1104`, `1584:672` |
| `duration` | integer | Yes | 2-10秒 |
| `seed` | integer | No | 0-4294967295 |

### 1.4 出力形式

- レスポンス: タスクオブジェクト（`id` を含む）
- 完了タスクの GET で動画 URL を取得
- **Webhook 通知: なし** -- ポーリングのみ（最大5秒に1回推奨）

タスクステータス遷移:
```
PENDING → THROTTLED（並行上限超過時） → RUNNING → SUCCEEDED / FAILED
```

### 1.5 レート制限（ティア制）

| ティア | 解放条件 | 並行タスク数 | 日次生成上限 | 月額上限 |
|--------|---------|-------------|------------|---------|
| Tier 1 | アカウント作成 | 1-2 | 50-200 | $100 |
| Tier 2 | 1日で$50消費 | -- | -- | -- |
| Tier 3 | 7日後+$100消費 | -- | -- | -- |
| Tier 4 | 14日後+$1,000消費 | -- | -- | -- |
| Tier 5 | 7日後+$5,000消費 | ~20 | 25,000-30,000 | $100,000 |

- RPM（リクエスト/分）制限はなし。日次生成上限と並行タスク数で制御
- 並行上限超過時は `THROTTLED` ステータスで自動キューイング
- 日次上限超過時は `429 Too Many Requests`

> **AI Theater への影響**: 月額$50予算では Tier 1 運用。並行タスク 1-2、日次50-200本。MVP には十分だが、スケール時は Tier 2 以上が必要。

### 1.6 料金体系

| モデル | クレジット/秒 | 1本(5秒)コスト | 1本(10秒)コスト |
|--------|-------------|---------------|----------------|
| Gen-4 Turbo | 5 credits/秒 | $0.25 | $0.50 |
| Gen-4.5 | 12 credits/秒 | $0.60 | $1.20 |
| Gen-3 Turbo | 5 credits/秒 | $0.25 | $0.50 |

- 1 credit = $0.01
- クレジットは Developer Portal で購入

> **AI Theater コスト試算**: Gen-4 Turbo で5秒動画 = $0.25。月200本生成で$50（予算上限ちょうど）。

---

## 2. Veo 3.1 Fast API 最新仕様（フォールバック用）

### 2.1 エンドポイント

| メソッド | パス | 用途 |
|---------|------|------|
| POST | `/v1beta/models/{model}:predictLongRunning` | 動画生成リクエスト |
| GET | `/v1beta/{operation_name}` | オペレーション状態ポーリング |

**Base URL（Gemini API）**: `https://generativelanguage.googleapis.com`

**Model ID**:
- Standard: `veo-3.1-generate-001`
- Fast: `veo-3.1-fast-generate-001`
- Preview: `veo-3.1-generate-preview`

### 2.2 認証方式

```
x-goog-api-key: <GEMINI_API_KEY>
```

Gemini API キーまたは Vertex AI サービスアカウントで認証。

### 2.3 入力パラメータ

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `prompt` | string | Yes | テキスト説明（音声キュー対応） |
| `image` | Image | No | 最初のフレーム画像 |
| `lastFrame` | Image | No | 最終フレーム（`image` 必須） |
| `referenceImages` | Array | No | 最大3枚（Veo 3.1のみ） |
| `video` | Video | No | 動画延長用（前回の生成結果） |
| `aspectRatio` | string | No | `"16:9"` / `"9:16"`（デフォルト: `16:9`） |
| `resolution` | string | No | `"720p"` / `"1080p"` / `"4k"` |
| `durationSeconds` | string | No | `"4"` / `"6"` / `"8"`（デフォルト: `"8"`） |
| `personGeneration` | string | No | `"allow_all"` / `"allow_adult"` |

> 1080p/4k は 8秒固定。延長は 720p のみ。

### 2.4 出力形式

```json
{
  "name": "operations/...",
  "done": false
}
```

完了時:
```json
{
  "response": {
    "generatedVideos": [{
      "video": {
        "uri": "download_url",
        "videoBytes": "base64_encoded_data"
      }
    }]
  }
}
```

- **Webhook 通知: なし** -- 10秒間隔のポーリング推奨
- レイテンシ: 最短11秒、最長6分（ピーク時）
- SynthID ウォーターマーク自動付与
- 生成動画の保存期間: 2日間

### 2.5 レート制限

| ティア | RPM | 並行リクエスト | 解放条件 |
|--------|-----|--------------|---------|
| Production | 50 | 10/プロジェクト | -- |
| Preview | 10 | 10/プロジェクト | -- |
| Tier 2 | -- | -- | $250+消費、30日以上 |
| Tier 3 | -- | -- | $1,000+消費 |

エラーコード:

| コード | ステータス | リトライ戦略 |
|--------|----------|------------|
| 429 | RESOURCE_EXHAUSTED | 指数バックオフ+ジッター（1s基準、64s上限） |
| 503 | UNAVAILABLE | 線形バックオフ（30s開始、+15s/回） |
| 400 | INVALID_ARGUMENT | リトライ不可 |
| 500 | INTERNAL | 1回リトライ（5-10s後） |

### 2.6 料金体系

| 解像度 | Standard | Fast | 差分 |
|--------|----------|------|------|
| 720p/1080p | $0.40/秒 | $0.15/秒 | -62% |
| 4K | $0.60/秒 | $0.35/秒 | -42% |

| モード | 8秒動画コスト |
|--------|-------------|
| Standard 1080p | $3.20 |
| Fast 1080p | $1.20 |
| Fast 720p | $1.20 |

> **Runway API 経由の場合**: Veo 3.1 (audio付) = 40 credits/秒 ($0.40/秒)、audio無し = 20 credits/秒 ($0.20/秒)

### 2.7 Runway との差異・フォールバック切り替え条件

| 観点 | Runway Gen-4 Turbo | Veo 3.1 Fast |
|------|-------------------|-------------|
| 生成方式 | Image to Video のみ | Text to Video + Image to Video |
| コスト（5秒） | $0.25 | $0.75（Fast 720p） |
| コスト（8秒） | $0.40 | $1.20（Fast 720p） |
| レイテンシ | ~18秒（3秒クリップ） | ~11秒〜6分 |
| 解像度 | 720p-1080p相当 | 720p/1080p/4K |
| 音声生成 | なし | ネイティブ音声生成対応 |
| ウォーターマーク | なし（要確認） | SynthID 自動付与 |

**フォールバック切り替え条件（提案）**:

1. **Runway API エラー時**: 429 / 503 / 500 で規定回数リトライ後に Veo 3.1 Fast へ切り替え
2. **Runway 日次上限到達時**: 自動的に Veo 3.1 Fast を使用
3. **Text to Video 要求時**: Gen-4 Turbo は Image to Video のみのため、Veo 3.1 Fast を直接使用
4. **高解像度要求時（4K）**: Runway では対応不可のため Veo 3.1 を使用
5. **音声付き動画要求時**: Veo 3.1 のネイティブ音声生成を優先

> **コスト注意**: Veo 3.1 Fast は Runway Gen-4 Turbo の約3倍のコスト。フォールバックは緊急時のみとし、通常は Runway をプライマリとすべき。

---

## 3. BullMQ + Upstash Redis ジョブキュー設計パターン

### 3.1 アーキテクチャ概要

```
[Next.js API Route] → [BullMQ Queue] → [Upstash Redis] → [BullMQ Worker] → [Runway/Veo API]
                                                              ↓
                                                     [QueueEvents] → [SSE/WebSocket] → [Client]
```

### 3.2 Upstash Redis 接続設定

```typescript
import { Queue, Worker, QueueEvents } from 'bullmq';

const connection = {
  host: 'xxx.upstash.io',
  port: 6379,
  password: '****',
  tls: {},
  maxRetriesPerRequest: null,  // Worker用: 再接続時に例外を防ぐ
};

const videoQueue = new Queue('video-generation', {
  connection: {
    ...connection,
    enableOfflineQueue: false,  // Queue: 切断時はfail-fast
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});
```

### 3.3 Upstash 向けチューニング

| パラメータ | 推奨値 | 説明 |
|-----------|--------|------|
| `stalledInterval` | 300000 (5分) | Stalled ジョブチェック間隔。動画生成は長時間のため長めに設定 |
| `guardInterval` | 5000 (5秒) | 遅延ジョブのポーリング間隔 |
| `drainDelay` | 300 (0.3秒) | キュー空時のタイムアウト |
| `lockDuration` | 600000 (10分) | ジョブロック時間。動画生成の最大レイテンシ（6分）を考慮 |

> **コスト最適化**: Upstash Fixed Plan 推奨。stalledInterval / guardInterval を長めに設定し、Redis コマンド数を抑制。

### 3.4 長時間ジョブのベストプラクティス

#### リトライ戦略

```typescript
// AI動画生成ジョブのリトライ設定
const jobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 10000,  // 10秒 → 20秒 → 40秒
  },
  // リトライ不可のエラー（パラメータ不正等）
  // → worker内で UnrecoverableError を throw
};
```

リトライ戦略の使い分け:

| 戦略 | ユースケース |
|------|------------|
| Exponential | Runway/Veo API の 429 レート制限 |
| Fixed | 一時的なネットワークエラー |
| Custom | Runway THROTTLED ステータス（並行上限） |
| UnrecoverableError | 400 パラメータ不正、コンテンツポリシー違反 |

#### タイムアウト設定

```typescript
const worker = new Worker('video-generation', processor, {
  connection,
  settings: {
    stalledInterval: 300000,  // 5分
    lockDuration: 600000,     // 10分（Veo 最大6分を考慮）
  },
});
```

> **重要**: `lockDuration` は動画生成の最大レイテンシ（Veo 3.1 で最大6分）を余裕をもって超える値に設定。短すぎると Stalled と誤判定される。

#### Graceful Shutdown

```typescript
process.on('SIGTERM', async () => {
  await worker.close();  // 実行中ジョブの完了を待つ
});
process.on('SIGINT', async () => {
  await worker.close();
});
```

### 3.5 ジョブ進捗通知方式の比較

| 方式 | メリット | デメリット | 推奨度 |
|------|---------|----------|--------|
| **SSE (Server-Sent Events)** | HTTP/2対応、再接続自動、実装シンプル | 単方向通信のみ | **推奨（MVP）** |
| **WebSocket** | 双方向通信、リアルタイム性高い | 接続管理が複雑、Vercel では制限あり | 将来的に検討 |
| **ポーリング** | 最もシンプル、インフラ制約なし | レイテンシ高い、無駄なリクエスト | 最終手段 |

#### SSE 実装パターン（推奨）

```
[Client] ← SSE ← [Next.js API Route] ← QueueEvents ← [BullMQ/Redis]
```

1. クライアントが SSE エンドポイントに接続
2. Next.js API Route が `QueueEvents` の `progress` / `completed` / `failed` イベントをリッスン
3. イベント発火時に SSE でクライアントへプッシュ

BullMQ QueueEvents の主要イベント:

| イベント | ペイロード | 用途 |
|---------|----------|------|
| `progress` | `{ jobId, data: number \| object }` | 進捗更新 |
| `completed` | `{ jobId, returnvalue }` | 生成完了 |
| `failed` | `{ jobId, failedReason }` | 生成失敗 |
| `waiting` | `{ jobId }` | キュー投入 |

> **Vercel 制約**: Vercel Serverless Functions はロングポーリング/SSE に 60秒制限あり。Railway 上の Worker から直接 SSE を提供するか、Vercel Edge Functions（制限緩和）の利用を検討。

### 3.6 Redis メモリポリシー

```
maxmemory-policy: noeviction
```

> **必須設定**: BullMQ は `noeviction` 以外のポリシーでは正常動作しない。Upstash ではデフォルトで `noeviction` だが、確認が必要。

---

## 4. 競合プラットフォームの動画生成パイプライン

### 4.1 Runway（Web UI）

#### プロンプト入力 → 生成中 → 完了フロー

1. **プロンプト入力**: テキストボックス + 画像アップロード。スタイルプリセット選択可
2. **生成開始**: 「Generate」ボタン押下後、タスクがキューに入る
3. **進捗表示**:
   - キュー待ち: 「In queue」表示 + 0%
   - 生成中: パーセンテージ表示（0%→100%）
   - **キャンセル**: キュー中は可能、生成開始後（>0%）はキャンセル不可
4. **完了**: プレビュー再生 + ダウンロードボタン
5. **失敗時**: エラーメッセージ表示、クレジット返還

#### 特徴的な UX

- 複数ジョブの同時実行・並行表示（タスクリスト形式）
- 生成履歴の保持（ギャラリー表示）
- プロンプト編集→再生成のワンクリックフロー
- Adobe Premiere Pro / Final Cut Pro / DaVinci Resolve 連携

### 4.2 Pika

#### プロンプト入力 → 生成中 → 完了フロー

1. **プロンプト入力**: シンプルなテキストボックス、画像/動画アップロード対応
2. **生成速度**: Turbo モデルで約12秒/3秒クリップ（最速クラス）
3. **進捗表示**: ローディングアニメーション + 推定時間表示
4. **完了**: インライン再生 + 編集ツール（Pikadditions: オブジェクト挿入等）
5. **失敗時**: 自動リトライ or エラー通知

#### 特徴的な UX

- 「チャーミングで軽快」なデザイン
- ソーシャルメディア向け最適化（短尺・高速生成）
- 編集モジュールとの統合（Pikadditions）

### 4.3 Luma Dream Machine

#### プロンプト入力 → 生成中 → 完了フロー

1. **プロンプト入力**: テキストボックス + 画像アップロード（2カラムレイアウト）
2. **生成速度**: 約120秒/クリップ（22秒/3秒クリップは Ray3 以降）
3. **進捗表示**: 推定残り時間表示
4. **完了**: プレビュー再生 + ダウンロード
5. **生成履歴**: 過去の生成結果を一覧表示

#### 特徴的な UX

- 「シネマティックで表現力豊か」な出力品質重視
- HDR/EXR エクスポート対応
- アノテーション機能（Ray3）
- 被写体認識編集

### 4.4 AI Theater への示唆

#### 採用すべきパターン

| パターン | 参考元 | 理由 |
|---------|--------|------|
| パーセンテージ進捗表示 | Runway | ユーザーに明確な期待値を提供 |
| キュー位置の表示 | Runway | 待ち時間の見通しを与える |
| 生成履歴ギャラリー | Runway/Luma | 過去の生成結果の管理 |
| 推定残り時間表示 | Luma/Pika | ユーザーの離脱防止 |
| 生成失敗時のクレジット返還 | Runway | ユーザー信頼の維持 |
| キュー中のキャンセル機能 | Runway | ユーザーコントロールの提供 |

#### AI Theater 独自の差別化ポイント

- **プロンプト透明性**: 使用モデル・パラメータ・推定コストの事前表示
- **生成メタデータ**: 処理時間・実コスト・C2PA プロヴェナンスの事後表示
- **フォールバック通知**: Runway → Veo 切り替え時にユーザーへ通知
- **AIチャンネルごとの生成スタイル**: チャンネル設定に基づくプリセット自動適用

---

## 5. まとめ・設計への推奨事項

### 5.1 プライマリ/フォールバック構成

```
プライマリ: Runway Gen-4 Turbo (Image to Video)
  - コスト: $0.05/秒（5 credits/秒）
  - 月200本(5秒) = $50

フォールバック: Veo 3.1 Fast (Text to Video / Image to Video)
  - コスト: $0.15/秒
  - 緊急時・Text to Video 専用・高解像度要求時のみ
```

### 5.2 ジョブキュー設計の方針

- **BullMQ + Upstash Redis Fixed Plan** で構築
- **SSE** で進捗通知（MVP）、将来的に WebSocket 検討
- **lockDuration: 600秒**（Veo の最大6分を考慮）
- **stalledInterval: 300秒**（Upstash コスト最適化）
- **リトライ: 指数バックオフ 3回**（10s → 20s → 40s）
- **UnrecoverableError** でリトライ不可エラーを即座に失敗処理

### 5.3 要確認事項

| 項目 | 詳細 |
|------|------|
| Runway Base URL | `api.dev.runwayml.com` が本番URL か要確認 |
| Runway ウォーターマーク | Gen-4 Turbo に SynthID 等のウォーターマークがあるか要確認 |
| Upstash noeviction | Upstash のデフォルト maxmemory-policy を要確認 |
| Vercel SSE 制限 | Edge Functions での SSE タイムアウト上限を要確認 |
| Veo 3.1 Gemini API vs Runway 経由 | Runway API 経由で Veo 3.1 を呼ぶ場合の料金差を要確認 |
| Gen-4 Turbo Text to Video | 公式ドキュメントで対象モデルに含まれていないが、将来対応の可能性を要確認 |
