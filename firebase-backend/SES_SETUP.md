# AWS SES Setup Guide for Everlit Candle

## Current Status
- ✅ SES Application created in AWS Console
- ✅ Production access requested (pending approval, up to 24 hours)
- ⏳ Domain verification pending

## Next Steps

### 1. Verify Domain (everlitcandle.com)
1. Go to AWS SES → Verified identities
2. Click "Create identity"
3. Select "Domain"
4. Enter: `everlitcandle.com`
5. Copy the TXT record values
6. Add to your DNS (wherever you manage everlitcandle.com DNS)

### 2. Create SMTP Credentials
1. Go to AWS SES → SMTP settings
2. Click "Create SMTP credentials"
3. Save the username and password securely

### 3. Configure Firebase Functions
Once you have SMTP credentials, run:

```bash
cd firebase-backend/functions
firebase functions:config:set ses.smtp_user="YOUR_SES_SMTP_USERNAME" ses.smtp_password="YOUR_SES_SMTP_PASSWORD" ses.from_email="noreply@everlitcandle.com"
```

Or set environment variables:
```bash
export SES_SMTP_USER="YOUR_SES_SMTP_USERNAME"
export SES_SMTP_PASSWORD="YOUR_SES_SMTP_PASSWORD"
export SES_FROM_EMAIL="noreply@everlitcandle.com"
```

### 4. Deploy Updated Functions
```bash
cd firebase-backend/functions
npm install
firebase deploy --only functions
```

## Testing

Once SES is approved and configured:

1. Go to https://seliganmd.github.io/EverlitCandle/
2. Click "Light My Candle"
3. Enter email and prayer
4. Click submit
5. Check your email for the verification link
6. Click the link to complete purchase

## Troubleshooting

### Emails not sending
- Check Firebase Functions logs: `firebase functions:log`
- Verify SES credentials are set: `firebase functions:config:get`
- Ensure domain is verified in SES console

### Emails in spam
- Complete domain verification with DKIM
- Set up SPF and DMARC records
- Use a dedicated sending domain

## Code Changes Made

1. Added `sendVerificationEmailSES()` function to `index.js`
2. Updated `sendVerificationEmail` to use SES when configured
3. Added `nodemailer` dependency to `package.json`
4. Beautiful HTML email template with prayer preview

## Fallback Behavior

If SES is not configured yet:
- Verification URL is returned in API response
- Frontend can display it for testing
- System still works, just without automated emails
