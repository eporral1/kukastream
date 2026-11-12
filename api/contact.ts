import type { VercelRequest, VercelResponse } from '@vercel/node';
import { executeQuery, getPool } from '../src/utils/serverDb.ts';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-App-Client');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim();
    const subject = String(body.subject || 'Consulta desde la web').trim();
    const message = String(body.message || '').trim();
    const honeypot = String(body.website || body._gotcha || '').trim();

    // Anti-spam honeypot check
    if (honeypot) {
      return res.status(200).json({ ok: true, success: true });
    }

    if (!name || !email || !message) {
      return res.status(400).json({
        ok: false,
        error: 'Por favor completá tu nombre, email y mensaje.',
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        ok: false,
        error: 'Por favor ingresá una dirección de correo electrónico válida.',
      });
    }

    let savedToDb = false;
    let sentEmail = false;

    // 1. Save to PostgreSQL (public.contacts) if DB is configured
    const pool = getPool();
    if (pool) {
      try {
        await executeQuery(`
          CREATE TABLE IF NOT EXISTS public.contacts (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            subject TEXT,
            message TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
        `);

        await executeQuery(
          `INSERT INTO public.contacts (name, email, subject, message, created_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [name.slice(0, 200), email.slice(0, 200), subject.slice(0, 300), message.slice(0, 5000)]
        );
        savedToDb = true;
      } catch (dbErr: any) {
        console.warn('[api/contact] Error guardando en PostgreSQL:', dbErr?.message);
      }
    }

    // 2. Send email via Resend API if RESEND_API_KEY is configured in environment
    const resendApiKey = process.env.RESEND_API_KEY;
    const recipientEmail =
      process.env.CONTACT_EMAIL ||
      process.env.MAIL_TO ||
      process.env.ADMIN_EMAIL ||
      'estebanporral@gmail.com';
    const fromEmail =
      process.env.RESEND_FROM ||
      process.env.MAIL_FROM_ADDRESS ||
      'Contacto Web <onboarding@resend.dev>';

    if (resendApiKey) {
      try {
        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [recipientEmail],
            reply_to: email,
            subject: `[Contacto Web] ${subject} - ${name}`,
            text: `Nuevo mensaje de contacto:\n\nNombre: ${name}\nEmail: ${email}\nMotivo: ${subject}\n\nMensaje:\n${message}`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px;">
                <h2 style="color: #111827; margin-top: 0;">Nuevo mensaje de contacto</h2>
                <p style="margin: 8px 0;"><strong>Nombre:</strong> ${escapeHtml(name)}</p>
                <p style="margin: 8px 0;"><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>
                <p style="margin: 8px 0;"><strong>Asunto / Motivo:</strong> ${escapeHtml(subject)}</p>
                <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
                <p style="white-space: pre-wrap; color: #374151; line-height: 1.5;">${escapeHtml(message)}</p>
              </div>
            `,
          }),
        });
        if (resendRes.ok) {
          sentEmail = true;
        } else {
          const errText = await resendRes.text().catch(() => '');
          console.warn('[api/contact] Resend API warning:', errText);
        }
      } catch (emailErr: any) {
        console.warn('[api/contact] Resend error:', emailErr?.message);
      }
    }

    // 3. Optional Webhook / Formspree forwarding if configured
    const webhookUrl = process.env.CONTACT_WEBHOOK_URL || process.env.FORMSPREE_URL;
    if (webhookUrl) {
      try {
        const whRes = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            name,
            email,
            subject,
            message,
            source: process.env.SITE_NAME || 'StreamData',
            created_at: new Date().toISOString(),
          }),
        });
        if (whRes.ok) {
          sentEmail = true;
        }
      } catch (whErr: any) {
        console.warn('[api/contact] Webhook error:', whErr?.message);
      }
    }

    return res.status(200).json({
      ok: true,
      success: true,
      savedToDb,
      sentEmail,
      message: 'Tu mensaje fue enviado correctamente.',
    });
  } catch (err: any) {
    console.error('[api/contact] Error:', err);
    return res.status(500).json({
      ok: false,
      error: 'Ocurrió un error al procesar tu mensaje. Intentá nuevamente en unos instantes.',
    });
  }
}
