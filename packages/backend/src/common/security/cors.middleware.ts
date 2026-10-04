import type { Request, Response, NextFunction } from 'express';

/**
 * ブラウザ JS へ読み取りを許可する応答ヘッダ。
 *
 * CORS 越しの fetch では、既定の 7 ヘッダ（Cache-Control / Content-Language / Content-Length /
 * Content-Type / Expires / Last-Modified / Pragma）以外は明示しない限りクライアントから読めない。
 * Retry-After は 503（混雑）時の再送目安で、読めなければクライアント側の待ち時間制御が働かず
 * 「即やり直して再び 503」を招く（cmn-0235 で足したヘッダが cmn-0251 まで隠れていた）。
 */
export const EXPOSED_RESPONSE_HEADERS = ['Retry-After'] as const;

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface CorsMiddlewareConfig {
  /** 全ルートで許可するオリジン（CORS_ORIGIN 由来）。 */
  allowedOrigins: string[];
  /** クロスサービス限定で追加許可するオリジン（CROSS_SERVICE_CORS_ORIGIN 由来）。 */
  crossServiceOrigins: string[];
  /** 上の追加許可を効かせるルート（共有定数 CROSS_SERVICE_ROUTES）。 */
  crossServiceRoutes: readonly string[];
}

/**
 * CORS ヘッダを手書きで付与するミドルウェア（enableCors は使わない）。
 *
 * ref-0037: reference frontend が表示設定 API を直接 fetch するためのクロスサービス許可を、
 * 対象ルートだけに限定する（security-reviewer 指摘: enableCors のグローバル allowlist に混ぜると
 * reference 侵害時の blast radius が accounts / tasks / chat 等の全 API・全操作に及ぶ）。
 *
 * main.ts から切り出してある理由は、許可判定と expose ヘッダを spec で固定できるようにするため
 * （bootstrap の中に埋めると、どの経路でも検証できない・cmn-0251）。
 */
export function createCorsMiddleware(config: CorsMiddlewareConfig) {
  const { allowedOrigins, crossServiceOrigins, crossServiceRoutes } = config;

  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;
    if (!origin) return next();

    const allowed = crossServiceRoutes.includes(req.path)
      ? [...allowedOrigins, ...crossServiceOrigins]
      : allowedOrigins;
    if (!allowed.includes(origin)) {
      // CORS response headers alone do not stop a form or other simple request from reaching a
      // state-changing endpoint. Reject untrusted browser origins before session/controller code
      // runs. Requests without Origin remain available to same-origin and server-to-server callers.
      if (req.method === 'OPTIONS' || STATE_CHANGING_METHODS.has(req.method.toUpperCase())) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Origin is not allowed' },
        });
        return;
      }
      return next();
    }

    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    // 実応答（GET / POST など）と preflight の両方で返す。preflight だけに付けても実応答側で
    // 読み取り許可が付かないため意味がない。
    res.setHeader('Access-Control-Expose-Headers', EXPOSED_RESPONSE_HEADERS.join(', '));

    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
      const requestedHeaders = req.headers['access-control-request-headers'];
      if (requestedHeaders) {
        res.setHeader('Access-Control-Allow-Headers', requestedHeaders as string);
      }
      res.statusCode = 204;
      res.end();
      return;
    }
    next();
  };
}
