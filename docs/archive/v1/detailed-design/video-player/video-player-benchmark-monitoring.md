# 動画再生ページ パフォーマンスベンチマーク目標・モニタリング計画

## プロジェクト: AI Theater
作成日: 2026-02-23
担当: analyzer
Task: #5

**前提: 個人開発・月額$50以下予算。計測ツールはすべて無料枠で対応。**

---

## 1. Core Web Vitals ベンチマーク目標値

### 1.1 目標値サマリー

| 指標 | 目標値 | Googleグレード | 測定対象 | ホーム画面との差分 |
|------|--------|-------------|---------|----------------|
| **LCP** | ≤ 2.5秒 | Good (≤2.5s) | Mux Player poster画像 (1920px WebP) | 同等（LCP要素が異なる） |
| **FCP** | ≤ 1.8秒 | Good (≤1.8s) | シェルHTML（Header + Player骨格） | ホームより厳格に設定 |
| **INP** | ≤ 200ms | Good (≤200ms) | 再生ボタン / いいねボタン / コメント送信 | 同等 |
| **CLS** | ≤ 0.1 | Good (≤0.1) | Player/コメント/関連動画レイアウト | 同等 |
| **TTFB** | ≤ 200ms | 優秀 (基準:≤800ms) | Vercel Edge ISRキャッシュヒット時 | 同等 |
| **TTI** | ≤ 3.5秒 | 参考値 | Player hydration完了時点 | **動画ページ固有指標** |

> **Note**: FIDはChrome 112以降でINPに置換。本設計ではINPのみ管理対象とする。

---

### 1.2 LCP 詳細分析（目標 ≤ 2.5秒）

**LCP要素**: Mux Player poster画像（`thumbnail.webp?time=5&width=1920`）

```
フェーズ                                         時間見積もり
─────────────────────────────────────────────────────────
TTFB (ISR Edge キャッシュヒット)               :  50 〜 200ms
HTML Parse → <link rel="preload"> 検出         :  30 〜  50ms
Mux CDN から poster 画像ダウンロード
  (WebP 1920px: 推定 80〜200KB)               : 150 〜 600ms
画像デコード + 描画                            :  30 〜  80ms
─────────────────────────────────────────────────────────
合計                                           : 260ms 〜 930ms
                                               → LCP ≤ 2.5秒 達成可能
```

**劣化リスクと対策**:
| リスク | 発生条件 | 対策 |
|--------|---------|------|
| TTFB 悪化 | ISRキャッシュMISS | revalidate=3600で再生成頻度を最小化 |
| poster 画像肥大化 | width=1920 WebP ~200KB超 | Mux CDN が自動WebP変換。追加対策不要 |
| preload 失敗 | React 19 `preload()` 未動作 | 実装後 Lighthouse で確認必須 |

---

### 1.3 FCP 詳細分析（目標 ≤ 1.8秒）

**FCP要素**: Streaming SSR で最初に送信されるシェルHTML

```
フェーズ                                         時間見積もり
─────────────────────────────────────────────────────────
TTFB                                           :  50 〜 200ms
Streaming SSR: シェル部分の送信完了            :  50 〜 100ms
ブラウザ HTML Parse + CSS 適用                 :  30 〜  60ms
─────────────────────────────────────────────────────────
合計                                           : 130ms 〜 360ms
                                               → FCP ≤ 1.8秒 十分達成可能
```

Streaming SSR でシェル（Header + VideoPlayerSkeleton）を先行送信するため、
FCP はほぼボトルネックにならない。DB取得完了を待たない設計が効いている。

---

### 1.4 TTI 詳細分析（目標 ≤ 3.5秒）

**TTI**: `@mux/mux-player-react/lazy` の hydration が完了し、再生ボタンが押せる状態

```
フェーズ                                         時間見積もり
─────────────────────────────────────────────────────────
FCP                                            : 130 〜 360ms
JS バンドルダウンロード (Server Components活用)  : 200 〜 400ms
JS Parse + Execute                             : 150 〜 300ms
MuxPlayer lazy JS チャンク fetch + Parse       : 100 〜 200ms
MuxPlayer hydration 完了                       :  50 〜 150ms
─────────────────────────────────────────────────────────
合計                                           : 630ms 〜 1.4秒
                                               → TTI ≤ 3.5秒 大きく達成可能
```

