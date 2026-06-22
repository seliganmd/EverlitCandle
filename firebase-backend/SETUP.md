# Firebase Backend Setup Guide

## Prerequisites

1. Node.js 20+ installed
2. Firebase CLI installed globally: `npm install -g firebase-tools`
3. Firebase project created: `everlitcandle`

## Environment Configuration

### 1. Set Up Firebase Config

```bash
cd firebase-backend
firebase login
firebase use everlitcandle
```

### 2. Configure Stripe Secrets

```bash
# Set Stripe secret key (test mode) - REPLACE with your actual key
firebase functions:config:set stripe.secret_key="sk_test_YOUR_KEY_HERE"

# Get webhook signing secret after deploying webhook function
firebase functions:config:set stripe.webhook_secret="whsec_YOUR_SECRET_HERE"
```

### 3. Deploy Functions

```bash
firebase deploy --only functions
```

### 4. Set Up Stripe Webhook

1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://us-central1-everlitcandle.cloudfunctions.net/stripeWebhook`
3. Select events: `checkout.session.completed`
4. Copy signing secret and set it in Firebase config

### 5. Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules
```

## API Endpoints

After deployment, your backend will have these endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `https://us-central1-everlitcandle.cloudfunctions.net/createCheckoutSession` | POST | Create Stripe checkout |
| `https://us-central1-everlitcandle.cloudfunctions.net/stripeWebhook` | POST | Stripe webhook handler |
| `https://us-central1-everlitcandle.cloudfunctions.net/getUserCandles` | GET | Get user's candles |
| `https://us-central1-everlitcandle.cloudfunctions.net/getPublicCandles` | GET | Get public wall |
| `https://us-central1-everlitcandle.cloudfunctions.net/health` | GET | Health check |

## Testing

Test the checkout flow:
```bash
curl -X POST https://us-central1-everlitcandle.cloudfunctions.net/createCheckoutSession \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","prayer":"Test prayer","isPublic":true}'
```

## Production Deployment

When ready for production:

1. Switch to Stripe production keys
2. Switch Solana to mainnet
3. Update frontend API URLs
4. Deploy: `firebase deploy`
