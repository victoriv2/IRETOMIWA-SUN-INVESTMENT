// ==============================================================================
// IRETOMIWA SUN INVESTMENT - 24/7 AUTOMATED PAYOUT & CORS BACKEND (RAILWAY)
// ==============================================================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (e) {
  console.warn('[Email] nodemailer module not installed locally:', e.message);
}

const app = express();
const PORT = process.env.PORT || 8080;

const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY || 'FLWSECK-fc044b9b11bc1da34e06422d381602d4-1a1872431eevt-X';
const FLW_SECRET_HASH = process.env.FLW_SECRET_HASH || 'iretomiwa-sun-investment-payout-2026';

const formatMoney = (n) => {
  const num = Math.abs(parseFloat(n) || 0);
  const parts = num.toFixed(2).split('.');
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decimalPart = parts[1];
  return (parseFloat(n) < 0 ? '-' : '') + integerPart + '.' + decimalPart;
};

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'verif-hash', 'X-Requested-With']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Iretomiwa Sun Investment Automated Payout Backend',
    platform: 'Railway',
    timestamp: new Date().toISOString()
  });
});
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Iretomiwa Sun Investment Automated Payout Backend',
    platform: 'Railway',
    timestamp: new Date().toISOString()
  });
});

// Outbound IP Diagnostic Endpoint
app.get('/api/check-ip', async (req, res) => {
  try {
    const ipRes = await fetch('https://api.ipify.org?format=json');
    const ipData = await ipRes.json();
    res.json({
      platform: 'Railway',
      outboundIp: ipData.ip,
      note: 'Dedicated cloud server running 24/7 with zero browser CORS barriers.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Server-side Idempotency & Duplicate Disbursement Protection Cache
const inFlightPayouts = new Set();
const completedPayouts = new Map(); // idempotencyKey -> result

// ==============================================================================
// AUTOMATED WITHDRAWAL / PAYOUT DISBURSEMENT ENDPOINT
// ==============================================================================
app.post('/api/payout/disburse', async (req, res) => {
  let idempotencyKey = null;
  try {
    const {
      amount,
      accountNumber,
      bankCode,
      bankName,
      accountName,
      narration,
      txId,
      userId,
      reference: clientRef
    } = req.body;

    // Strict Deterministic Idempotency Key (NO Math.random to prevent duplicate payouts)
    idempotencyKey = txId ? String(txId) : (clientRef || `ACC_${accountNumber}_${amount}`);

    if (inFlightPayouts.has(idempotencyKey)) {
      console.warn(`[Disburse REJECTED] Duplicate disbursement already in-flight for: ${idempotencyKey}`);
      return res.status(409).json({
        success: false,
        error: 'Disbursement is already processing for this withdrawal. Please wait.'
      });
    }

    if (completedPayouts.has(idempotencyKey)) {
      console.log(`[Disburse CACHED] Returning previously successful disbursement for: ${idempotencyKey}`);
      return res.json(completedPayouts.get(idempotencyKey));
    }

    inFlightPayouts.add(idempotencyKey);

    const cleanAmount = parseFloat(amount);
    const minThreshold = (req.body.minWithdrawal !== undefined && !isNaN(parseFloat(req.body.minWithdrawal)))
      ? parseFloat(req.body.minWithdrawal)
      : parseFloat(process.env.MIN_WITHDRAWAL || 500);

    if (isNaN(cleanAmount) || cleanAmount < minThreshold) {
      return res.status(400).json({
        success: false,
        error: `Minimum withdrawal amount is ₦${formatMoney(minThreshold)} (₦${formatMoney(minThreshold)} and above).`
      });
    }

    const cleanAccNum = String(accountNumber || '').trim().replace(/\D/g, '');
    if (cleanAccNum.length !== 10) {
      return res.status(400).json({
        success: false,
        error: 'Destination bank account number must be exactly 10 digits.'
      });
    }

    if (!bankCode) {
      return res.status(400).json({
        success: false,
        error: 'Destination bank code is required.'
      });
    }

    // Resolve OPay routing code if necessary
    const isOpay = ['100004', '999992', '090110', 'opay', 'paycom'].includes(String(bankCode).toLowerCase());
    const flwBankCode = isOpay ? '100004' : String(bankCode).trim();

    // Deterministic transfer reference per transaction ID
    const reference = clientRef || ('TXF_' + (txId || Date.now()));
    const cleanAccountName = String(accountName || '').trim();

    const payload = {
      account_bank: flwBankCode,
      account_number: cleanAccNum,
      amount: cleanAmount,
      narration: (narration || `Iretomiwa Sun payout to ${cleanAccountName || 'Client'}`).slice(0, 100),
      currency: 'NGN',
      reference: reference,
      beneficiary_name: cleanAccountName || undefined,
      debit_currency: 'NGN'
    };

    console.log(`[Disburse] Processing ₦${cleanAmount} to ${cleanAccNum} (${bankName || flwBankCode}) ref: ${reference}`);

    const flwRes = await fetch('https://api.flutterwave.com/v3/transfers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${FLW_SECRET_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const flwJson = await flwRes.json().catch(() => null);

    if (flwRes.ok && flwJson && flwJson.status === 'success' && flwJson.data) {
      console.log(`[Disburse SUCCESS] Transfer initiated id: ${flwJson.data.id} ref: ${reference}`);
      const successPayload = {
        success: true,
        transferId: flwJson.data.id,
        reference: flwJson.data.reference || reference,
        status: flwJson.data.status,
        accountName: flwJson.data.full_name || cleanAccountName,
        raw: flwJson.data
      };
      completedPayouts.set(idempotencyKey, successPayload);
      setTimeout(() => completedPayouts.delete(idempotencyKey), 24 * 60 * 60 * 1000); // 24hr cache
      return res.json(successPayload);
    }

    // Handle Flutterwave rejection / business errors
    let errorMsg = (flwJson && (flwJson.message || flwJson.error)) ||
      `Flutterwave transfer failed with HTTP status ${flwRes.status}`;

    if (typeof errorMsg === 'string' && (errorMsg.toLowerCase().includes('ip whitelisting') || errorMsg.toLowerCase().includes('whitelist') || errorMsg.toLowerCase().includes('cannot be processed'))) {
      errorMsg = 'Flutterwave requires your server IP to be whitelisted for automated bank transfers (IP: 152.55.181.199). Please add this IP in Flutterwave Settings -> Whitelisted IP addresses.';
    }

    console.warn(`[Disburse REJECTED]`, errorMsg);
    return res.status(400).json({
      success: false,
      error: errorMsg,
      details: flwJson
    });

  } catch (err) {
    console.error(`[Disburse ERROR]`, err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error processing payout: ' + (err.message || 'Unknown error')
    });
  } finally {
    if (idempotencyKey) {
      inFlightPayouts.delete(idempotencyKey);
    }
  }
});

// ==============================================================================
// FLUTTERWAVE GENERAL CORS PROXY (FOR ACCOUNT RESOLVE, BANKS, BALANCES)
// ==============================================================================
app.all('/api/flw/*', async (req, res) => {
  try {
    const subPath = req.params[0] || '';
    const queryStr = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    const targetUrl = `https://api.flutterwave.com/v3/${subPath}${queryStr}`;

    const clientAuth = req.headers['authorization'];
    const authHeader = (clientAuth && clientAuth.startsWith('Bearer FLWSECK'))
      ? clientAuth
      : `Bearer ${FLW_SECRET_KEY}`;

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': authHeader
    };

    const fetchOpts = {
      method: req.method,
      headers
    };

    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body && Object.keys(req.body).length > 0) {
      fetchOpts.body = JSON.stringify(req.body);
    }

    const flwRes = await fetch(targetUrl, fetchOpts);
    const textData = await flwRes.text();

    res.status(flwRes.status);
    res.setHeader('Content-Type', flwRes.headers.get('content-type') || 'application/json');
    res.send(textData);

  } catch (err) {
    console.error(`[FLW Proxy ERROR]`, err);
    res.status(500).json({
      status: 'error',
      message: 'Proxy error contacting Flutterwave: ' + (err.message || 'Unknown')
    });
  }
});

// ==============================================================================
// FLUTTERWAVE WEBHOOK RECEIVER (24/7 TRANSFER & PAYMENT STATUS UPDATES)
// ==============================================================================
app.post('/api/flw-webhook', (req, res) => {
  const hash = req.headers['verif-hash'];
  const validHashes = [
    FLW_SECRET_HASH,
    'iretomiwa-sun-investment-payout-2026',
    'IretomiwaSunInvestmentSecHashLive026',
    '2fedea2e-12a0-4b09-a1ec-0887623928db',
    'IretomiwaSun2026',
    'IretomiwaSunInvestmentSecHash2026'
  ].filter(Boolean);

  if (hash && !validHashes.includes(hash)) {
    console.warn(`[Webhook] Invalid signature received: ${hash}`);
    return res.status(401).json({ status: 'invalid signature' });
  }

  const event = req.body;
  console.log(`[Webhook RECEIVED] event: ${event?.event || event?.['event.type'] || 'unknown'}`);

  // Immediate 200 acknowledge to Flutterwave
  res.status(200).json({ status: 'success' });
});

// ==============================================================================
// KUDISMS & SUPABASE CONFIGURATION (FOR 6-DIGIT FORGOTTEN PASSWORD OTP)
// ==============================================================================
const DEFAULT_KUDISMS_KEY = process.env.KUDISMS_API_KEY || 'fogAIJrnPUkDMLiRzj9FN5VO3dqQ7pevy4c2lhZEuKSBa1T8s0wGCbxXHYW6tm';
const DEFAULT_KUDISMS_SENDER_ID = process.env.KUDISMS_SENDER_ID || 'IRETOMIWA';
const DEFAULT_KUDISMS_GATEWAY = process.env.KUDISMS_GATEWAY || '1';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cmzfqeifdlktavqsoyjt.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemZxZWlmZGxrdGF2cXNveWp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyODM1NjksImV4cCI6MjEwODg1OTU2OX0.AnWfzXrkNc3kCEy7EfKbeP3A191OKO_B8DK8kfeFdZM';
const SUPABASE_TABLE = 'app_sync';
const SUPABASE_SYNC_ID = 'prod_v2';

// In-Memory OTP Store: sessionToken -> { userId, otp, channel, destination, maskedDestination, expiresAt, resendAfter, attempts, verified }
const otpSessions = new Map();

// Periodically clean up expired OTP sessions (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [token, sess] of otpSessions.entries()) {
    if (sess.expiresAt < now) {
      otpSessions.delete(token);
    }
  }
}, 5 * 60 * 1000);

