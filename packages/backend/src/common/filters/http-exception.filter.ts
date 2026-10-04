import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'An unexpected error occurred';
    let code = 'INTERNAL_ERROR';
    let details: Record<string, unknown> | undefined;
    let retryAfter: number | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp.message as string) || message;
        if (Array.isArray(resp.message)) {
          // class-validator 由来: 配列 message から details を組み立てる
          details = { validationErrors: resp.message };
          message = 'Validation failed';
          code = 'VALIDATION_ERROR';
        } else if (
          resp.details &&
          typeof resp.details === 'object' &&
          !Array.isArray(resp.details)
        ) {
          details = resp.details as Record<string, unknown>;
        }
        if (typeof resp.code === 'string') {
          code = resp.code;
        }
        // 503（一時的な混雑）専用。status を条件に含めないと、将来 4xx の例外 body が retryAfter を
        // 持った時に自動でヘッダへ載る＝ロックアウト解除までの時間を details から外した経緯（set-0038）を
        // 機械可読ヘッダで巻き戻す退行罠になる。
        if (status === HttpStatus.SERVICE_UNAVAILABLE && typeof resp.retryAfter === 'number') {
          retryAfter = resp.retryAfter;
        }
      }

      // status からの導出は「例外が code を明示していない時だけ」効かせる。明示 code を上書きすると
      // 同じ status に複数の意味がある経路（409 = 一意制約違反 CONFLICT / 競合 WRITE_CONFLICT、
      // 503 = SERVICE_UNAVAILABLE）を画面が出し分けられなくなる（cmn-0235）。
      if (code === 'INTERNAL_ERROR') {
        if (status === HttpStatus.UNAUTHORIZED) code = 'UNAUTHORIZED';
        else if (status === HttpStatus.FORBIDDEN) code = 'FORBIDDEN';
        else if (status === HttpStatus.NOT_FOUND) code = 'NOT_FOUND';
        else if (status === HttpStatus.CONFLICT) code = 'CONFLICT';
        // 429: レート制限（ThrottlerGuard）/ ログイン試行ロックアウト（H6）。throttler 由来は
        // resp.code を持たないため status から導出する（operational-policy §1 error 体系）。
        else if (status === HttpStatus.TOO_MANY_REQUESTS) code = 'TOO_MANY_REQUESTS';
        else if (status === HttpStatus.BAD_REQUEST) code = 'BAD_REQUEST';
        // 503: Prisma 由来（P2028 / P2024）は code を明示するが、message 文字列だけで throw される
        // 既存の ServiceUnavailableException（MFA 暗号鍵未設定 / SMTP 未設定）もあるため status から導出する。
        else if (status === HttpStatus.SERVICE_UNAVAILABLE) code = 'SERVICE_UNAVAILABLE';
      }
    }

    // 観測性(H9 / 自前 error tracking・外部サービス不使用): サーバエラー(5xx)は request コンテキスト
    // 付きで error level に残し、stdout ログから追跡可能にする。非 HttpException（未処理例外）は
    // status=500 に倒れるため本分岐で stack 付きログを担保する。4xx は想定内のためログしない（ノイズ回避）。
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // request.url は外部入力。CR/LF を除去してログ行偽装（log injection / CWE-117）を防ぐ。
      const safeUrl = request?.url?.replace(/[\r\n]/g, '');
      this.logger.error(
        `${request?.method} ${safeUrl} -> ${status} ${code}: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else if (status === HttpStatus.NOT_FOUND) {
      // 404 だけは 1 行 warn で残す（fil-0157・operational-policy §2）: 存在しない対象への総当たり走査
      // （IDOR 探索）の痕跡が無いと、攻撃の試行自体を検知できない。残すのは method / path / code のみで、
      // query 文字列（検索語・器の id 等）・request body・利用者識別子は出さない（:81 の safeUrl を
      // 通したうえで '?' 以降を落とす）。その他の 4xx（401/403/400 等）は従来どおりログしない。
      const safeUrl = request?.url?.replace(/[\r\n]/g, '');
      const pathOnly = safeUrl?.split('?')[0] ?? safeUrl;
      this.logger.warn(`${request?.method} ${pathOnly} -> ${status} ${code}`);
    }

    // 一時的な混雑（503）は再送で解けるため、再送目安を Retry-After で伝える（cmn-0235）。
    if (retryAfter !== undefined) {
      response.setHeader('Retry-After', String(retryAfter));
    }

    response.status(status).json({
      success: false,
      error: {
        code,
        message,
        ...(details && { details }),
      },
    });
  }
}
