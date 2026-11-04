// Netlify Serverless Function: Flutterwave Secure CORS Proxy
// Proxies server-side requests to https://api.flutterwave.com/v3/ without browser CORS restrictions

exports.handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  // Handle browser pre-flight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: '',
    };
  }

  const pathParam = (event.queryStringParameters && event.queryStringParameters.path) || '';

  // Diagnostics: Check server outbound IP
  if ((event.queryStringParameters && event.queryStringParameters.checkip) || pathParam === 'check-ip' || pathParam === 'ip') {
    try {
      const ipRes = await fetch('https://api.ipify.org?format=json');
      const ipData = await ipRes.json();
      return {
        statusCode: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          server: 'Netlify Serverless Function (AWS Lambda)',
          ip: ipData.ip,
          info: 'Netlify serverless functions run in the cloud with dynamic IPs across AWS IP pools. Flutterwave IP Whitelisting should be disabled/cleared in your dashboard for serverless platforms.'
        }, null, 2),
      };
    } catch (e) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: e.message }),
      };
    }
  }

  const pathParam = (event.queryStringParameters && event.queryStringParameters.path) || '';
  const cleanPath = pathParam.replace(/^\/+/, '');
  const targetUrl = `https://api.flutterwave.com/v3/${cleanPath}`;

  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';

  let requestBody = event.body;
  if (event.isBase64Encoded && event.body) {
    try {
      requestBody = Buffer.from(event.body, 'base64').toString('utf8');
    } catch(e) {}
  }

  try {
    const clientIp = event.headers['x-nf-client-connection-ip'] || 
                     event.headers['client-ip'] || 
                     event.headers['x-forwarded-for'] || '';

    const fetchOptions = {
      method: event.httpMethod,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };

    if (clientIp) {
      fetchOptions.headers['X-Forwarded-For'] = clientIp;
      fetchOptions.headers['X-Real-IP'] = clientIp.split(',')[0].trim();
      fetchOptions.headers['CF-Connecting-IP'] = clientIp.split(',')[0].trim();
    }

    if (authHeader) {
      fetchOptions.headers['Authorization'] = authHeader;
    }

    if (event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD' && requestBody) {
      fetchOptions.body = requestBody;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    fetchOptions.signal = controller.signal;

    const response = await fetch(targetUrl, fetchOptions);
    clearTimeout(timeoutId);
    const responseText = await response.text();

    return {
      statusCode: response.status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: responseText,
    };
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    return {
      statusCode: 502,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'error',
        message: isTimeout ? 'Flutterwave API timeout after 12s' : ('Proxy gateway error: ' + (err.message || 'Could not reach Flutterwave API')),
      }),
    };
  }
};
