/**
 * Everlit Candle - Firebase Functions
 * Stripe Checkout + Solana NFT Minting
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const Stripe = require('stripe');
const { Connection, Keypair, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction } = require('@solana/web3.js');
const bs58 = require('bs58');

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

// Initialize Stripe with test key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || functions.config().stripe?.secret_key, {
  apiVersion: '2024-04-10',
});

// Solana Configuration
const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const TREASURY_WALLET_SECRET = process.env.TREASURY_WALLET_SECRET || functions.config().solana?.treasury_secret;
const NFT_PRICE_USD = 7.00;

// CORS configuration
const cors = require('cors')({ origin: true });

/**
 * Create Stripe Checkout Session
 * POST /createCheckoutSession
 */
exports.createCheckoutSession = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { email, prayer, isPublic = false } = req.body;

      if (!email || !prayer) {
        return res.status(400).json({ error: 'Email and prayer are required' });
      }

      // Create a pending candle document
      const candleRef = db.collection('candles').doc();
      const candleData = {
        id: candleRef.id,
        email: email,
        prayer: prayer,
        isPublic: isPublic,
        status: 'pending_payment',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      await candleRef.set(candleData);

      // Create Stripe Checkout Session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        customer_email: email,
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Everlit Candle',
              description: 'A unique digital prayer candle minted on Solana blockchain',
              images: ['https://everlitcandle.com/assets/logo.png'],
            },
            unit_amount: Math.round(NFT_PRICE_USD * 100), // $7.00 in cents
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `https://everlitcandle.com/mycandles.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `https://everlitcandle.com/?canceled=true`,
        metadata: {
          candleId: candleRef.id,
          email: email,
          prayer: prayer.substring(0, 100), // Limit for metadata
        },
      });

      // Update candle with session ID
      await candleRef.update({
        stripeSessionId: session.id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.status(200).json({
        sessionId: session.id,
        url: session.url,
        candleId: candleRef.id,
      });

    } catch (error) {
      console.error('Error creating checkout session:', error);
      return res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Stripe Webhook - Handle successful payments
 * POST /stripeWebhook
 */
exports.stripeWebhook = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || functions.config().stripe?.webhook_secret;

    let event;

    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle checkout.session.completed
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const candleId = session.metadata?.candleId;

      if (candleId) {
        try {
          // Update candle status
          await db.collection('candles').doc(candleId).update({
            status: 'payment_completed',
            stripePaymentIntentId: session.payment_intent,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Trigger minting (async)
          await exports.mintCandleNFT({ candleId });

        } catch (error) {
          console.error('Error processing payment completion:', error);
        }
      }
    }

    return res.status(200).json({ received: true });
  });
});

/**
 * Mint NFT on Solana (Internal function)
 */
exports.mintCandleNFT = async function(data) {
  const { candleId } = data;

  try {
    // Get candle data
    const candleDoc = await db.collection('candles').doc(candleId).get();
    if (!candleDoc.exists) {
      throw new Error('Candle not found');
    }

    const candle = candleDoc.data();

    // TODO: Implement actual Solana NFT minting
    // For now, we'll create a placeholder mint address
    // This requires:
    // 1. Creating a Metaplex metadata account
    // 2. Minting the NFT to the treasury wallet
    // 3. Setting up transfer to user's email-linked wallet

    // Placeholder implementation
    const placeholderMintAddress = `CANDLE${Date.now()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Update candle with NFT info
    await db.collection('candles').doc(candleId).update({
      status: 'minted',
      nftMintAddress: placeholderMintAddress,
      nftChain: 'solana-devnet',
      mintedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Send confirmation email (optional - could use Firebase Extensions)
    console.log(`Candle ${candleId} minted successfully!`);

    return { success: true, mintAddress: placeholderMintAddress };

  } catch (error) {
    console.error('Error minting NFT:', error);
    
    // Update candle with error status
    await db.collection('candles').doc(candleId).update({
      status: 'minting_failed',
      error: error.message,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    throw error;
  }
};

/**
 * Get User's Candles
 * GET /getUserCandles?email=user@example.com
 */
exports.getUserCandles = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { email } = req.query;

      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      const candlesSnapshot = await db.collection('candles')
        .where('email', '==', email)
        .orderBy('createdAt', 'desc')
        .get();

      const candles = candlesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate()?.toISOString(),
        updatedAt: doc.data().updatedAt?.toDate()?.toISOString(),
        mintedAt: doc.data().mintedAt?.toDate()?.toISOString(),
      }));

      return res.status(200).json({ candles });

    } catch (error) {
      console.error('Error fetching user candles:', error);
      return res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Get Public Candle Wall
 * GET /getPublicCandles?limit=20&offset=0
 */
exports.getPublicCandles = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const limit = parseInt(req.query.limit) || 20;
      const offset = parseInt(req.query.offset) || 0;

      const candlesSnapshot = await db.collection('candles')
        .where('isPublic', '==', true)
        .where('status', '==', 'minted')
        .orderBy('mintedAt', 'desc')
        .limit(limit)
        .offset(offset)
        .get();

      const candles = candlesSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          mintAddress: data.nftMintAddress,
          prayer: data.prayer,
          mintedAt: data.mintedAt?.toDate()?.toISOString(),
          // Don't expose email or other private info
        };
      });

      return res.status(200).json({ candles });

    } catch (error) {
      console.error('Error fetching public candles:', error);
      return res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Health Check
 * GET /health
 */
exports.health = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    return res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      stripeConfigured: !!process.env.STRIPE_SECRET_KEY || !!functions.config().stripe?.secret_key,
    });
  });
});
