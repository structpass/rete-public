'use client';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { FormField } from '@/components/ui/form-field';
import { Labeled, DemoRow } from './shared';

/**
 * comp-input / comp-select / comp-form-field テーマの実描画見本（mdl-0003 Batch A）。
 * 実物コンポーネントを描画するため、components/ui/* の改修に見本が自動追随する。
 */

/** Input / Textarea の状態一覧。 */
export function InputStatesDemo() {
  return (
    <div className="max-w-md space-y-4">
      <Labeled label="Input 通常（登録対象=薄青 bg-input-bg・placeholder は薄灰）">
        <Input placeholder="タイトルを入力" />
      </Labeled>
      <Labeled label="Input disabled（--sp-disabled-bg 薄灰 + 灰字 + カーソル禁止）">
        <Input placeholder="編集不可" disabled />
      </Labeled>
      <Labeled label="Textarea（min-h 80px・複数行）">
        <Textarea placeholder="本文を入力" />
      </Labeled>
    </div>
  );
}

/** 正しい例: 共通 Input / Textarea をそのまま使う（装飾は加えない）。 */
export function InputUsageGoodDemo() {
  return (
    <DemoRow>
      <Labeled label="共通 Input をそのまま（枠線・focus・角丸が全画面で同じ）">
        <Input className="w-64" placeholder="名称を入力" />
      </Labeled>
      <Labeled label="複数行は Textarea（Input の縦伸ばしをしない）">
        <Textarea className="w-64" placeholder="コメントを入力" />
      </Labeled>
    </DemoRow>
  );
}

/**
 * だめな例: 画面ごとの個別装飾。規約違反の展示のため意図的に inline style で書いている（実装で真似しない）。
 */
export function InputUsageBadDemo() {
  return (
    <DemoRow>
      <Labeled label="border 色・角丸を画面独自に作り込む">
        <input
          type="text"
          placeholder="検索キーワード"
          style={{
            width: '16rem',
            height: '2.5rem',
            padding: '0 0.75rem',
            fontSize: '0.875rem',
            border: '2px solid #7c3aed',
            borderRadius: '9999px',
            outline: 'none',
          }}
        />
      </Labeled>
      <Labeled label="高さ・文字サイズが画面独自（h-10 / text-sm から逸脱）">
        <input
          type="text"
          placeholder="検索キーワード"
          style={{
            width: '16rem',
            height: '3.25rem',
            padding: '0 0.75rem',
            fontSize: '1.05rem',
            border: '1px solid #c5d0e0',
            borderRadius: '0.375rem',
            outline: 'none',
          }}
        />
      </Labeled>
    </DemoRow>
  );
}

/** Select の基本形（空選択 / 選択済み。トリガーは実物＝クリックで実際に開く）。 */
export function SelectStatesDemo() {
  return (
    <DemoRow>
      <Labeled label="空選択（placeholder は薄灰ラベル）">
        <div className="w-56">
          <Select>
            <SelectTrigger>
              <SelectValue placeholder="担当者を選択" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="a">山田</SelectItem>
              <SelectItem value="b">佐藤</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Labeled>
      <Labeled label="選択済み（クリックで実物のリストが開く）">
        <div className="w-56">
          <Select defaultValue="b">
            <SelectTrigger>
              <SelectValue placeholder="担当者を選択" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="a">山田</SelectItem>
              <SelectItem value="b">佐藤</SelectItem>
              <SelectItem value="c" disabled>
                鈴木（無効）
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Labeled>
      <Labeled label="disabled（トリガーごと不活性）">
        <div className="w-56">
          <Select disabled>
            <SelectTrigger>
              <SelectValue placeholder="選択不可" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="a">山田</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Labeled>
    </DemoRow>
  );
}

