# GitHub Actions Firebase Deployment

This workflow automatically deploys Firebase Functions when you push changes to the `firebase-backend/functions/` directory.

## Setup Required

### 1. Generate Firebase CI Token

```bash
cd firebase-backend
npx firebase login:ci
```

Copy the token that appears - this is your `FIREBASE_TOKEN` secret.

### 2. Add GitHub Secrets

Go to your GitHub repo → Settings → Secrets and variables → Actions → New repository secret

Add these secrets:

| Secret Name | Description | How to Get |
|-------------|-------------|------------|
| `FIREBASE_TOKEN` | Firebase CI token | Run `firebase login:ci` locally |
| `STRIPE_SECRET_KEY` | Stripe secret key | Stripe Dashboard → Developers → API Keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook endpoint secret | Stripe Dashboard → Webhooks |
| `HELIUS_API_KEY` | Helius RPC API key | [Helius Dashboard](https://helius.xyz/) |
| `SOLANA_TREASURY_KEY` | Solana treasury wallet private key | Your wallet private key (base58) |
| `SES_SMTP_USER` | AWS SES SMTP username | SES Console → SMTP Settings |
| `SES_SMTP_PASSWORD` | AWS SES SMTP password | SES Console → SMTP Settings |
| `SES_FROM_EMAIL` | From email address | e.g., `noreply@everlitcandle.com` |

### 3. Configure Firebase Environment (One-time)

The workflow also needs to set Firebase config. Run this locally once:

```bash
cd firebase-backend/functions
firebase functions:config:set \
  stripe.secret_key="$STRIPE_SECRET_KEY" \
  stripe.webhook_secret="$STRIPE_WEBHOOK_SECRET" \
  helius.api_key="$HELIUS_API_KEY" \
  solana.treasury_key="$SOLANA_TREASURY_KEY" \
  ses.smtp_user="$SES_SMTP_USER" \
  ses.smtp_password="$SES_SMTP_PASSWORD" \
  ses.from_email="$SES_FROM_EMAIL"
```

### 4. Test Deployment

Push to main branch:

```bash
git add .
git commit -m "Add GitHub Actions deployment"
git push origin main
```

Check deployment status in GitHub → Actions tab.

## Manual Deployment (Fallback)

If GitHub Actions fails, deploy manually:

```bash
cd firebase-backend/functions
firebase login
firebase deploy --only functions
```

## Troubleshooting

### "Permission denied" errors
- Verify you're logged into the correct Firebase project
- Check that your account has "Cloud Functions Developer" role

### "Config not found" errors
- Run `firebase functions:config:get` locally to verify config is set
- The config is project-specific and persists across deployments

### Build failures
- Check Node.js version (must be 20+)
- Verify `package.json` dependencies are correct
