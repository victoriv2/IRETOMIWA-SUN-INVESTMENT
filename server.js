// ==============================================================================
// IRETOMIWA SUN INVESTMENT - 24/7 AUTOMATED PAYOUT & CORS BACKEND (RAILWAY)
// ==============================================================================

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY || 'FLWSECK-fc044b9b11bc1da34e06422d381602d4-1a1872431eevt-X';
const FLW_SECRET_HASH = process.env.FLW_SECRET_HASH || 'IretomiwaSun2026';

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

// ==============================================================================
// AUTOMATED WITHDRAWAL / PAYOUT DISBURSEMENT ENDPOINT
// ==============================================================================
app.post('/api/payout/disburse', async (req, res) => {
  try {
    const {
      amount,
      accountNumber,
      bankCode,
      bankName,
      accountName,
      narration,
      txId,
      userId
    } = req.body;

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

    const reference = 'TXF_' + (txId || Date.now()) + '_' + Math.random().toString(36).slice(2, 7);
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
      console.log(`[Disburse SUCCESS] Transfer initiated id: ${flwJson.data.id}`);
      return res.json({
        success: true,
        transferId: flwJson.data.id,
        reference: flwJson.data.reference || reference,
        status: flwJson.data.status,
        accountName: flwJson.data.full_name || cleanAccountName,
        raw: flwJson.data
      });
    }

    // Handle Flutterwave rejection / business errors
    const errorMsg = (flwJson && (flwJson.message || flwJson.error)) ||
      `Flutterwave transfer failed with HTTP status ${flwRes.status}`;

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
  const validHashes = [FLW_SECRET_HASH, 'IretomiwaSun2026', 'IretomiwaSunInvestmentSecHash2026'].filter(Boolean);
  if (hash && !validHashes.includes(hash)) {
    console.warn(`[Webhook] Invalid signature received: ${hash}`);
    return res.status(401).json({ status: 'invalid signature' });
  }

  const event = req.body;
  console.log(`[Webhook RECEIVED] event: ${event?.event || event?.['event.type'] || 'unknown'}`);

  // Immediate 200 acknowledge to Flutterwave
  res.status(200).json({ status: 'success' });
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