// Helper: Fetch cloud data row from Supabase
async function getSupabaseCloudData() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?id=eq.${SUPABASE_SYNC_ID}&select=*`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Accept': 'application/json'
    }
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Supabase query failed: HTTP ${res.status} ${errText}`);
  }
  const rows = await res.json();
  const row = (Array.isArray(rows) && rows[0]) ? rows[0] : (rows || {});
  const users = Array.isArray(row.users) ? row.users : [];
  const kudismsConfig = row.kudisms_config || row.kudismsConfig || {};
  const emailConfig = row.email_config || row.emailConfig || {};
  return { row, users, kudismsConfig, emailConfig };
}

// Helper: Mask phone number (e.g. 08188087715 -> 081****7715)
function maskPhone(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length <= 6) return phone;
  return digits.slice(0, 4) + '****' + digits.slice(-3);
}

// Helper: Mask email address (e.g. johnidowu@gmail.com -> jo*****u@gmail.com)
function maskEmail(email) {
  if (!email) return '';
  const parts = String(email).trim().split('@');
  if (parts.length !== 2) return email;
  const user = parts[0];
  const domain = parts[1];
  if (user.length <= 2) return `${user[0]}*@${domain}`;
  const maskedUser = user.slice(0, 2) + '*'.repeat(Math.max(2, user.length - 3)) + user.slice(-1);
  return `${maskedUser}@${domain}`;
}

