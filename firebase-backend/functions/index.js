/**
 * Everlit Candle - Firebase Functions
 * Stripe Checkout + Solana NFT Minting Integration
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const Stripe = require('stripe');
const { mintEverlitCandle } = require('./solana');

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

// Initialize Stripe with secret key from config
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || functions.config().stripe?.secret_key, {
  apiVersion: '2024-04-10',
});

const NFT_PRICE_USD = 7.00;

// Simple CORS handler
const corsHandler = (req, res, callback) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }
  
  return callback(req, res);
};

/**
 * Health Check
 * GET /health
 */
exports.health = functions.https.onRequest((req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const stripeConfigured = !!process.env.STRIPE_SECRET_KEY || !!functions.config().stripe?.secret_key;
    const solanaConfigured = !!(functions.config().helius?.api_key && functions.config().solana?.treasury_key);
    
    return res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      message: 'Everlit Candle API is running',
      stripeConfigured: stripeConfigured,
      solanaConfigured: solanaConfigured,
      production: stripeConfigured && solanaConfigured
    });
  });
});

/**
 * Create Stripe Checkout Session
 * POST /createCheckoutSession
 */
exports.createCheckoutSession = functions.https.onRequest((req, res) => {
  return corsHandler(req, res, async () => {
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
              description: 'A unique digital prayer candle on Solana blockchain',
              images: ['https://everlitcandle.com/assets/logo.png'],
            },
            unit_amount: Math.round(NFT_PRICE_USD * 100), // $7.00 in cents
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `https://everlitcandle.com/mycandles.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `https://everlitcandle.com/mycandles.html?canceled=true`,
        metadata: {
          candleId: candleRef.id,
          email: email,
          prayer: prayer.substring(0, 100),
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
 * Stripe Webhook Handler
 * POST /stripeWebhook
 */
exports.stripeWebhook = functions.https.onRequest((req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || functions.config().stripe?.webhook_secret;

    let event;

    try {
      // Verify webhook signature
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

          console.log(`Payment completed for candle ${candleId}`);
          
          // Fetch candle data for NFT minting
          const candleDoc = await db.collection('candles').doc(candleId).get();
          const candleData = candleDoc.data();
          
          if (!candleData) {
            throw new Error('Candle not found');
          }
          
          // Mint the NFT on Solana
          const heliusApiKey = functions.config().helius?.api_key;
          const treasuryKey = functions.config().solana?.treasury_key;
          
          if (!heliusApiKey || !treasuryKey) {
            console.error('Missing Solana configuration');
            await db.collection('candles').doc(candleId).update({
              status: 'minting_failed',
              error: 'Missing Solana configuration',
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            return res.status(200).json({ received: true, error: 'Config missing' });
          }
          
          try {
            const mintResult = await mintEverlitCandle({
              heliusApiKey,
              treasuryPrivateKey: treasuryKey,
              prayer: candleData.prayer,
              email: candleData.email,
              candleId: candleId,
              isPublic: candleData.isPublic
            });
            
            // Update candle with real NFT data
            await db.collection('candles').doc(candleId).update({
              status: 'minted',
              nftMintAddress: mintResult.mintAddress,
              nftSignature: mintResult.signature,
              nftMetadataUri: mintResult.metadataUri,
              mintedAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            
            console.log(`NFT minted successfully: ${mintResult.mintAddress}`);
            
          } catch (mintError) {
            console.error('NFT minting failed:', mintError);
            await db.collection('candles').doc(candleId).update({
              status: 'minting_failed',
              error: mintError.message,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }

        } catch (error) {
          console.error('Error processing payment completion:', error);
        }
      }
    }

    return res.status(200).json({ received: true });
  });
});

/**
 * Get User's Candles
 * GET /getUserCandles?email=user@example.com
 */
exports.getUserCandles = functions.https.onRequest((req, res) => {
  return corsHandler(req, res, async () => {
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
 * GET /getPublicCandles?limit=20
 */
exports.getPublicCandles = functions.https.onRequest((req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const limit = parseInt(req.query.limit) || 20;

      const candlesSnapshot = await db.collection('candles')
        .where('isPublic', '==', true)
        .where('status', '==', 'minted')
        .orderBy('mintedAt', 'desc')
        .limit(limit)
        .get();

      const candles = candlesSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          prayer: data.prayer,
          mintedAt: data.mintedAt?.toDate()?.toISOString(),
          createdAt: data.createdAt?.toDate()?.toISOString(),
        };
      });

      // Get total count for counter
      const totalSnapshot = await db.collection('candles')
        .where('status', 'in', ['minted', 'payment_completed'])
        .count()
        .get();
      
      const totalCount = totalSnapshot.data().count;

      return res.status(200).json({ candles, totalCount });

    } catch (error) {
      console.error('Error fetching public candles:', error);
      return res.status(500).json({ error: error.message });
    }
  });
});
