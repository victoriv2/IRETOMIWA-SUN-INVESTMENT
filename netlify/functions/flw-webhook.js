// Flutterwave Webhook Alias
// Forwards directly to webhook.js handler to ensure both URL variants work seamlessly
const webhookHandler = require('./webhook.js');
exports.handler = webhookHandler.handler;