// Helper: Validate password rules (6+ chars, uppercase, number, symbol)
function isPasswordComplex(pw) {
  if (!pw || typeof pw !== 'string' || pw.length < 6) return false;
  const hasUpper = /[A-Z]/.test(pw);
  const hasNum = /[0-9]/.test(pw);
  const hasSym = /[^A-Za-z0-9]/.test(pw);
  return hasUpper && hasNum && hasSym;
}

// Helper: Send SMS via KudiSMS
async function sendKudiSmsMessage(recipientPhone, message, config = {}) {
  const token = config.token || DEFAULT_KUDISMS_KEY;
  const senderID = config.senderID || DEFAULT_KUDISMS_SENDER_ID;
  const gateway = config.gateway || DEFAULT_KUDISMS_GATEWAY;

  const cleanDigits = String(recipientPhone || '').replace(/\D/g, '');
  const formattedPhone = cleanDigits.startsWith('0')
    ? ('234' + cleanDigits.slice(1))
    : (cleanDigits.startsWith('234') ? cleanDigits : ('234' + cleanDigits));

  const payload = {
    token,
    senderID,
    recipients: formattedPhone,
    message,
    gateway
  };

  console.log(`[KudiSMS] Sending SMS to ${formattedPhone} via senderID "${senderID}" gateway ${gateway}`);

  const res = await fetch('https://my.kudisms.net/api/sms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => null);
  console.log(`[KudiSMS Response]`, data);
  return { ok: res.ok, status: res.status, data };
}

// Helper: Send Transactional SMS via Brevo API
async function sendBrevoSmsMessage(recipientPhone, message, config = {}, emailConfig = {}) {
  const apiKey = (config.brevoSmsKey || emailConfig.brevoKey || process.env.BREVO_API_KEY || '').trim();
  if (!apiKey) {
    return {
      ok: false,
      status: 400,
      provider: 'brevo',
      data: { status: 'error', msg: 'Brevo API Key is not configured. Please add your Brevo API Key in Admin -> More -> SMS Settings.' }
    };
  }

  const sender = String(config.senderID || DEFAULT_KUDISMS_SENDER_ID || 'IRETOMIWA')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 11) || 'IRETOMIWA';

  const cleanDigits = String(recipientPhone || '').replace(/\D/g, '');
  const formattedPhone = cleanDigits.startsWith('0')
    ? ('+234' + cleanDigits.slice(1))
    : (cleanDigits.startsWith('234') ? ('+' + cleanDigits) : ('+234' + cleanDigits));

  const payload = {
    sender,
    recipient: formattedPhone,
    content: message,
    type: 'transactional'
  };

  console.log(`[Brevo SMS] Sending Transactional SMS to ${formattedPhone} via sender "${sender}"`);

  try {
    const res = await fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => null);
    console.log(`[Brevo SMS Response]`, res.status, data);
    return { ok: res.ok, status: res.status, provider: 'brevo', data };
  } catch (err) {
    console.warn('[Brevo SMS ERROR]', err.message);
    return { ok: false, status: 500, provider: 'brevo', data: { status: 'error', msg: err.message } };
  }
}

const DEFAULT_SENDAR_KEY = process.env.SENDAR_API_KEY || '';

