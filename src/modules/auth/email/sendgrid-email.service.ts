import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import * as sendgrid from '@sendgrid/mail';
import authConfig from '../../../config/auth.config';

@Injectable()
export class SendgridEmailService {
  private readonly log = new Logger(SendgridEmailService.name);
  private readonly isConfigured: boolean;

  constructor(
    @Inject(authConfig.KEY)
    private readonly auth: ConfigType<typeof authConfig>,
  ) {
    const key = this.auth.sendgridApiKey;
    this.isConfigured = key.length > 0;
    if (this.isConfigured) {
      sendgrid.setApiKey(key);
    }
  }

  async sendLoginMfaCode(
    toEmail: string,
    firstName: string,
    code: string,
  ): Promise<void> {
    const from = this.auth.emailFrom;
    if (!this.isConfigured || from.length === 0) {
      this.log.warn(
        `MFA email skipped: SendGrid/EMAIL_FROM not configured (to=${this.redact(
          toEmail,
        )}). In development, retrieve the code from the MFA challenge in tests or enable SendGrid.`,
      );
      return;
    }
    const subject = 'Your sign-in verification code';
    const text = `Hi ${firstName}, your sign-in code is: ${code}. It expires in ${
      this.auth.mfaCodeTtlSeconds / 60
    } minutes.`;
    await sendgrid.send({
      to: toEmail,
      from,
      subject,
      text,
      html: `<p>Hi ${this.escapeHtml(firstName)},</p>
<p>Your sign-in code is: <strong>${this.escapeHtml(code)}</strong></p>
<p>This code expires in ${this.auth.mfaCodeTtlSeconds / 60} minutes.</p>`,
    });
  }

  async sendPasswordReset(
    toEmail: string,
    firstName: string,
    resetLink: string,
  ): Promise<void> {
    const from = this.auth.emailFrom;
    if (!this.isConfigured || from.length === 0) {
      this.log.warn(
        `Password reset email skipped: SendGrid/EMAIL_FROM not configured (to=${this.redact(
          toEmail,
        )})`,
      );
      return;
    }
    const subject = 'Password reset request';
    await sendgrid.send({
      to: toEmail,
      from,
      subject,
      text: `Hi ${firstName}, reset your password: ${resetLink}\nThe link will expire in ${
        this.auth.passwordResetTtlSeconds / 60
      } minutes.`,
      html: `<p>Hi ${this.escapeHtml(firstName)},</p>
<p>Reset your password using the link below:</p>
<p><a href="${this.escapeAttr(resetLink)}">Reset password</a></p>
<p>This link expires in ${this.auth.passwordResetTtlSeconds / 60} minutes.</p>`,
    });
  }

  private redact(email: string): string {
    const [a, b] = email.split('@');
    if (!a || !b) return '***';
    return `${a.slice(0, 1)}***@${b}`;
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private escapeAttr(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }
}
