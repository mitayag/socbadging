import nodemailer from "nodemailer";

import type { RenderedEmail } from "../templates/template-utils";

export type SmtpClientConfig = {
  host: string;
  port: number;
  secure: boolean;
  username?: string;
  password?: string;
  from: string;
  replyTo?: string;
};

export type SmtpTransport = {
  send(input: { to: string; email: RenderedEmail }): Promise<{ messageId?: string }>;
};

export function createSmtpTransport(config: SmtpClientConfig): SmtpTransport {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    ...(config.username && config.password
      ? { auth: { user: config.username, pass: config.password } }
      : {}),
  });
  return {
    async send({ to, email }) {
      const result = await transporter.sendMail({
        from: config.from,
        to,
        ...(config.replyTo ? { replyTo: config.replyTo } : {}),
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
      return { messageId: result.messageId };
    },
  };
}