// Helper: Send Transactional SMS via Sendar (https://api.sendar.io/v1/sms)
async function sendSendarOtp(recipientPhone, message, config = {}) {
  const apiKey = (config.sendarApiKey || DEFAULT_SENDAR_KEY || '').trim();
  if (!apiKey) {
    return {
      ok: false,
      status: 400,
      provider: 'sendar',
      data: { status: 'error', msg: 'Sendar API Key is not configured.' }
    };
  }

  // Use configured Sendar sender ID (e.g. IRETOMIWA once approved as transactional)
  const sender = String(config.sendarSenderID || config.senderID || DEFAULT_KUDISMS_SENDER_ID || 'IRETOMIWA')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 11) || 'IRETOMIWA';

  const cleanDigits = String(recipientPhone || '').replace(/\D/g, '');
  const formattedPhone = cleanDigits.startsWith('0')
    ? ('+234' + cleanDigits.slice(1))
    : (cleanDigits.startsWith('234') ? ('+' + cleanDigits) : ('+234' + cleanDigits));

  console.log(`[Sendar SMS] Sending transactional SMS to ${formattedPhone} via sender "${sender}"`);

  try {
    const res = await fetch('https://api.sendar.io/v1/sms', {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        to: formattedPhone,
        sender_id: sender,
        message
      })
    });

    const data = await res.json().catch(() => null);
    console.log(`[Sendar SMS Response]`, res.status, data);
    return { ok: res.ok && Boolean(data?.success !== false), status: res.status, provider: 'sendar', data };
  } catch (err) {
    console.warn('[Sendar SMS ERROR]', err.message);
    return { ok: false, status: 500, provider: 'sendar', data: { status: 'error', msg: err.message } };
  }
}

