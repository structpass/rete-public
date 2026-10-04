import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './http-exception.filter';
import {
  translateUploadErrorMessage,
  type UploadErrorMessageOptions,
} from './upload-error-messages';

/**
 * アップロード（multipart）の拒否文言を利用者向けの日本語へ訳してから共通フィルタへ渡す（v2-191・v2-209 で共通層へ移設）。
 *
 * FileInterceptor は multer / busboy のエラーを HttpException へ変換する際に code を落とすため、受け取る側は
 * message しか手掛かりにできない。訳せる時だけ例外を組み立て直し、それ以外はそのまま委譲する
 * （状態コード・応答形状・error code 体系は変えない＝operational-policy §1 の体系に手を入れない）。
 *
 * 対象を HttpException に限るのが重要。Nest はメソッド単位の filter をグローバル filter より先に評価するため、
 * ここで @Catch()（全例外）にすると DB 例外（PrismaClientKnownRequestError）まで吸い込み、グローバルの
 * PrismaExceptionFilter がこの経路だけ効かなくなる（P2002 の 409、P2024/P2028 の 503 が 500 へ化ける）。
 * HttpException に絞れば、DB 例外は従来どおり PrismaExceptionFilter → AllExceptionsFilter へ流れる。
 *
 * 対象は multipart の上限（fileSize / files / fields / parts）と回数制限（429）に限る。業務上の拒否
 * （実行形式・内容と拡張子の不一致・サイズ・許可拡張子）は service が最初から日本語で返す。
 *
 * 経路ごとに multipart 層の上限が違う（ファイルのアップロード=100 MiB・招待 CSV の取り込み=1 MB）ため、
 * 上限値はインスタンス生成時に渡す（`@UseFilters(new UploadErrorFilter({ maxFileSizeBytes }))`）。
 * Nest はインスタンス渡しをそのまま採用し、@Catch のメタデータも prototype.constructor から読むため
 * クラス渡しと同じに効く（@nestjs/core の base-exception-filter-context を実測）。
 */
@Catch(HttpException)
export class UploadErrorFilter implements ExceptionFilter {
  private readonly delegate = new AllExceptionsFilter();

  constructor(private readonly options: UploadErrorMessageOptions = {}) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    this.delegate.catch(this.translate(exception), host);
  }

  private translate(exception: unknown): unknown {
    if (!(exception instanceof HttpException)) return exception;
    const status = exception.getStatus();
    if (
      status !== HttpStatus.BAD_REQUEST &&
      status !== HttpStatus.PAYLOAD_TOO_LARGE &&
      status !== HttpStatus.TOO_MANY_REQUESTS
    ) {
      return exception;
    }
    const response = exception.getResponse();
    const raw =
      typeof response === 'string' ? response : (response as { message?: unknown }).message;
    if (typeof raw !== 'string') return exception;
    const translated = translateUploadErrorMessage(raw, this.options);
    if (!translated) return exception;
    return new HttpException({ message: translated }, status);
  }
}
