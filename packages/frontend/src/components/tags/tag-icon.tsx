import {
  Tag,
  Star,
  Flag,
  Bookmark,
  Heart,
  Bell,
  Pin,
  Award,
  Briefcase,
  Folder,
  FileText,
  Hash,
  Zap,
  AlertCircle,
  CheckCircle,
  Circle,
  Clock,
  Calendar,
  Clipboard,
  Lock,
  Key,
  Eye,
  Rocket,
  Target,
  type LucideIcon,
} from 'lucide-react';
import {
  TAG_COLORS,
  TAG_COLOR_DEFAULT,
  type TagColorName,
  TAG_ICONS,
  type TagIconName,
} from '@rete/shared';

/**
 * タグアイコンのレジストリ（rete-files-0006 / SSOT は @rete/shared の TAG_ICONS）。
 * backend の許可集合（@IsIn(TAG_ICONS)）と同じ名前空間を frontend の lucide コンポーネントへ写す。
 * registry の key は TAG_ICONS の全要素を網羅する（型 Record<TagIconName, LucideIcon> で漏れを compile time に検出）。
 * File タグ / AnnouncementTag の両方で使う共有コンポーネント（rete-home-0043）。
 */
const TAG_ICON_REGISTRY: Record<TagIconName, LucideIcon> = {
  Tag,
  Star,
  Flag,
  Bookmark,
  Heart,
  Bell,
  Pin,
  Award,
  Briefcase,
  Folder,
  FileText,
  Hash,
  Zap,
  AlertCircle,
  CheckCircle,
  Circle,
  Clock,
  Calendar,
  Clipboard,
  Lock,
  Key,
  Eye,
  Rocket,
  Target,
};

/** 許可アイコン名の一覧（マスタ UI のアイコン選択グリッドで使う・@rete/shared を再公開）。 */
export const TAG_ICON_NAMES = TAG_ICONS;

/** 許可色名の一覧（マスタ UI の色選択スウォッチで使う・@rete/shared を再公開）。 */
export const TAG_COLOR_NAMES = TAG_COLORS;

/**
 * タグ色名 → 実 hex のレジストリ（rete-files-0021/0022 / SSOT は @rete/shared の TAG_COLORS）。
 * backend は色名だけを保存し（@IsIn(TAG_COLORS)）、描画側の hex への写像は frontend に閉じる。
 * 値は Tailwind 系のトーンに合わせる（彩度を抑えめにし、一覧チップで色がうるさくならない範囲）。
 * 型 Record<TagColorName, string> で TAG_COLORS の漏れを compile time に検出する。
 */
export const TAG_COLOR_HEX: Record<TagColorName, string> = {
  slate: '#64748b',
  red: '#dc2626',
  orange: '#ea580c',
  amber: '#d97706',
  yellow: '#ca8a04',
  green: '#16a34a',
  teal: '#0d9488',
  blue: '#2563eb',
  indigo: '#4f46e5',
  violet: '#7c3aed',
  pink: '#db2777',
  rose: '#e11d48',
};

/** 与えられた名前が許可アイコンか（未知名は Tag にフォールバックするための型ガード）。
 *  自前 key のみ照合する（'constructor' 等の prototype チェーン汚染を避けるため hasOwn を使う）。 */
function isTagIconName(name: string): name is TagIconName {
  return Object.hasOwn(TAG_ICON_REGISTRY, name);
}

/** 与えられた名前が許可色か（未知名は既定色にフォールバックするための型ガード）。
 *  自前 key のみ照合する（prototype チェーン汚染を避ける）。 */
function isTagColorName(name: string): name is TagColorName {
  return Object.hasOwn(TAG_COLOR_HEX, name);
}

/** 色名を hex へ解決する（未知名・未指定は既定色 / 旧データ救済）。 */
export function resolveTagColorHex(name?: string): string {
  return isTagColorName(name ?? '')
    ? TAG_COLOR_HEX[name as TagColorName]
    : TAG_COLOR_HEX[TAG_COLOR_DEFAULT];
}

/**
 * タグアイコン 1 つを描画する。未知のアイコン名（マスタ改変・将来削除）は既定の Tag にフォールバックし、
 * 描画が壊れないようにする（一覧チップ / マスタ UI 共用）。
 * color（色名）を渡すと TAG_COLOR_HEX で着色する（rete-files-0021/0022・lucide は currentColor 描画）。
 */
export function TagIcon({
  name,
  size = 12,
  className,
  color,
}: {
  name: string;
  size?: number;
  className?: string;
  /** 色名（TAG_COLORS のいずれか）。未指定なら継承色（currentColor）のまま。 */
  color?: string;
}) {
  const Icon = isTagIconName(name) ? TAG_ICON_REGISTRY[name] : Tag;
  return (
    <Icon
      width={size}
      height={size}
      className={className}
      style={color !== undefined ? { color: resolveTagColorHex(color) } : undefined}
      aria-hidden="true"
    />
  );
}