**TTI 改善の主要施策**:
- Server Components による JS バンドル最小化（ページの大部分がサーバー描画）
- `@mux/mux-player-react/lazy` で Player JS をバンドル分割
- コメント・関連動画の Client JS は TanStack Query のみ

---

### 1.5 INP 詳細分析（目標 ≤ 200ms）

動画ページの主要インタラクション別の応答時間見積もり:

| インタラクション | 処理内容 | 見積もり | 目標達成見込み |
|----------------|---------|---------|-------------|
| 再生ボタン押下 | MuxPlayer JS イベント処理 | ~50ms | ✅ 達成可能 |
| いいねボタン | API呼び出し（楽観的更新） | ~30ms (UI反映) | ✅ 達成可能 |
| コメント送信 | フォームバリデーション + API | ~50ms (UI反映) | ✅ 達成可能 |
| 関連動画クリック | `router.push()` + prefetch済み | ~100ms | ✅ 達成可能 |
| タブ切替 | URL params 更新 + re-render | ~80ms | ✅ 達成可能 |

INP の最大リスクは **大量の関連動画カード（15件）のレンダリング中のブロック**。
Server Componentで描画されるため hydration 後の再レンダリングは最小限。

---

### 1.6 CLS 詳細分析（目標 ≤ 0.1）

レイアウトシフト発生箇所と対策の確認:

| シフト発生箇所 | シフト量（未対策） | 対策 | 対策後シフト量 |
|-------------|--------------|------|-------------|
| Playerサイズ確定前 | 高 | `aspect-video` で16:9確保 | ≈ 0 |
| VideoPlayerSkeleton → Player置換 | 中 | Skeleton を aspect-video で同サイズに | ≈ 0 |
| コメントSkeleton → コメントリスト | 低〜中 | Skeleton 高さを平均コメント数×行高さで固定 | ≈ 0 |
| 関連動画サムネイル読み込み | 低 | `w-[168px] h-[94px]` 固定コンテナ | ≈ 0 |
| 視聴数リアルタイム更新 | 低 | `tabular-nums` で文字幅固定 | ≈ 0 |

**CLS 累積目標: ≤ 0.05**（目標の半分以下を実装目標とする）

---

## 2. Mux Player ローディングパフォーマンス指標

### 2.1 Mux Data 計測指標と目標値

Mux Data は `envKey` 設定のみで自動収集。月10,000視聴まで無料。

| 指標 | Mux Data 名称 | 目標値 | 説明 |
|------|-------------|--------|------|
| **TTFF** | `video_startup_time` | ≤ 2.0秒 | ページロードからFirst Frame表示まで |
| **初回バッファ遅延** | `player_startup_time` | ≤ 1.0秒 | 再生ボタン押下〜最初のフレーム表示 |
| **再生開始率** | `playback_startup_success` | ≥ 85% | 再生操作後に正常に開始できた割合 |
| **バッファリング率** | `rebuffer_percentage` | ≤ 1.0% | 再生中のバッファリング発生率（上限目標: ≤ 2%） |
| **バッファリング頻度** | `rebuffer_count` | ≤ 1回/視聴 | 1視聴あたりのバッファリング回数 |
| **視聴完了率** | `video_completion_percentage` | ≥ 65% | 動画全体を最後まで視聴した割合 |
| **平均視聴時間率** | `watch_time_ratio` | ≥ 動画長の60% | 平均再生時間 ÷ 動画長 |
| **エラー率** | `error_percentage` | ≤ 0.5% | 再生エラーが発生した割合 |
| **初期品質** | `video_quality_score` | ≥ 720p | 再生開始時のABR選択解像度 |

