'use client';
import { ActionButton } from '@/features/settings/components/primitives';
import { Plus } from 'lucide-react';

// set-0194: 3ペイン共通の追加ボタン。表示構造だけを一元化し、各ペイン固有の業務判断（create 対象の決定・toast）は呼び出し側に残す。
export function PaneAddButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <ActionButton
      icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
      onClick={onClick}
      disabled={disabled}
      ariaLabel={label}
    >
      {label}
    </ActionButton>
  );
}
