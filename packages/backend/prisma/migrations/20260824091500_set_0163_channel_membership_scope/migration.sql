-- set-0163: 親 PROJECT 経由の可視性を保ったまま、チャネル直接 membership / grant を加算できるようにする。
ALTER TYPE "MembershipScopeType" ADD VALUE IF NOT EXISTS 'CHANNEL';