// Helper: Send Transactional SMS via Termii (https://v3.api.termii.com/api/sms/send)
async function sendTermiiSmsMessage(recipientPhone, message, config = {}) {
  const apiKey = (config.termiiApiKey || process.env.TERMII_API_KEY || '').trim();
  if (!apiKey) {
    return {
      ok: false,
      status: 400,
      provider: 'termii',
      data: { status: 'error', msg: 'Termii API Key is not configured.' }
    };
  }

  let baseUrl = String(config.termiiBaseUrl || process.env.TERMII_BASE_URL || 'https://v3.api.termii.com').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(baseUrl)) baseUrl = 'https://' + baseUrl;

  const rawSender = String(config.termiiSenderID || config.senderID || 'N-Alert').trim().slice(0, 11);
  const sender = (rawSender && rawSender.toUpperCase() !== 'IRETOMIWA') ? rawSender : 'N-Alert';
  const channel = (config.termiiChannel || 'dnd').trim().toLowerCase();

  const cleanDigits = String(recipientPhone || '').replace(/\D/g, '');
  const formattedPhone = cleanDigits.startsWith('0')
    ? ('234' + cleanDigits.slice(1))
    : (cleanDigits.startsWith('234') ? cleanDigits : ('234' + cleanDigits));

  console.log(`[Termii SMS] Sending SMS to ${formattedPhone} via sender "${sender}" channel "${channel}" (${baseUrl})`);

  try {
    const res = await fetch(`${baseUrl}/api/sms/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        api_key: apiKey,
        to: formattedPhone,
        from: sender,
        sms: message,
        type: 'plain',
        channel
      })
    });

    const data = await res.json().catch(() => null);
    console.log(`[Termii SMS Response]`, res.status, data);
    const ok = Boolean(res.ok && (data?.code === 'ok' || data?.message_id || data?.message === 'Successfully Sent'));
    return { ok, status: res.status, provider: 'termii', data };
  } catch (err) {
    console.warn('[Termii SMS ERROR]', err.message);
    return { ok: false, status: 500, provider: 'termii', data: { status: 'error', msg: err.message } };
  }
}

// Unified SMS OTP Dispatcher (Termii, Sendar, Brevo & KudiSMS supported)
async function sendSmsOtpMessage(recipientPhone, message, kudismsConfig = {}, emailConfig = {}) {
  const provider = (kudismsConfig.provider || 'termii').toLowerCase();
  if (provider === 'kudisms') {
    const kudiRes = await sendKudiSmsMessage(recipientPhone, message, kudismsConfig);
    return { ...kudiRes, provider: 'kudisms' };
  }
  if (provider === 'brevo') {
    return await sendBrevoSmsMessage(recipientPhone, message, kudismsConfig, emailConfig);
  }
  if (provider === 'sendar') {
    return await sendSendarOtp(recipientPhone, message, kudismsConfig);
  }
  return await sendTermiiSmsMessage(recipientPhone, message, kudismsConfig);
}

// Helper: Branded HTML Email Template for OTP Password Reset
function getOtpHtmlTemplate(otp) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Password Reset OTP</title>
</head>
<body style="margin: 0; padding: 24px 12px; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="background: #0f3d24; padding: 24px; text-align: center;">
      <h2 style="color: #ffffff; margin: 0; font-size: 19px; font-weight: 800; letter-spacing: 0.5px;">IRETOMIWA SUN INVESTMENT</h2>
      <p style="color: #86efac; margin: 4px 0 0 0; font-size: 12.5px;">Savings and Loans Enterprise</p>
    </div>
    <div style="padding: 26px 24px;">
      <h3 style="color: #1e293b; font-size: 16px; margin: 0 0 10px 0; font-weight: 700;">Password Reset Code</h3>
      <p style="color: #475569; font-size: 13.5px; line-height: 1.5; margin: 0 0 18px 0;">
        You requested a password reset for your Iretomiwa Sun account. Use the 6-digit verification code below:
      </p>
      <div style="background: #f0fdf4; border: 2px dashed #16a34a; border-radius: 10px; padding: 18px; text-align: center; margin: 0 0 20px 0;">
        <span style="font-size: 32px; font-weight: 900; letter-spacing: 10px; color: #14532d; font-family: monospace;">${otp}</span>
        <p style="margin: 6px 0 0 0; font-size: 12px; color: #15803d; font-weight: 600;">Valid for 10 minutes</p>
      </div>
      <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin: 0 0 14px 0;">
        If you did not request this password reset, please ignore this email. Never disclose this code to anyone.
      </p>
      <div style="border-top: 1px solid #f1f5f9; padding-top: 14px; text-align: center; font-size: 11px; color: #94a3b8;">
        &copy; 2026 Iretomiwa Sun Investment Enterprise. All rights reserved.
      </div>
    </div>
  </div>
</body>
</html>`;
}

// Helper: Dispatch Email OTP via configured provider (Gmail/SMTP, Resend API, Brevo API)
async function sendOtpEmail(recipientEmail, otp, config = {}) {
  const provider = (config.provider || 'gmail').toLowerCase();
  const smtpUser = (config.smtpUser || config.user || config.senderEmail || process.env.SMTP_USER || '').trim();
  const rawSmtpPass = (config.smtpPass || config.pass || process.env.SMTP_PASS || '').trim();
  const smtpPass = rawSmtpPass.replace(/\s+/g, ''); // Strip all spaces (e.g. 16-char Google App Password)
  const resendKey = (config.resendKey || config.apiKey || process.env.RESEND_API_KEY || '').trim();
  const brevoKey = (config.brevoKey || process.env.BREVO_API_KEY || '').trim();
  const senderEmail = (config.senderEmail || config.fromEmail || smtpUser || 'support@iretomiwasun.com').trim();

  console.log(`[Email OTP] Dispatching 6-digit OTP to ${recipientEmail} via provider "${provider}"`);

  // 1. Try Resend HTTP API (if configured or provider is resend)
  if (resendKey && (provider === 'resend' || !smtpPass)) {
    try {
      // Resend requires verified domain or onboarding@resend.dev for testing
      const fromAddress = (senderEmail.endsWith('@resend.dev') || senderEmail.includes('@iretomiwasun.com'))
        ? `Iretomiwa Sun Investment <${senderEmail}>`
        : 'Iretomiwa Sun <onboarding@resend.dev>';

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: fromAddress,
          to: recipientEmail,
          subject: 'Your Password Reset OTP - Iretomiwa Sun Investment',
          html: getOtpHtmlTemplate(otp)
        })
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        console.log(`[Email SUCCESS] Sent via Resend to ${recipientEmail}`);
        return { success: true, provider: 'resend', data };
      }
      console.warn('[Email] Resend API error:', data);
      return { success: false, provider: 'resend', error: data?.message || 'Resend API error' };
    } catch (e) {
      console.warn('[Email] Resend error:', e.message);
      return { success: false, provider: 'resend', error: e.message };
    }
  }

  // 2. Try Brevo HTTP API (if configured or provider is brevo)
  if (brevoKey && (provider === 'brevo' || !smtpPass)) {
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': brevoKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sender: { name: 'Iretomiwa Sun Investment', email: senderEmail },
          to: [{ email: recipientEmail }],
          subject: 'Your Password Reset OTP - Iretomiwa Sun Investment',
          htmlContent: getOtpHtmlTemplate(otp)
        })
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        console.log(`[Email SUCCESS] Sent via Brevo to ${recipientEmail}`);
        return { success: true, provider: 'brevo', data };
      }
      console.warn('[Email] Brevo API error:', data);
      return { success: false, provider: 'brevo', error: data?.message || 'Brevo API error' };
    } catch (e) {
      console.warn('[Email] Brevo error:', e.message);
      return { success: false, provider: 'brevo', error: e.message };
    }
  }

  // 3. Try Nodemailer (Gmail App Password or Custom SMTP)
  if (smtpUser && smtpPass) {
    if (!nodemailer) {
      return { success: false, provider: 'smtp', error: 'Nodemailer module not available on server.' };
    }
    try {
      const isCustomSmtp = provider === 'smtp' || (config.smtpHost && config.smtpHost !== 'smtp.gmail.com');
      let transporterConfig;

      if (isCustomSmtp) {
        const port = parseInt(config.smtpPort || '465', 10);
        transporterConfig = {
          host: config.smtpHost || 'smtp.gmail.com',
          port: port,
          secure: port === 465,
          auth: { user: smtpUser, pass: smtpPass }
        };
      } else {
        // Default Gmail service (handles ports & SSL automatically)
        transporterConfig = {
          service: 'gmail',
          auth: { user: smtpUser, pass: smtpPass }
        };
      }

      const transporter = nodemailer.createTransport(transporterConfig);
      const info = await transporter.sendMail({
        from: `"Iretomiwa Sun Investment" <${smtpUser}>`,
        to: recipientEmail,
        subject: 'Your Password Reset OTP - Iretomiwa Sun Investment',
        html: getOtpHtmlTemplate(otp)
      });
      console.log(`[Email SUCCESS] Sent via SMTP (${smtpUser}) to ${recipientEmail}:`, info?.messageId);
      return { success: true, provider: isCustomSmtp ? 'custom_smtp' : 'gmail', info };
    } catch (e) {
      console.warn('[Email] SMTP send failed:', e.message);
      return { success: false, provider: 'smtp', error: e.message };
    }
  }

  // If no credentials configured yet
  return {
    success: false,
    notice: 'Email dispatch is not configured yet. Please configure your email sender credentials in Admin -> More tab.'
  };
}

