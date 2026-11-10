// Netlify Serverless Function: Flutterwave Webhook Listener
// Automatically records incoming transfers to dedicated virtual accounts in real-time

const SUPABASE_CONFIG = {
  URL: 'https://cmzfqeifdlktavqsoyjt.supabase.co',
  ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtemZxZWlmZGxrdGF2cXNveWp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyODM1NjksImV4cCI6MjEwODg1OTU2OX0.AnWfzXrkNc3kCEy7EfKbeP3A191OKO_B8DK8kfeFdZM',
  TABLE: 'app_sync',
  SYNC_ID: 'prod_v2',
};

exports.handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, verif-hash',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'active',
        service: 'Iretomiwa Sun Enterprise - Flutterwave Webhook Receiver',
        timestamp: new Date().toISOString()
      }),
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: 'Method Not Allowed' };
  }

  // Optional Secret Hash verification
  const secretHashEnv = process.env.FLW_SECRET_HASH;
  const incomingHash = event.headers['verif-hash'] || event.headers['Verif-Hash'] || '';
  if (secretHashEnv && incomingHash && incomingHash !== secretHashEnv) {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized secret hash' }) };
  }

  let payload = null;
  try {
    let rawBody = event.body;
    if (event.isBase64Encoded && rawBody) {
      rawBody = Buffer.from(rawBody, 'base64').toString('utf8');
    }
    payload = JSON.parse(rawBody || '{}');
  } catch (e) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const data = payload.data || payload;
  const eventName = payload.event || payload['event.type'] || payload.type || '';
  const status = (data.status || '').toLowerCase();

  // We process successful charges (including virtual account transfers)
  if (status !== 'successful' && !eventName.includes('successful') && !eventName.includes('completed')) {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ status: 'ignored', reason: 'Not a completed transaction' })
    };
  }

  const amount = parseFloat(data.amount || data.charged_amount || 0);
  if (isNaN(amount) || amount <= 0) {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ status: 'ignored', reason: 'Invalid or zero amount' })
    };
  }

  const txRef = String(data.tx_ref || '').trim();
  const flwRef = String(data.flw_ref || data.id || '').trim();
  let meta = data.meta;
  if (typeof meta === 'string') {
    try { meta = JSON.parse(meta); } catch(e) {}
  }
  const accNum = String(
    data.account?.account_number || 
    data.account_number || 
    meta?.virtualaccountnumber || 
    meta?.virtual_account_number || 
    meta?.accountnumber || 
    ''
  ).trim();
  const customerEmail = String(data.customer?.email || '').trim().toLowerCase();
  const customerPhone = String(data.customer?.phone_number || '').trim().replace(/\D/g, '');

  try {
    // 1. Pull current cloud state from Supabase
    const supaUrl = `${SUPABASE_CONFIG.URL}/rest/v1/${SUPABASE_CONFIG.TABLE}?id=eq.${SUPABASE_CONFIG.SYNC_ID}&select=*`;
    const getRes = await fetch(supaUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_CONFIG.ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_CONFIG.ANON_KEY}`,
      }
    });

    if (!getRes.ok) {
      throw new Error(`Supabase fetch failed: HTTP ${getRes.status}`);
    }

    const rows = await getRes.json();
    const record = Array.isArray(rows) && rows[0] ? rows[0] : (rows || {});
    const users = Array.isArray(record.users) ? record.users : [];
    const transactions = Array.isArray(record.transactions) ? record.transactions : [];

    // 2. Identify target user
    let matchedUser = null;

    // Check by dedicated account number
    if (accNum) {
      matchedUser = users.find(u => u.dedicatedAccount && u.dedicatedAccount.accountNumber === accNum);
    }

    // Check by tx_ref prefix (e.g. VA_IR00003_...)
    if (!matchedUser && txRef.startsWith('VA_')) {
      const parts = txRef.split('_');
      if (parts.length >= 2) {
        const potentialId = parts[1].toLowerCase();
        matchedUser = users.find(u => (u.id || '').toLowerCase() === potentialId);
      }
    }

    // Check by customer phone (matching standard 10 trailing digits across 234 / 0 prefixes)
    if (!matchedUser && customerPhone && customerPhone.length >= 10) {
      const custTen = customerPhone.slice(-10);
      matchedUser = users.find(u => {
        const uPhone = (u.phone || '').replace(/\D/g, '');
        return uPhone.length >= 10 && uPhone.slice(-10) === custTen;
      });
    }

    // Check by customer email
    if (!matchedUser && customerEmail && customerEmail.includes('@')) {
      matchedUser = users.find(u => u.email && u.email.trim().toLowerCase() === customerEmail);
    }

    // Check by synthetic user email (e.g. ir00010@suninvestment.com)
    if (!matchedUser && customerEmail && customerEmail.includes('@suninvestment.com')) {
      const idPart = customerEmail.split('@')[0].toLowerCase();
      matchedUser = users.find(u => (u.id || '').toLowerCase() === idPart);
    }

    if (!matchedUser) {
      console.warn(`[WEBHOOK] No user matched for transaction: accNum=${accNum}, txRef=${txRef}, email=${customerEmail}`);
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ status: 'unmatched', reason: 'User not found in ledger' })
      };
    }

    // 3. Deduplication check: Has this specific transaction already been credited?
    const canonicalId = data.id || flwRef || Date.now();
    const newTxId = 'tx_flw_va_' + String(canonicalId).replace(/[^a-zA-Z0-9_-]/g, '');

    // For dedicated virtual accounts, tx_ref (e.g. VA_IR00003_...) identifies the virtual account,
    // not the individual transaction. Only flw_ref and data.id uniquely identify a payment.
    const isVirtualAccountTx = txRef.startsWith('VA_') || txRef.startsWith('URF_') || !!accNum;

    const alreadyCredited = transactions.some(t => {
      if (t.userId !== matchedUser.id) return false;
      if (t.id === newTxId) return true;
      if (data.id && (String(t.flwId) === String(data.id) || t.id.includes(String(data.id)))) return true;
      if (flwRef && (t.reference === flwRef || t.flutterwaveRef === flwRef)) return true;
      if (!isVirtualAccountTx && txRef && (t.reference === txRef || t.flutterwaveRef === txRef)) return true;
      return false;
    });

    if (alreadyCredited) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ status: 'duplicate', message: 'Transaction already credited' })
      };
    }

    // 4. Create and append the new deposit transaction with deterministic ID
    const bankName = data.meta?.bankname || data.account?.bank_name || 'Bank Transfer';
    const originator = data.meta?.originatorname ? ` from ${data.meta.originatorname}` : '';
    const txTime = data.created_at || new Date().toISOString();
    const noteText = `Direct transfer to dedicated account (${bankName})${originator}`;
    const newTx = {
      id: newTxId,
      userId: matchedUser.id,
      type: 'deposit',
      amount: amount,
      method: 'bank_transfer',
      reference: flwRef || String(data.id) || newTxId,
      flutterwaveRef: isVirtualAccountTx ? (flwRef || String(data.id)) : (txRef || flwRef || newTxId),
      flwId: data.id || null,
      notes: noteText,
      note: noteText,
      category: 'General Savings',
      status: 'approved',
      reviewedAt: new Date().toISOString(),
      reviewedBy: 'flutterwave',
      createdAt: txTime,
      date: txTime
    };

    transactions.push(newTx);

    // 5. Save back to Supabase
    const patchPayload = {
      ...record,
      transactions: transactions,
      updated_at: new Date().toISOString()
    };

    const pushRes = await fetch(`${SUPABASE_CONFIG.URL}/rest/v1/${SUPABASE_CONFIG.TABLE}?id=eq.${SUPABASE_CONFIG.SYNC_ID}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_CONFIG.ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_CONFIG.ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(patchPayload)
    });

    if (!pushRes.ok) {
      throw new Error(`Supabase update failed: HTTP ${pushRes.status}`);
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        status: 'success',
        message: 'Deposit credited to user successfully',
        userId: matchedUser.id,
        amount: amount,
        txId: newTxId
      })
    };
  } catch (err) {
    console.error('[WEBHOOK ERROR]', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message || 'Webhook processing error' })
    };
  }
};
