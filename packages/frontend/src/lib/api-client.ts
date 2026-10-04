import axios from 'axios';

/**
 * 共有 axios インスタンス。baseURL はハードコードせず env から取る。
 *
 * 開発デフォルトは localhost:3001（reference 準拠 / Company ポート原則「process.env ?? デフォルト」）。
 * 本番デプロイ時は NEXT_PUBLIC_API_BASE_URL の設定が必須（未設定だと開発デフォルトに接続を試みる）。
 *
 * 認証は後フェーズ。トークン付与が必要になった時点で request interceptor を追加する
 * （barrel @/features/... を import するとここが循環依存になるため、本ファイルは
 *  feature の barrel を一切 import しない）。
 */
const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api/v1',
  // session cookie(httpOnly) を cross-origin(frontend→backend) で送受信するため必須。
  // backend は CORS credentials:true + 具体 origin 許可で対応している。
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default apiClient;