// ==============================================================================
// FORGOTTEN PASSWORD & OTP API ENDPOINTS
// ==============================================================================

// 1. Check KudiSMS Live Balance Endpoint
app.get('/api/kudisms/balance', async (req, res) => {
  try {
    const { kudismsConfig } = await getSupabaseCloudData().catch(() => ({ kudismsConfig: {} }));
    const token = kudismsConfig.token || DEFAULT_KUDISMS_KEY;
    const balanceRes = await fetch(`https://my.kudisms.net/api/balance?token=${encodeURIComponent(token)}`);
    const balanceJson = await balanceRes.json().catch(() => null);

    if (balanceJson && (balanceJson.status === 'success' || balanceJson.error_code === '000')) {
      return res.json({
        success: true,
        balance: balanceJson.msg || '0.00',
        senderID: kudismsConfig.senderID || DEFAULT_KUDISMS_SENDER_ID,
        raw: balanceJson
      });
    }

    return res.status(400).json({
      success: false,
      error: balanceJson?.msg || 'Could not retrieve KudiSMS balance.',
      details: balanceJson
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Step 1: Initiate Password Reset (Lookup user and evaluate SMS vs Email channels)
app.post('/api/auth/forgot-password/initiate', async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier || !String(identifier).trim()) {
      return res.status(400).json({ success: false, error: 'Please enter your phone number, email address, or Client ID.' });
    }

    const cleanInput = String(identifier).trim().toLowerCase();
    const cleanDigits = String(identifier).trim().replace(/\D/g, '');

    const { users, kudismsConfig, emailConfig } = await getSupabaseCloudData();

    // Find user across Client ID (ir00001), Email, and Phone
    const user = users.find(u => {
      const idMatch = Boolean(u.id && u.id.toLowerCase() === cleanInput);
      const emailMatch = Boolean(u.email && u.email.trim().toLowerCase() === cleanInput);
      const phoneDigits = (u.phone || '').replace(/\D/g, '');
      const phoneMatch = Boolean(
        cleanDigits.length >= 10 &&
        phoneDigits &&
        (phoneDigits === cleanDigits || phoneDigits.endsWith(cleanDigits.slice(-10)) || cleanDigits.endsWith(phoneDigits.slice(-10)))
      );
      return idMatch || emailMatch || phoneMatch;
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'No active account found with that email, phone number, or Client ID.'
      });
    }

    const cleanUserPhone = (user.phone || '').trim();
    const hasPhone = Boolean(cleanUserPhone && cleanUserPhone.replace(/\D/g, '').length >= 10);

    if (!hasPhone) {
      return res.status(400).json({
        success: false,
        error: 'No phone number is attached to this account for SMS OTP. Please contact support.'
      });
    }

    const maskedPhone = maskPhone(cleanUserPhone);

    // Phone-only SMS OTP flow (dispatched via active SMS provider: Brevo or KudiSMS)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const sessionToken = crypto.randomBytes(24).toString('hex');
    const now = Date.now();

    const smsMsg = `Iretomiwa Sun Investment: ${otp} is your reset key. Valid for 10 minutes.`;
    const smsRes = await sendSmsOtpMessage(cleanUserPhone, smsMsg, kudismsConfig, emailConfig);

    // Save session
    otpSessions.set(sessionToken, {
      sessionToken,
      userId: user.id,
      otp,
      provider: smsRes.provider,
      sendarRef: smsRes.reference || null,
      channel: 'sms',
      destination: cleanUserPhone,
      maskedDestination: maskedPhone,
      createdAt: now,
      expiresAt: now + (10 * 60 * 1000), // 10 minutes
      resendAfter: now + (60 * 1000),     // 60 seconds
      attempts: 0,
      verified: false
    });

    let notice = null;
    if (!smsRes.ok || (smsRes.data && smsRes.data.status === 'error')) {
      const errCode = smsRes.data?.error_code;
      const errMsg = smsRes.data?.message || smsRes.data?.msg || 'SMS gateway error';
      if (smsRes.provider === 'kudisms' && errCode === '106') {
        notice = `Sender ID "${kudismsConfig.senderID || DEFAULT_KUDISMS_SENDER_ID}" is currently pending approval on KudiSMS.`;
      } else {
        notice = `${smsRes.provider} note: ${errMsg}`;
      }
    }

    return res.json({
      success: true,
      action: 'otp_sent',
      sessionToken,
      channel: 'sms',
      provider: smsRes.provider,
      maskedDestination: maskedPhone,
      maskedPhone,
      hasPhone: true,
      hasEmail: false,
      expiresIn: 600,
      resendCooldown: 60,
      notice
    });

  } catch (err) {
    console.error('[Forgot Password Initiate ERROR]', err);
    return res.status(500).json({ success: false, error: err.message || 'Error looking up account.' });
  }
});

// 3. Step 2: Send / Resend OTP via SMS (Phone-only)
app.post('/api/auth/forgot-password/send-otp', async (req, res) => {
  try {
    const { userId, sessionToken } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID is required.' });
    }

    // Check resend cooldown if an existing sessionToken exists
    if (sessionToken && otpSessions.has(sessionToken)) {
      const currentSess = otpSessions.get(sessionToken);
      if (Date.now() < currentSess.resendAfter) {
        const remainingSec = Math.ceil((currentSess.resendAfter - Date.now()) / 1000);
        return res.status(429).json({
          success: false,
          error: `Please wait ${remainingSec} second${remainingSec === 1 ? '' : 's'} before requesting a new code.`
        });
      }
    }

    const { users, kudismsConfig, emailConfig } = await getSupabaseCloudData();
    const user = users.find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User account not found.' });
    }

    const phone = (user.phone || '').trim();
    if (!phone || phone.replace(/\D/g, '').length < 10) {
      return res.status(400).json({ success: false, error: 'No phone number attached to this account.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const newSessionToken = sessionToken || crypto.randomBytes(24).toString('hex');
    const now = Date.now();
    const maskedDestination = maskPhone(phone);
    let notice = null;

    const smsMsg = `Iretomiwa Sun Investment: ${otp} is your reset key. Valid for 10 minutes.`;
    const smsRes = await sendSmsOtpMessage(phone, smsMsg, kudismsConfig, emailConfig);

    if (!smsRes.ok || (smsRes.data && smsRes.data.status === 'error')) {
      const errCode = smsRes.data?.error_code;
      const errMsg = smsRes.data?.message || smsRes.data?.msg || 'SMS gateway error';
      if (smsRes.provider === 'kudisms' && errCode === '106') {
        notice = `Sender ID "${kudismsConfig.senderID || DEFAULT_KUDISMS_SENDER_ID}" is currently pending approval on KudiSMS.`;
      } else {
        notice = `${smsRes.provider === 'brevo' ? 'Brevo SMS' : 'KudiSMS'} note: ${errMsg}`;
      }
    }

    otpSessions.set(newSessionToken, {
      sessionToken: newSessionToken,
      userId: user.id,
      otp,
      provider: smsRes.provider,
      sendarRef: smsRes.reference || null,
      channel: 'sms',
      destination: phone,
      maskedDestination,
      createdAt: now,
      expiresAt: now + (10 * 60 * 1000),
      resendAfter: now + (60 * 1000),
      attempts: 0,
      verified: false
    });

    return res.json({
      success: true,
      action: 'otp_sent',
      sessionToken: newSessionToken,
      channel: 'sms',
      provider: smsRes.provider,
      maskedDestination,
      expiresIn: 600,
      resendCooldown: 60,
      notice
    });

  } catch (err) {
    console.error('[Send OTP ERROR]', err);
    return res.status(500).json({ success: false, error: err.message || 'Error delivering OTP code.' });
  }
});

// 4. Step 3: Verify 6-digit OTP code
app.post('/api/auth/forgot-password/verify-otp', (req, res) => {
  try {
    const { sessionToken, otp } = req.body;
    if (!sessionToken || !otp) {
      return res.status(400).json({ success: false, error: 'Session token and 6-digit code are required.' });
    }

    const sess = otpSessions.get(sessionToken);
    if (!sess) {
      return res.status(400).json({ success: false, error: 'Verification session expired. Please request a new code.' });
    }

    if (Date.now() > sess.expiresAt) {
      otpSessions.delete(sessionToken);
      return res.status(400).json({ success: false, error: 'The 6-digit code has expired. Please request a new one.' });
    }

    if (sess.attempts >= 5) {
      otpSessions.delete(sessionToken);
      return res.status(429).json({ success: false, error: 'Too many incorrect attempts. Please request a new code.' });
    }

    const cleanInputOtp = String(otp).trim().replace(/\D/g, '');
    if (cleanInputOtp !== sess.otp) {
      sess.attempts += 1;
      const remainingAttempts = 5 - sess.attempts;
      return res.status(400).json({
        success: false,
        error: `Incorrect 6-digit code. ${remainingAttempts} attempt${remainingAttempts === 1 ? '' : 's'} remaining.`
      });
    }

    // OTP Verified! Mark session
    sess.verified = true;
    return res.json({
      success: true,
      message: 'Code verified successfully.',
      sessionToken
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Step 4: Reset Password
app.post('/api/auth/forgot-password/reset-password', async (req, res) => {
  try {
    const { sessionToken, newPassword, confirmPassword } = req.body;
    if (!sessionToken) {
      return res.status(400).json({ success: false, error: 'Session expired. Please start again.' });
    }

    const sess = otpSessions.get(sessionToken);
    if (!sess || !sess.verified) {
      return res.status(401).json({ success: false, error: 'Please verify your 6-digit code first.' });
    }

    if (Date.now() > sess.expiresAt) {
      otpSessions.delete(sessionToken);
      return res.status(400).json({ success: false, error: 'Session expired. Please request a new code.' });
    }

    if (!newPassword || newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, error: 'Passwords do not match.' });
    }

    if (!isPasswordComplex(newPassword)) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters, include an uppercase letter, a number, and a symbol.'
      });
    }

    // Update password in Supabase cloud database
    const { users } = await getSupabaseCloudData();
    const userIdx = users.findIndex(u => u.id === sess.userId);
    if (userIdx === -1) {
      return res.status(404).json({ success: false, error: 'Account not found in cloud database.' });
    }

    users[userIdx].password = newPassword;
    users[userIdx].updatedAt = new Date().toISOString();

    const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?id=eq.${SUPABASE_SYNC_ID}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        users,
        updated_at: new Date().toISOString()
      })
    });

    if (!patchRes.ok) {
      const errText = await patchRes.text().catch(() => '');
      return res.status(500).json({
        success: false,
        error: `Could not save new password to database: ${errText || 'Network error'}`
      });
    }

    // Clean up OTP session
    otpSessions.delete(sessionToken);

    return res.json({
      success: true,
      message: 'Password reset successfully! You can now log in with your new password.',
      userId: users[userIdx].id
    });

  } catch (err) {
    console.error('[Reset Password ERROR]', err);
    return res.status(500).json({ success: false, error: err.message || 'Error updating password.' });
  }
});

