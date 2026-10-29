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
  const cleanPath = pathParam.replace(/^\/+/, '');
  const targetUrl = `https://api.flutterwave.com/v3/${cleanPath}`;

  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';

  try {
    const fetchOptions = {
      method: event.httpMethod,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (authHeader) {
      fetchOptions.headers['Authorization'] = authHeader;
    }

    if (event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD' && event.body) {
      fetchOptions.body = event.body;
    }

    const response = await fetch(targetUrl, fetchOptions);
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
    return {
      statusCode: 502,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'error',
        message: 'Proxy gateway error: ' + (err.message || 'Could not reach Flutterwave API'),
      }),
    };
  }
};
