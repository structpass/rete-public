import type { ModelTheme } from '../types';

/** API・データ共通カテゴリの共通仕様テーマ。全PJ横断のグローバル規約は compliesWith で参照する。 */
export const API_DATA_THEMES: ModelTheme[] = [
  {
    id: 'dto-boundary',
    title: 'DTO境界',
    category: 'api-data',
    status: 'active',
    summary:
      'Service / Controller は ORM Entity を直接 return せず Response DTO 経由。応答 DTO は API 仕様書のスキーマに出さない（装飾は入力 DTO 側だけ）。',
    sources: ['architecture-invariants §1', 'struct-pass-reference 参照実装', 'cmn-0211/cmn-0234'],
    purpose:
      'Entity を直返しすると、後で列が増えたとき自動的にレスポンスに漏れる。Decimal / Date / enum など ORM 固有型もそのまま JSON に出てフロントと型がズレる。' +
      '応答型に Swagger 用の @ApiProperty などの装飾を付けると「同じ shape を 2 箇所に書く」状態になり、片側だけ更新されて必ず食い違う（cmn-0211 が解消した SSOT が局所復活する）。' +
      '飾りを付けない前提で repo 全体が一致しているため、唯一例外を作って揃え先から離れるよりも、方針を正本に書いて閉じる。',
    spec: [
      {
        type: 'p',
        text: 'Service / Controller は ORM Entity を直接 return しない。Response DTO を定義し、Entity → DTO の mapper を経由する。単項目 CRUD でも適用（モック・試作コードは除外）。',
      },
      {
        type: 'p',
        text:
          'Response DTO は型のみの定義（`export type { ... } from "@rete/shared"` 等）か class 実装の装飾なし版に留め、' +
          'API 仕様書（Swagger / OpenAPI）のスキーマに出すための装飾（@ApiProperty / @ApiOkResponse({ type }) 等の type 参照）は入力 DTO 側だけに付ける。' +
          '形の SSOT は @rete/shared か class 本体であり、スキーマ記述のために shape を書き写さない。',
      },
    ],
    compliesWith: [{ label: 'architecture-invariants §1 DTO境界（全PJ横断グローバル規約）' }],
    relatedAdr: [{ label: 'ADR 0002 Repository returns entity, mapping in service' }],
    examples: {
      good: [
        '*.repository.ts で取得 → *.mapper.ts で DTO へ → controller は DTO を返す',
        'response.dto.ts: `export type { FooResponseDto } from "@rete/shared"`（装飾ゼロ・形の SSOT は shared）',
      ],
      bad: [
        'service が prisma の戻り値（Entity）をそのまま return する',
        'response.dto.ts: class FooResponseDto { @ApiProperty() ... } を shared 型と同型で二重に定義',
      ],
    },
  },
  {
    id: 'repository-separation',
    title: 'データアクセス層の分離',
    category: 'api-data',
    status: 'active',
    summary: 'Service は ORM Client を直接呼ばず Repository / data-access helper 経由。',
    sources: ['architecture-invariants §2', 'struct-pass-reference 参照実装'],
    purpose:
      'Service が ORM を直接呼ぶと、テストに ORM モックが必須になり実質書かれなくなる。DB スキーマ変更の影響範囲が拡散する。',
    spec: [
      {
        type: 'p',
        text: 'Service は ORM Client を直接呼ばない。Repository（または data-access helper）経由で DB に触る。',
      },
      {
        type: 'note',
        text: '例外: Service 層が存在しない薄いプロジェクト（純 REST の 1 ファイル実装）は除外。',
      },
    ],
    compliesWith: [
      { label: 'architecture-invariants §2 データアクセス層の分離（グローバル規約）' },
    ],
  },
  {
    id: 'error-centralization',
    title: 'エラーハンドリングの一元化',
    navLabel: 'エラー一元化',
    category: 'api-data',
    status: 'active',
    summary: 'try/catch をモジュールに撒かず上位 Filter / Interceptor で共通処理。',
    sources: ['architecture-invariants §4', 'common/filters/prisma-exception.filter'],
    purpose:
      'モジュール単位で try/catch を書くと、必ずどこか 1 箇所で実装が漏れる（片側だけ修正される後追い修正の非対称）。',
    spec: [
      {
        type: 'p',
        text: 'モジュール内の try/catch より、上位の Filter / Interceptor / Middleware で共通処理する。NestJS なら @Catch(PrismaClientKnownRequestError) の ExceptionFilter。',
      },
    ],
    compliesWith: [
      { label: 'architecture-invariants §4 エラーハンドリングの一元化（グローバル規約）' },
    ],
  },
  {
    id: 'response-shape',
    title: 'response shape・命名',
    category: 'api-data',
    status: 'active',
    summary:
      '応答 DTO の置き場は @rete/shared。エンベロープ・エラー形・サフィックスの付け方を API 横断で固定する。',
    sources: [
      'packages/shared/src/types/api-response.ts',
      'packages/backend/src/common/dto/response.dto.ts',
      'packages/backend/src/common/filters/http-exception.filter.ts',
      'architecture-invariants §1 / §5',
      'cmn-0015/cmn-0211・v2-245',
    ],
    purpose:
      '同じ応答形を層ごとに別々に書くと、片側だけ直して必ず食い違う。frontend 側に「backend の DTO と同形」の型を書き写す運用は、backend の列追加のたびに写し漏れを生み、型検査もテストも差分を検出できない（v2-245 で 6 ドメインが二重定義になっていた）。' +
      'エンベロープとエラー形が経路ごとに違うと、フロントは経路ごとに別の剥がし方を書くことになり、画面を 1 つ足すたびに同じ判断をやり直す。',
    spec: [
      {
        type: 'p',
        text: '複数の層（backend / frontend）が同じ形を受け渡す応答は、形の正本を @rete/shared の `packages/shared/src/types/<概念>.ts` に置く。backend の `*.dto.ts` は形を書かず shared からの再公開（`export type { XxxResponseDto } from "@rete/shared"`）に留め、frontend も同じ型を import する。画面側の既存名は `import type { XxxResponseDto } from "@rete/shared"; export type Xxx = XxxResponseDto;` の別名で保つ＝呼び出し側を書き換えない（型を再輸出するだけのファイルは `export type { XxxResponseDto } from "@rete/shared"` でよい。別名を同じファイル内でも使う場合は再輸出形式では名前が束縛されず型検査が落ちる）。',
      },
      {
        type: 'table',
        head: ['形の種類', '置き場（正本）', '例'],
        rows: [
          [
            '複数層が共有する応答',
            '@rete/shared `types/<概念>.ts`',
            'AccountResponseDto / TaskResponseDto / ChatThemeDetailDto / TenantResponseDto',
          ],
          [
            'その上に載る共通エンベロープ',
            '@rete/shared `types/api-response.ts`',
            'ApiResponse<T> / PaginatedResponse<T> / PaginationMeta',
          ],
          [
            'エンベロープの生成ヘルパー',
            'backend `common/dto/response.dto.ts`',
            'ok / okPaginated / okMessage / buildPaginatedMeta（形は宣言せず shared を再公開）',
          ],
          [
            'エラー応答',
            'backend `common/filters/*.ts`（共通フィルタが唯一の生成元）',
            '{ success: false, error: { code, message, details? } }',
          ],
          [
            '単一の層でしか使わない応答',
            'その層（backend の dto 等）',
            'MessageResponse（型を宣言するのは backend のみ。frontend は受け取るだけ）',
          ],
        ],
      },
      {
        type: 'list',
        items: [
          '単一リソースの取得・作成・更新・削除 — `ApiResponse<T>` = `{ success: true, data }`',
          'ページングする一覧 — `PaginatedResponse<T>` = `{ success: true, data: T[], meta }`（meta は PaginationMeta: total / page / limit / totalPages）',
          'ページングしない一覧 — `ApiResponse<T[]>`（meta を持たせない。ページング意味論を偽らない・dsk-0228）',
          'メッセージ応答 — `{ success: true, data: { message } }`（backend の okMessage）',
        ],
      },
      {
        type: 'p',
        text: '成功は必ず `success: true`、失敗は必ず `success: false`。Service は envelope を手で組まず共通ヘルパー（ok / okPaginated / okMessage）で包む。',
      },
      {
        type: 'p',
        text: 'エラー形は成功と同じ envelope の失敗版 `{ success: false, error: { code, message, details? } }`。code は機械可読な識別子（UNAUTHORIZED / FORBIDDEN / NOT_FOUND / CONFLICT / BAD_REQUEST / VALIDATION_ERROR / TOO_MANY_REQUESTS / SERVICE_UNAVAILABLE / INTERNAL_ERROR 等）で画面が出し分け、message は利用者向けの文言にする。生成元は共通フィルタ（http-exception / prisma-exception / upload-error）で、モジュール側でエラー body を自作しない。',
      },
      {
        type: 'note',
        text: 'class-validator 由来の失敗は message を "Validation failed" に固定し、項目ごとの理由は details.validationErrors[] にだけ入る（frontend の extractValidationErrorMessage が読む）。理由を message へ混ぜると、画面がどちらの経路でも同じ文言を出せなくなる。',
      },
      {
        type: 'p',
        text: '命名: 応答 DTO は `<概念>ResponseDto`、その要約は `<概念>SummaryDto`、ツリー等の入れ子は `<概念>TreeResponseDto`。日時は ISO 8601 文字列で返し、null 許容のフィールドもキーを省略せず null を入れる（フロントが「未設定」と「項目が無い」を区別できるようにする）。真偽の導出フラグは hasXxx / isXxx。複数形・case・route の命名は本タブ 用語・命名「複数形・case規約」を正本とする。',
      },
      {
        type: 'note',
        text: '配置を移す時は形を変えない（フィールドの追加・削除・必須/任意の変更を混ぜない）。移設と仕様変更を同じ差分に載せると、レビューでも型検査でも「どちらが意図か」を切り分けられなくなる。',
      },
    ],
    compliesWith: [
      { label: 'architecture-invariants §1 DTO境界 / §5 shared 型整合（全PJ横断グローバル規約）' },
      { label: '本タブ API・データ共通「DTO境界」' },
      { label: '本タブ 用語・命名「複数形・case規約」' },
    ],
    examples: {
      good: [
        'backend response.dto.ts: `export type { TaskResponseDto } from "@rete/shared"`（形を書かない）',
        'frontend lib/api.ts: `import type { TaskResponseDto } from "@rete/shared"; export type Task = TaskResponseDto;`（既存名を保ったまま正本を shared へ寄せる。同名を再輸出するだけの行ならば `export type { TaskResponseDto as Task } from "@rete/shared"`）',
        'service: `return okPaginated(dtos, buildPaginatedMeta(total, page, limit))`',
      ],
      bad: [
        'response.dto.ts に class TaskResponseDto を shared と同型で二重に定義する',
        'frontend の lib/api.ts に「backend の XxxDto と同形」の interface を書き写す',
        'モジュールの filter / interceptor で独自のエラー body を返す（code の体系が経路ごとに割れる）',
      ],
    },
  },
  {
    id: 'shared-helpers',
    title: '共通ヘルパ（base-list / response-dto / exception-filter）',
    navLabel: '共通ヘルパ',
    category: 'api-data',
    status: 'active',
    summary: '一覧・DTO・例外の共通ヘルパを再実装せず参照実装を使う。',
    sources: ['struct-pass-reference packages/backend/src/common/', 'architecture-invariants §3'],
    purpose:
      '2 モジュール目で逐語コピペが完成すると、3 モジュール目以降で改修コストが N 倍になる。共通ヘルパを先に抽出してから着手する。',
    spec: [
      {
        type: 'p',
        text: '2 モジュール目を実装する時、1 モジュール目と逐語差分が 80% 超なら BaseXxx / shared helper を先に抽出してから着手する（「後で共通化」は禁止）。',
      },
      {
        type: 'list',
        items: [
          'common/services/base-list.helper.ts — 一覧取得（ページング/検索）の共通化',
          'common/dto/response.dto.ts — レスポンス DTO の共通形',
          'common/filters/prisma-exception.filter.ts — Prisma 例外の一元ハンドリング',
        ],
      },
    ],
    compliesWith: [
      { label: 'architecture-invariants §3 コピペ禁止・2モジュール目の法則（グローバル規約）' },
    ],
  },
];