> **Note**: 「再生開始率 ≥ 85%」「初回バッファ遅延 ≤ 1秒」「視聴完了率 ≥ 65%」は researcher (Task #4) 調査 + tech-leader レビューにより追加。

### 2.2 Mux Player 設定と指標の関係

```
preload="metadata"
  └─ HLS マニフェスト取得済み → player_startup_time 短縮（~200ms改善）
     動画セグメントは再生開始まで取得しない → 帯域コスト削減

poster 画像 preload（React 19 preload() API）
  └─ <link rel="preload" as="image"> → LCP 短縮（~100-300ms改善）

@mux/mux-player-react/lazy
  └─ 初期 JS バンドル分割 → TTI 短縮（~100-200ms改善）
     Player 表示タイミングで別途 fetch → TTFF への影響: ~50ms増（許容範囲）
```

---

## 3. Time to First Frame (TTFF) 目標

### 3.1 TTFF の定義と分解

**TTFF** = ページへのアクセスから最初の動画フレームがユーザーに表示されるまでの時間

```
TTFF の構成要素:
─────────────────────────────────────────────────────────
① ネットワーク: TTFB                               :  50 〜 200ms
② HTML解析: DOM構築 + <link rel="preload"> 処理    :  30 〜  60ms
③ JS: Player lazy チャンク fetch + parse          : 100 〜 200ms
④ Mux: HLS マニフェスト (.m3u8) 取得              :  50 〜 150ms
   ※ preload="metadata" で③と並列化可能
⑤ Mux: 最初のセグメント (.ts) 取得               : 150 〜 500ms
   ※ ABR が回線速度を検出して品質選択
⑥ ブラウザ: 動画デコード + First Frame描画        :  30 〜  80ms
─────────────────────────────────────────────────────────
合計（自動再生なし: ユーザーが再生ボタン押下後） : 410ms 〜 1.2秒
```

### 3.2 TTFF シナリオ別目標

| シナリオ | 目標 | 備考 |
|---------|------|------|
| ISRキャッシュヒット + 高速回線 | ≤ 1.5秒 | 最良ケース |
| ISRキャッシュMISS + 高速回線 | ≤ 3.0秒 | SSR再生成あり |
| ISRキャッシュヒット + 低速回線 | ≤ 5.0秒 | ABRが240pに降格 |
| **平均目標値（P75）** | **≤ 2.0秒** | **メインKPI** |

### 3.3 TTFF と LCP の関係

```
ページロード開始
  │
  ├─ LCP (poster画像表示)     ≤ 2.5秒  ← ユーザーが「表示された」と感じるタイミング
  │
  └─ TTFF（再生ボタン押下後） ≤ 2.0秒  ← ユーザーが「動いた」と感じるタイミング

LCP は page load から計測。TTFF は「再生開始操作後」から計測。
2つは独立した指標として管理する。
```

---

## 4. コメントセクション・関連動画 ロード戦略の効果見積もり

### 4.1 コメントセクション 遅延読み込みの効果

> **[ISSUE-3 決定反映]** consistency-review ISSUE-3 により、コメントレンダリング方式は **Client Component + IntersectionObserver（遅延読み込み）** に決定済み。
> DATA の Server Component + Suspense 方式は不採用。理由: below-the-fold コンテンツの ISR キャッシュ親和性・認証 `isLiked` 状態取得の観点から本方式が優位。
> 本セクションの効果見積もりに変更なし。

#### 実装: IntersectionObserver (rootMargin: "300px")

**初期ロード時の影響**:

| 計測項目 | 遅延読み込みなし | 遅延読み込みあり | 改善量 |
|---------|--------------|--------------|-------|
| 初期ネットワークリクエスト数 | +1 (GET /api/videos/{id}/comments) | 0 | -1 リクエスト |
| 初期データ転送量 | +5〜20KB (コメント20件) | 0 | -5〜20KB |
| TTI への影響 | +50〜150ms (APIレスポンス待ち) | 0 | **-50〜150ms** |
| LCP への影響 | +20〜80ms (並列リクエストによる帯域競合) | 0 | **-20〜80ms** |

**スクロール後のコメント表示時間**:
```
ユーザーがコメントセクション 300px 手前に到達
  └─ TanStack Query フェッチ開始
     └─ API /api/videos/{id}/comments?limit=20
        └─ Supabase クエリ (インデックス有): ~30〜80ms
           └─ ネットワーク往復: ~20〜50ms
              └─ コメントリスト表示
                 ─────────────────────
                 合計: ~50〜130ms （Skeleton → 実データへの切替は自然）
```

#### 効果まとめ（コメント）
- **TTI 改善**: 50〜150ms
- **LCP 改善**: 20〜80ms（帯域競合減少による間接効果）
- **ユーザー体験**: スクロールして初めてコメントを見るため、遅延は許容される
- **推奨**: 採用確定。above the fold の高速化に有効。

---

### 4.2 関連動画 SSR並列フェッチの効果

> **[ISSUE-4 決定反映]** consistency-review ISSUE-4 により、関連動画 API レスポンスは **3セクション分離構造** に変更。
> `getRelatedVideos(videoId)` が `{ upNext: VideoCard[], sameModel: {..., videos}, sameChannel: {..., videos} }` を返す。
> UIUX の「次に見る」「同じAIモデル」「AI Creatorの他の動画」UI設計に対応。
> **DB アクセスは依然として1クエリ**のため、並列フェッチ効果の数値に変更なし。

#### 実装: `Promise.all([getVideoById, getRelatedVideos])` ※3セクション構造で返却

**逐次 vs 並列の比較**:

```
逐次フェッチ（悪い例）:
  getVideoById(id)              →  ~60ms (DB)
                         →  getRelatedVideos(id)  →  ~60ms (DB)
                                ↳ 戻り値: { upNext, sameModel, sameChannel }
  合計:  ~120ms

並列フェッチ（採用）:
  getVideoById(id)              →  ~60ms (DB) ─┐
  getRelatedVideos(id)          →  ~60ms (DB) ─┘ 並列完了: ~60〜80ms
  ↳ 3セクション構造で返却（1クエリ）
  合計:  ~60〜80ms

改善量: ~40〜120ms (合計DB時間の30〜50% 短縮)
```

**3セクション構造によるレンダリング変化**:

| 項目 | 旧: フラットリスト15件 | 新: 3セクション分離 | 影響 |
|------|-------------------|-----------------|------|
| DBクエリ数 | 1 | 1（変更なし） | なし |
| レンダリングコンポーネント数 | 1 (`RelatedVideos`) | 3 (`UpNextSection`, `SameModelSection`, `SameChannelSection`) | わずかに増加（~5ms以内） |
| 総カード数 | 最大15件 | upNext≦5, sameModel≦5, sameChannel≦5 | 合計は同等 |
| ホバープリフェッチ対象 | 全15件 | 各セクションのカード | 変更なし（各カードに `onMouseEnter` 付与） |

| 計測項目 | 逐次フェッチ | 並列フェッチ（3セクション） | 改善量 |
|---------|-----------|--------------------------|-------|
| SSRデータ取得時間 | ~120〜200ms | ~60〜100ms | **-40〜120ms** |
| TTFB（キャッシュMISS時） | +120〜200ms | +60〜100ms | **-40〜120ms** |
| LCP（間接効果） | — | — | **-20〜80ms** |

---

### 4.3 関連動画 ホバープリフェッチの効果

#### 実装: `onMouseEnter={() => router.prefetch('/watch/{id}')}`

```
ユーザーが関連動画にマウスオーバー
  └─ router.prefetch('/watch/{videoId}')
     └─ Next.js: 次ページの SSR HTML + JS を prefetch
        └─ バックグラウンドで ~200〜500ms でキャッシュ
           └─ ユーザーがクリック
              └─ ページ遷移: ~50〜100ms（キャッシュ済みのため高速）

プリフェッチなし: ページ遷移 ~500〜1500ms
プリフェッチあり: ページ遷移 ~50〜100ms
改善量: ~450〜1400ms
```

**注意事項**:
- モバイル（タッチデバイス）では `onMouseEnter` が発火しない
- Next.js は `<Link>` のビューポート内検知でも自動プリフェッチする
- 帯域が少ないモバイルユーザーへの過剰プリフェッチを避けるため
  `router.prefetch()` のみで `<Link prefetch={true}>` は使用しない

---

### 4.4 ロード戦略の総合効果まとめ

| 施策 | LCP改善 | TTI改善 | ページ遷移改善 | 実装コスト |
|------|--------|--------|-------------|---------|
| コメント遅延読み込み | +20〜80ms | +50〜150ms | — | 低（実装済み設計あり） |
| 関連動画 並列フェッチ | +20〜80ms | +20〜60ms | — | 低（Promise.all 1行） |
| 関連動画 ホバープリフェッチ | — | — | +450〜1400ms | 低（onMouseEnter 1行） |
| poster 画像 preload | +100〜300ms | — | — | 低（preload() 1行） |
| MuxPlayer lazy import | — | +100〜200ms | — | 低（import path変更のみ） |
| **合計効果（概算）** | **+140〜540ms** | **+170〜410ms** | **+450〜1400ms** | **全体：低** |

---

## 5. モニタリング計画

### 5.1 計測ツール構成（全て無料）

| 計測対象 | ツール | 料金 | 確認頻度 |
|---------|--------|------|---------|
| LCP / FCP / INP / CLS / TTFB | Vercel Speed Insights | 無料 (Hobby) | 週次 |
| TTFF / 再生開始時間 / バッファリング率 | Mux Data Dashboard | 無料 (10K視聴/月) | 週次 |
| 視聴完了率 / 視聴離脱ポイント | Mux Data Dashboard | 無料 | 月次 |
| ページビュー / ユーザー行動 | Vercel Analytics | 無料 (Hobby) | 月次 |
| エラートラッキング | Vercel ログ | 無料 (Hobby) | 即時（エラー時） |
| Lighthouse スコア | Vercel CI + Lighthouse | 無料 | デプロイ時 |

**追加の有料ツール不要。月$0で全指標をカバー。**

---

### 5.2 Vercel Speed Insights 設定

```typescript
// app/layout.tsx（既存設定の確認）
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        {children}
        <SpeedInsights />   {/* LCP/INP/CLS/FCP/TTFB 自動収集 */}
        <Analytics />       {/* ページビュー・トラフィック */}
      </body>
    </html>
  );
}
```

Speed Insights が自動で以下を収集:
- **ページ別**: `/watch/[id]` ページの Core Web Vitals を独立して計測
- **デバイス別**: Mobile / Desktop 別に分類
- **P75値**: ユーザーの75パーセンタイルで評価（Googleのフィールドデータ基準と同一）

---

### 5.3 Mux Data 設定（動画ページ固有）

```typescript
// components/watch/VideoPlayer.tsx
<MuxPlayer
  playbackId={playbackId}
  metadata={{
    // 標準フィールド（snake_case 統一）
    video_id: videoId,            // 動画ID（Mux Data でフィルタ可能）
    video_title: title,
    viewer_user_id: userId,       // ユーザー別分析（任意: Clerk userId）
    page_type: "watch_page",      // ページ種別フィルタ用
    player_name: "ai-theater-web",
    player_version: "1.0.0",
    // AI Theater カスタムディメンション
    // ※ 正式スキーマは video-player-performance-design.md §10.3 が単一定義
    custom_1: video.aiModel,                        // 生成AIモデル名
    custom_2: String(video.qualityScore ?? ""),     // Quality Score raw値 (0-100)
    custom_3: video.channel.id,                     // AI チャンネルID
  }}
  envKey={process.env.NEXT_PUBLIC_MUX_DATA_ENV_KEY}
/>
```

**カスタムディメンション正式スキーマ（video-player-performance-design.md §10.3 より）**:
| Mux カスタムフィールド | 意味 | DB フィールド | 分析用途 |
|---------------------|------|------------|---------|
| `custom_1` | 生成AIモデル名 | `video.aiModel` | モデル別視聴傾向・完了率比較 |
| `custom_2` | Quality Score raw値 (0-100) | `video.qualityScore` | 品質スコア × 視聴完了率の相関 |
| `custom_3` | AI チャンネルID | `video.channel.id` | チャンネル別エンゲージメント分析 |
| `custom_4〜10` | 将来拡張用（処理時間、コスト等） | — | — |

Mux Data Dashboard で確認できる指標:
- **Video Startup Time**: 再生開始〜First Frame（TTFF の代替指標）
- **Rebuffer Ratio**: バッファリング率
- **Playback Failure Rate**: 再生エラー率
- **Watch Time Distribution**: どこで離脱するか
- **Bitrate Distribution**: ABR が選択した品質の分布

---

### 5.4 アラート・対応フロー

```
指標劣化検知
  │
  ├─ LCP > 4.0秒 (Needs Improvement 超過)
  │    └─ Vercel Speed Insights ダッシュボードで確認
  │         ├─ TTFB が遅い → ISRキャッシュ設定確認
  │         ├─ poster画像が遅い → preload() 設定確認
  │         └─ JS バンドル肥大 → bundle-analyzer で調査
  │
  ├─ TTFF > 3.0秒 (Mux Data)
  │    └─ Mux Data → Video Startup Time 確認
  │         ├─ マニフェスト取得遅延 → CDN設定確認
  │         └─ 初期ABR品質が高すぎる → Mux preload設定確認
  │
  ├─ バッファリング率 > 2% (Mux Data)
  │    └─ 回線品質問題 or セグメントサイズ問題
  │         → ABR自動対応のため通常は自己修復
  │
  └─ CLS > 0.1 (Vercel Speed Insights)
       └─ 新コンポーネント追加後に発生しやすい
            → 追加したコンポーネントの aspect-ratio / min-height 確認
```

---

### 5.5 定期レビュースケジュール

| 頻度 | 確認内容 | アクション |
|------|---------|---------|
| **デプロイ時** | Lighthouse CI スコア（LCP/FCP/TTI/CLS） | スコア低下があれば即対応 |
| **週次** | Vercel Speed Insights P75値 / Mux Data TTFF | 目標値との乖離をチェック |
| **月次** | Mux Data 視聴完了率 / 離脱ポイント分析 | コンテンツ/UX改善に活用 |
| **四半期** | 目標値の見直し / 新機能追加後の再評価 | ベースラインを更新 |

---

## 6. ベンチマーク計測方法

### 6.1 開発時の計測手順

```bash
# 1. Lighthouse CLI でローカル計測
npx lighthouse http://localhost:3000/watch/[test-video-id] \
  --output html \
  --output-path ./reports/lighthouse-watch-$(date +%Y%m%d).html

# 2. Core Web Vitals の確認ポイント
#    - LCP: "Largest Contentful Paint element" が poster 画像であることを確認
#    - CLS: "Layout shift elements" が 0 であることを確認
#    - TTI: "Time to Interactive" が 3.5秒以下であることを確認

# 3. Bundle サイズ確認
ANALYZE=true npx next build
```

### 6.2 本番環境での計測

```
Vercel Speed Insights
  URL: https://vercel.com/[team]/[project]/speed-insights
  フィルタ: Path = "/watch/[id]"
  期間: 7日間
  確認指標: LCP (P75), INP (P75), CLS (P75)

Mux Data
  URL: https://dashboard.mux.com/data
  フィルタ: page_type = "watch_page"
  確認指標: Video Startup Time, Rebuffer Ratio
```

---

## 7. パフォーマンス予算（Performance Budget）

MVP段階での予算（超えたら調査・対応）:

| リソース | 予算上限 | 現在推定値 | 余裕 |
|---------|--------|----------|------|
| JS バンドル（初期） | ≤ 200KB (gzip) | ~120KB（Server Components活用） | ✅ |
| CSS バンドル | ≤ 50KB (gzip) | ~30KB（Tailwind purge） | ✅ |
| poster 画像 | ≤ 200KB (WebP) | ~80〜200KB（Mux CDN） | ⚠ 要監視 |
| 初期 API リクエスト数 | ≤ 2 | 1（動画メタデータのみ SSR） | ✅ |
| 総ページ重量 | ≤ 1MB | ~400〜600KB（推定） | ✅ |

---

## 8. ホーム画面との指標比較

| 指標 | ホーム画面目標 | 動画再生ページ目標 | 差分・理由 |
|------|------------|----------------|----------|
| LCP | < 2.5秒 | ≤ 2.5秒 | 同等。LCP要素は異なる（サムネイル vs poster） |
| FCP | — | ≤ 1.8秒 | 動画ページ固有（SEO/OGP対応でSSR必須） |
| TTI | — | ≤ 3.5秒 | 動画ページ固有（Player hydration が重要） |
| INP | < 200ms | ≤ 200ms | 同等 |
| CLS | < 0.1 | ≤ 0.1 | 同等。Player は aspect-video で管理 |
| TTFB | — | ≤ 200ms | ISR revalidate=3600（ホームより長いキャッシュ） |
| TTFF | — | ≤ 2.0秒 | **動画ページ固有の最重要指標** |

---

## 9. 実装確認チェックリスト

### パフォーマンス目標達成のための確認項目

**Core Web Vitals**
- [ ] Vercel Speed Insights が `app/layout.tsx` に導入されている
- [ ] `/watch/[id]` ページの LCP P75 ≤ 2.5秒
- [ ] `/watch/[id]` ページの FCP P75 ≤ 1.8秒
- [ ] `/watch/[id]` ページの INP P75 ≤ 200ms
- [ ] `/watch/[id]` ページの CLS P75 ≤ 0.1

**Mux Player**
- [ ] `NEXT_PUBLIC_MUX_DATA_ENV_KEY` が Vercel 環境変数に設定されている
- [ ] MuxPlayer の `metadata` に `video_id`, `page_type`, `player_name` が設定されている
- [ ] MuxPlayer の `metadata` に `custom_1` (aiModel), `custom_2` (qualityScore raw), `custom_3` (channel.id) が設定されている（スキーマは performance-design.md §10.3 参照）
- [ ] Mux Data で Video Startup Time (TTFF) P75 ≤ 2.0秒
- [ ] Mux Data で Player Startup Time (初回バッファ遅延) P75 ≤ 1.0秒
- [ ] Mux Data で Playback Startup Success Rate (再生開始率) ≥ 85%
- [ ] Mux Data で Rebuffer Ratio ≤ 1.0%
- [ ] Mux Data で Video Completion Rate ≥ 65%
- [ ] Mux Data で Watch Time Ratio ≥ 動画長の60%

**ロード戦略**
- [ ] コメントセクションの IntersectionObserver (rootMargin: "300px") が機能している
- [ ] 関連動画が `Promise.all` で並列フェッチされている
- [ ] 関連動画カードの `onMouseEnter` で `router.prefetch` が動作している
- [ ] poster 画像の `preload()` が `<head>` に `<link rel="preload">` として出力されている

---

## 改訂履歴

| 日付 | 版 | 内容 | 担当 |
|------|---|------|------|
| 2026-02-23 | 1.0 | 初版作成（Task #5） | analyzer |
| 2026-02-23 | 1.1 | researcher (Task #4) + tech-leader フィードバック反映: Mux Data 指標に再生開始率・初回バッファ遅延・視聴完了率・平均視聴時間率を追加、AI生成メタデータ用カスタムディメンション (custom_1〜3) を追加、チェックリスト拡充 | analyzer |
| 2026-02-23 | 1.2 | P0 整合性修正反映 (Task #14): ISSUE-3（コメントClient遅延読み込み確定）の注記を §4.1 に追加、ISSUE-4（関連動画3セクション分離採用）を §4.2 に反映。ベンチマーク数値に変更なし（1クエリ構造は維持） | analyzer |
| 2026-02-23 | 1.3 | VR-2 対応 (Task #20): Mux Data custom_1..3 スキーマを performance-design.md §10.3 正規定義に統一。custom_2 (processingTime → quality_score_raw), custom_3 (agentId → channel.id) を修正 | analyzer |
