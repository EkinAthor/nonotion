import { Resend } from 'resend';

// Lazy-initialized Resend client (mirrors the getGoogleClient() pattern in auth-service)
let resendClient: Resend | null = null;

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('Email is not configured (RESEND_API_KEY is missing)');
  }
  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

/**
 * Send a two-factor verification code to the given email address.
 *
 * The code is always really sent via Resend (RESEND_API_KEY + EMAIL_FROM are
 * required). Additionally, outside production the code is logged to stdout so
 * automated tests can read it from the API server logs — this is a debug aid,
 * not a delivery fallback.
 */
export async function sendTwoFactorCode(to: string, code: string): Promise<void> {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new Error('Email is not configured (EMAIL_FROM is missing)');
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[2FA] code for ${to}: ${code}`);
  }

  const { error } = await getResendClient().emails.send({
    from,
    to,
    subject: 'Your Nonotion verification code',
    html: buildCodeEmailHtml(code),
    text: `Your Nonotion verification code is ${code}. It expires in 10 minutes.`,
  });

  if (error) {
    throw new Error(`Failed to send verification email: ${error.message}`);
  }
}

function buildCodeEmailHtml(code: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 16px; font-size: 18px; color: #111;">Verification code</h2>
      <p style="margin: 0 0 16px; font-size: 14px; color: #444;">Use this code to finish signing in to Nonotion:</p>
      <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #111; padding: 16px 0; text-align: center;">${code}</div>
      <p style="margin: 16px 0 0; font-size: 13px; color: #888;">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
    </div>
  `;
}