// 5b. Step 4 (PIN Reset): Reset 4-Digit Withdrawal PIN via Verified OTP Session
app.post('/api/auth/forgot-pin/reset-pin', async (req, res) => {
  try {
    const { sessionToken, newPin, confirmPin } = req.body;
    if (!sessionToken) {
      return res.status(400).json({ success: false, error: 'Session expired. Please request a new code.' });
    }

    const sess = otpSessions.get(sessionToken);
    if (!sess || !sess.verified) {
      return res.status(401).json({ success: false, error: 'Please verify your 6-digit code first.' });
    }

    if (Date.now() > sess.expiresAt) {
      otpSessions.delete(sessionToken);
      return res.status(400).json({ success: false, error: 'Session expired. Please request a new code.' });
    }

    const cleanPin = String(newPin || '').trim();
    const cleanConfirm = String(confirmPin || '').trim();

    if (!cleanPin || cleanPin !== cleanConfirm) {
      return res.status(400).json({ success: false, error: 'PINs do not match.' });
    }

    if (!/^\d{4}$/.test(cleanPin)) {
      return res.status(400).json({ success: false, error: 'PIN must be exactly 4 numeric digits (0-9).' });
    }

    // Update user's transactionPin in Supabase cloud database
    const { users } = await getSupabaseCloudData();
    const userIdx = users.findIndex(u => u.id === sess.userId);
    if (userIdx === -1) {
      return res.status(404).json({ success: false, error: 'Account not found in cloud database.' });
    }

    users[userIdx].transactionPin = cleanPin;
    users[userIdx].pinUpdatedAt = new Date().toISOString();
    users[userIdx].updatedAt = new Date().toISOString();

    const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?id=eq.${SUPABASE_SYNC_ID}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        users,
        updated_at: new Date().toISOString()
      })
    });

    if (!patchRes.ok) {
      const errText = await patchRes.text().catch(() => '');
      return res.status(500).json({
        success: false,
        error: `Could not save new PIN to database: ${errText || 'Network error'}`
      });
    }

    // Clean up OTP session
    otpSessions.delete(sessionToken);

    return res.json({
      success: true,
      message: 'Withdrawal PIN reset successfully!',
      userId: users[userIdx].id
    });

  } catch (err) {
    console.error('[Reset PIN ERROR]', err);
    return res.status(500).json({ success: false, error: err.message || 'Error updating PIN.' });
  }
});