/** 正しい例: 共通 Select + placeholder 文言で空状態を示す。 */
export function SelectUsageGoodDemo() {
  return (
    <DemoRow>
      <Labeled label="共通 Select（trigger 意匠・チェック表示・キーボード操作が統一）">
        <div className="w-56">
          <Select defaultValue="open">
            <SelectTrigger>
              <SelectValue placeholder="状態を選択" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">未対応</SelectItem>
              <SelectItem value="progress">対応中</SelectItem>
              <SelectItem value="done">完了</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Labeled>
    </DemoRow>
  );
}

/**
 * だめな例: native select の直置きや独自プルダウンの作り込み。
 * 規約違反の展示のため意図的に素の select / inline style で書いている（実装で真似しない）。
 */
export function SelectUsageBadDemo() {
  return (
    <DemoRow>
      <Labeled label="native select 直置き（OS依存の見た目・他画面と不揃い）">
        <select
          style={{
            width: '14rem',
            height: '2.5rem',
            padding: '0 0.5rem',
            fontSize: '0.875rem',
            border: '1px solid #999',
          }}
          defaultValue=""
        >
          <option value="" disabled>
            状態を選択
          </option>
          <option value="open">未対応</option>
        </select>
      </Labeled>
      <Labeled label="空選択ラベルを値と同じ濃さで置く（未選択と選択済みの区別が消える）">
        <button
          type="button"
          style={{
            width: '14rem',
            height: '2.5rem',
            padding: '0 0.75rem',
            fontSize: '0.875rem',
            border: '1px solid #c5d0e0',
            borderRadius: '0.375rem',
            background: '#fff',
            color: '#111',
            textAlign: 'left',
          }}
        >
          状態を選択 ▾
        </button>
      </Labeled>
    </DemoRow>
  );
}

/** FormField の構成（ラベル / 必須バッジ / エラー文言）。 */
export function FormFieldStatesDemo() {
  return (
    <div className="max-w-md space-y-5">
      <Labeled label="ラベル + 入力（space-y-1.5 の縦積み）">
        <FormField label="タイトル" htmlFor="demo-ff-1" className="w-full">
          <Input id="demo-ff-1" placeholder="タイトルを入力" />
        </FormField>
      </Labeled>
      <Labeled label="required（赤の * 必須 バッジがラベル右に付く）">
        <FormField label="メールアドレス" required htmlFor="demo-ff-2" className="w-full">
          <Input id="demo-ff-2" type="email" placeholder="you@example.com" />
        </FormField>
      </Labeled>
      <Labeled label="error（入力の下に赤文言）">
        <FormField
          label="メールアドレス"
          required
          error="メールアドレスの形式が正しくありません"
          htmlFor="demo-ff-3"
          className="w-full"
        >
          <Input id="demo-ff-3" type="email" defaultValue="foo@" />
        </FormField>
      </Labeled>
    </div>
  );
}

/** 正しい例: 1項目 = FormField で束ねる。 */
export function FormFieldUsageGoodDemo() {
  return (
    <div className="max-w-md">
      <FormField
        label="プロジェクト名"
        required
        error="プロジェクト名は必須です"
        htmlFor="demo-ff-good"
        className="w-full"
      >
        <Input id="demo-ff-good" placeholder="名称を入力" />
      </FormField>
    </div>
  );
}

/**
 * だめな例: ラベル・必須・エラーの手組み。規約違反の展示のため意図的に inline style で書いている。
 */
export function FormFieldUsageBadDemo() {
  return (
    <div className="max-w-md" style={{ fontSize: '0.875rem' }}>
      <div style={{ marginBottom: '0.125rem' }}>
        <span style={{ fontWeight: 700 }}>プロジェクト名</span>
        <span style={{ color: '#e11d48', marginLeft: '0.25rem' }}>※必須！</span>
      </div>
      <input
        type="text"
        placeholder="名称を入力"
        style={{
          width: '100%',
          height: '2.5rem',
          padding: '0 0.75rem',
          border: '1px solid #c5d0e0',
          borderRadius: '0.375rem',
        }}
      />
      <div style={{ color: 'red', fontSize: '0.75rem', marginTop: '0.5rem', fontStyle: 'italic' }}>
        ！エラー：プロジェクト名は必須です！
      </div>
    </div>
  );
}
