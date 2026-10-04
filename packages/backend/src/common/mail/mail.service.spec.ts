import { Logger } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { MailService, MailNotConfiguredError, MailDeliveryError } from './mail.service';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

const mockCreateTransport = createTransport as jest.MockedFunction<typeof createTransport>;

describe('MailService', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.SMTP_SECURE;
    delete process.env.MAIL_FROM;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  const configure = () => {
    process.env.SMTP_HOST = 'localhost';
    process.env.SMTP_PORT = '1025';
    process.env.MAIL_FROM = 'no-reply@rete.local';
  };

  describe('isConfigured', () => {
    it('SMTP_HOST と MAIL_FROM が揃っていれば true', () => {
      configure();
      expect(new MailService().isConfigured()).toBe(true);
    });

    it('未設定なら false（graceful degradation の判定点）', () => {
      expect(new MailService().isConfigured()).toBe(false);
    });

    it('host だけで差出人が無ければ false', () => {
      process.env.SMTP_HOST = 'localhost';
      expect(new MailService().isConfigured()).toBe(false);
    });
  });

  describe('send', () => {
    it('未設定で呼ぶと MailNotConfiguredError を投げ、transport を作らない', async () => {
      const service = new MailService();
      await expect(
        service.send({ to: 'a@b.com', subject: 's', html: '<p>x</p>' }),
      ).rejects.toBeInstanceOf(MailNotConfiguredError);
      expect(mockCreateTransport).not.toHaveBeenCalled();
    });

    it('設定済なら env の差出人で sendMail を呼び、本文(html)も転送して解決する', async () => {
      configure();
      const sendMail = jest.fn().mockResolvedValue(undefined);
      mockCreateTransport.mockReturnValue({ sendMail } as never);

      const service = new MailService();
      await service.send({ to: 'invitee@x.com', subject: '招待', html: '<a>link</a>' });

      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'no-reply@rete.local',
          to: 'invitee@x.com',
          subject: '招待',
          html: '<a>link</a>',
        }),
      );
    });

    it('CR/LF を含む宛先は SMTP ヘッダインジェクション防御で拒否し、送信しない', async () => {
      configure();
      const sendMail = jest.fn().mockResolvedValue(undefined);
      mockCreateTransport.mockReturnValue({ sendMail } as never);

      const service = new MailService();
      await expect(
        service.send({ to: 'a@b.com\r\nBcc: evil@x.com', subject: '招待', html: '<p>x</p>' }),
      ).rejects.toBeInstanceOf(MailDeliveryError);
      expect(sendMail).not.toHaveBeenCalled();
    });

    it('リモート host（非 localhost）は requireTLS=true で STARTTLS を必須化する', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.MAIL_FROM = 'no-reply@rete.local';
      const sendMail = jest.fn().mockResolvedValue(undefined);
      mockCreateTransport.mockReturnValue({ sendMail } as never);

      await new MailService().send({ to: 'a@b.com', subject: 's', html: '<p>x</p>' });

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({ requireTLS: true, tls: { rejectUnauthorized: true } }),
      );
    });

    it('localhost(Mailpit) は TLS なしで requireTLS=false', async () => {
      configure(); // SMTP_HOST=localhost
      const sendMail = jest.fn().mockResolvedValue(undefined);
      mockCreateTransport.mockReturnValue({ sendMail } as never);

      await new MailService().send({ to: 'a@b.com', subject: 's', html: '<p>x</p>' });

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({ requireTLS: false, secure: false }),
      );
    });

    it('SMTP_SECURE=true なら secure 接続（SMTPS）で transport を作る', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_SECURE = 'true';
      process.env.MAIL_FROM = 'no-reply@rete.local';
      const sendMail = jest.fn().mockResolvedValue(undefined);
      mockCreateTransport.mockReturnValue({ sendMail } as never);

      await new MailService().send({ to: 'a@b.com', subject: 's', html: '<p>x</p>' });

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({ secure: true, requireTLS: false }),
      );
    });

    it('SMTP_USER/PASS 設定時は auth 付きで transport を作る', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_USER = 'mailer';
      process.env.SMTP_PASS = 'secret-pass';
      process.env.MAIL_FROM = 'no-reply@rete.local';
      const sendMail = jest.fn().mockResolvedValue(undefined);
      mockCreateTransport.mockReturnValue({ sendMail } as never);

      await new MailService().send({ to: 'a@b.com', subject: 's', html: '<p>x</p>' });

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({ auth: { user: 'mailer', pass: 'secret-pass' } }),
      );
    });

    it('送信失敗時は MailDeliveryError を投げる（log には宛先/件名のみ・本文 token は渡さない実装）', async () => {
      configure();
      const sendMail = jest.fn().mockRejectedValue(new Error('smtp down'));
      mockCreateTransport.mockReturnValue({ sendMail } as never);
      // Logger.error は宛先/件名のみで呼ばれ、本文（token）を引数に取らないことを監視する。
      const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      const service = new MailService();
      await expect(
        service.send({ to: 'invitee@x.com', subject: '招待', html: '<a>SECRET_TOKEN</a>' }),
      ).rejects.toBeInstanceOf(MailDeliveryError);

      const loggedArgs = JSON.stringify(loggerError.mock.calls);
      expect(loggedArgs).not.toContain('SECRET_TOKEN');
      loggerError.mockRestore();
    });
  });
});
