// Netlify Serverless Function: Admin Pending Request Notifier
// Dispatches instant notifications to Admin device via Telegram Bot and Webhook channels

exports.handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active', service: 'Iretomiwa Sun Admin Notifier' }),
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: 'Method Not Allowed' };
  }

  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const {
    type,
    clientName,
    clientId,
    clientPhone,
    amount,
    netAmount,
    fee,
    bankName,
    accountNumber,
    accountName,
    note,
    timestamp,
    telegramConfig,
    isTest
  } = body;

  const results = { telegram: null, status: 'ok' };

  // 1. Telegram Bot Notification
  const botToken = (telegramConfig && telegramConfig.botToken) || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = (telegramConfig && telegramConfig.chatId) || process.env.TELEGRAM_CHAT_ID;

  if (botToken && chatId) {
    try {
      const formattedAmount = '₦' + Number(amount || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 });
      const formattedNet = '₦' + Number(netAmount || amount || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 });
      const formattedFee = '₦' + Number(fee || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 });

      let message = '';
      if (isTest) {
        message = `[NOTIFICATION TEST: SYSTEM ONLINE]\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `[OK] Iretomiwa Sun Admin Alerts are active.\n` +
          `Your device will receive instant notifications whenever clients submit withdrawal or deposit requests.\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `Time: ${new Date().toLocaleString('en-GB')}`;
      } else {
        const isWithdrawal = (type === 'withdraw' || type === 'withdrawal' || type === 'payout');
        const title = isWithdrawal ? '[NEW WITHDRAWAL REQUEST]' : '[NEW DEPOSIT REQUEST]';
        
        message = `*${title}*\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `*Client:* ${clientName || 'Client'} (\`${clientId || '-'}\`)\n` +
          `*Phone:* ${clientPhone || '-'}\n` +
          `*Amount:* ${formattedAmount}\n` +
          (isWithdrawal && fee ? `*Net Payout:* ${formattedNet} _(Fee: ${formattedFee})_\n` : '') +
          (bankName ? `*Destination Bank:* ${bankName}\n` : '') +
          (accountNumber ? `*Account Number:* \`${accountNumber}\`\n` : '') +
          (accountName ? `*Account Name:* ${accountName}\n` : '') +
          (note ? `*Memo:* ${note}\n` : '') +
          `━━━━━━━━━━━━━━━━━━\n` +
          `[Open Admin Dashboard](https://iretomiwa-sun-investment.netlify.app/#admin)`;
      }

      const tgUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const tgRes = await fetch(tgUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        })
      });

      const tgJson = await tgRes.json();
      results.telegram = { success: tgRes.ok, response: tgJson };
    } catch (tgErr) {
      console.warn('Telegram notification error:', tgErr);
      results.telegram = { success: false, error: tgErr.message };
    }
  }

  return {
    statusCode: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(results)
  };
};
