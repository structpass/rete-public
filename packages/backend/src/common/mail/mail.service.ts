import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { maskEmail } from '../security/mask-email';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/** SMTP 未設定でメール送信が要求された時に投げる。呼び出し側は graceful degradation 済の前提（isConfigured で事前判定）。 */
export class MailNotConfiguredError extends Error {
  constructor() {
    super('SMTP が未設定のためメールを送信できません');
    this.name = 'MailNotConfiguredError';
  }
}

/** SMTP は設定済だが送信そのものが失敗した時に投げる。呼び出し側は当該操作を業務エラーにする（§3）。 */
export class MailDeliveryError extends Error {
  constructor() {
    super('メール送信に失敗しました');
    this.name = 'MailDeliveryError';
  }
}

/**
 * トランザクショナルメール送信の薄い抽象（ADR 0035）。
 * - transport は env SMTP から構成。外部メール SaaS（SendGrid/SES/Resend 等）は使わない。
 * - SMTP 未設定環境では isConfigured()=false。依存機能（招待）は graceful degradation で無効化する（アプリは起動を止めない）。
 * - 送信失敗は当該操作の業務エラーへ（throw）。アプリ全体は止めない（§3）。
 * - センシティブ情報（招待リンク token・本文）は log に出さない（operational-policy §2）。宛先・件名のみ痕跡。
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  /** SMTP 設定が揃っているか（未設定＝メール機能無効）。最低限 host と差出人を要求する。 */
  isConfigured(): boolean {
    return Boolean(process.env.SMTP_HOST && process.env.MAIL_FROM);
  }

  /** set-0126: SMTP_HOST がローカル catch-all（Mailpit 等）を指しているか。
   *  true の時、招待メールは実受信箱に届かず Mailpit（http://localhost:8025 等）で捕捉される。 */
  isLocalCatchAll(): boolean {
    const host = process.env.SMTP_HOST;
    return !!host && (host === 'localhost' || host === '127.0.0.1');
  }

  private getTransporter(): Transporter {
    if (!this.transporter) {
      const host = process.env.SMTP_HOST;
      const isLocal = host === 'localhost' || host === '127.0.0.1';
      const secure = process.env.SMTP_SECURE === 'true';
      this.transporter = createTransport({
        host,
        port: Number(process.env.SMTP_PORT || 587),
        secure,
        // dev の Mailpit（localhost・TLS なし）以外は STARTTLS を必須化し、平文フォールバック（STRIPTLS）を防ぐ。
        // secure=true（SMTPS 465）は既に TLS のため requireTLS 不要。
        requireTLS: !isLocal && !secure,
        tls: isLocal ? undefined : { rejectUnauthorized: true },
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      });
    }
    return this.transporter;
  }

  /**
   * メール送信。未設定なら MailNotConfiguredError、送信失敗なら MailDeliveryError を throw。
   * 呼び出し側はこれを業務エラーへ変換する（操作は止める / アプリは止めない・§3）。
   */
  async send(message: MailMessage): Promise<void> {
    if (!this.isConfigured()) {
      throw new MailNotConfiguredError();
    }
    // 多層防御: CR/LF を含む宛先・件名を拒否し SMTP ヘッダインジェクションを防ぐ（一次検証は呼び出し側の責務）。
    if (/[\r\n]/.test(message.to) || /[\r\n]/.test(message.subject)) {
      throw new MailDeliveryError();
    }
    try {
      await this.getTransporter().sendMail({
        from: process.env.MAIL_FROM,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
    } catch (err) {
      // token / 本文は出さない（§2）。宛先はドメインのみにマスク（PII）、SMTP サーバ構成が漏れる stack は出さず message のみ。
      this.logger.error(
        `メール送信に失敗しました (to=${maskEmail(message.to)}, subject=${message.subject}): ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      );
      throw new MailDeliveryError();
    }
  }
}