// 6. Admin: Test SMS dispatch (Brevo or KudiSMS)
app.post('/api/kudisms/test-sms', async (req, res) => {
  try {
    const { phone, message, token, senderID, gateway, provider, brevoSmsKey } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Recipient phone number is required.' });
    }

    const { kudismsConfig, emailConfig } = await getSupabaseCloudData().catch(() => ({ kudismsConfig: {}, emailConfig: {} }));
    const activeCfg = {
      ...kudismsConfig,
      ...(provider ? { provider } : {}),
      ...(token ? { token } : {}),
      ...(senderID ? { senderID } : {}),
      ...(gateway ? { gateway } : {}),
      ...(brevoSmsKey ? { brevoSmsKey } : {})
    };

    const testMsg = message || 'Iretomiwa Sun Investment: 123456 is your reset key. Valid for 10 minutes.';
    const result = await sendSmsOtpMessage(phone, testMsg, activeCfg, emailConfig);

    return res.json({
      success: result.ok,
      provider: result.provider,
      data: result.data
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Admin: Test Email dispatch
app.post('/api/email/test', async (req, res) => {
  try {
    const { recipient, config: customConfig } = req.body || {};
    const { emailConfig: cloudConfig } = await getSupabaseCloudData().catch(() => ({ emailConfig: {} }));
    const activeConfig = Object.assign({}, cloudConfig, customConfig || {});

    const targetEmail = (recipient || activeConfig.senderEmail || activeConfig.smtpUser || '').trim();
    if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid recipient email address for testing.'
      });
    }

    const testOtp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`[Admin Test Email] Sending test OTP ${testOtp} to ${targetEmail}`);

    const result = await sendOtpEmail(targetEmail, testOtp, activeConfig);

    if (result.success) {
      return res.json({
        success: true,
        provider: result.provider,
        message: `Test email successfully dispatched to ${targetEmail} via ${result.provider}. Please check your inbox or spam folder!`,
        data: result.data || result.info
      });
    }

    return res.status(400).json({
      success: false,
      error: result.error || result.notice || 'Failed to dispatch test email. Please check your credentials.',
      details: result
    });
  } catch (err) {
    console.error('[Admin Test Email ERROR]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Serve frontend static assets from current directory
app.use(express.static(path.join(__dirname)));

// Fallback to index.html for Single-Page Application routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start listening
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`IRETOMIWA SUN INVESTMENT SERVER STARTED ON PORT ${PORT}`);
  console.log(`Automated Payout Engine: ACTIVE 24/7`);
  console.log(`=======================================================`);
});
