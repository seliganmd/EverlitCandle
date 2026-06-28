/**
 * Everlit Candle - Firebase Functions
 * Stripe Checkout + Solana NFT Minting Integration
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const Stripe = require('stripe');
const { mintEverlitCandle } = require('./solana');
const { Connection, clusterApiUrl } = require('@solana/web3.js');

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
      const normalizedEmail = email.toLowerCase().trim();
      console.log('Creating candle for email:', normalizedEmail);
      
      const candleRef = db.collection('candles').doc();
      const candleData = {
        id: candleRef.id,
        email: normalizedEmail,
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
        success_url: `https://seliganmd.github.io/EverlitCandle/mycandles.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `https://seliganmd.github.io/EverlitCandle/mycandles.html?canceled=true`,
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

    console.log('Webhook received. Signature:', sig ? 'present' : 'missing');
    console.log('Endpoint secret:', endpointSecret ? 'configured' : 'missing');

    try {
      // Verify webhook signature
      event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
      console.log('Webhook verified. Event type:', event.type);
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
            console.error(`Candle ${candleId} not found in database`);
            throw new Error('Candle not found');
          }
          
          console.log('Candle data retrieved:', {
            email: candleData.email,
            prayerLength: candleData.prayer?.length,
            isPublic: candleData.isPublic,
            currentStatus: candleData.status
          });
          
          // Skip if already minted or minting
          if (candleData.status === 'minted') {
            console.log(`Candle ${candleId} already minted, skipping`);
            return res.status(200).json({ received: true, alreadyMinted: true });
          }
          
          // Mint the NFT on Solana
          const heliusApiKey = functions.config().helius?.api_key || process.env.HELIUS_API_KEY;
          const treasuryKey = functions.config().solana?.treasury_key || process.env.SOLANA_TREASURY_KEY;
          
          console.log('Config check:', {
            heliusApiKeyPresent: !!heliusApiKey,
            heliusApiKeyLength: heliusApiKey?.length,
            treasuryKeyPresent: !!treasuryKey,
            treasuryKeyLength: treasuryKey?.length
          });
          
          if (!heliusApiKey || !treasuryKey) {
            console.error('Missing Solana configuration. Run:');
            console.error('firebase functions:config:set helius.api_key="YOUR_HELIUS_KEY" solana.treasury_key="YOUR_PRIVATE_KEY"');
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

      const normalizedEmail = email.toLowerCase().trim();
      console.log('Fetching candles for email:', normalizedEmail);
      
      // Try exact match first
      let candlesSnapshot;
      try {
        candlesSnapshot = await db.collection('candles')
          .where('email', '==', normalizedEmail)
          .orderBy('createdAt', 'desc')
          .get();
      } catch (indexError) {
        console.log('Index error on sorted query, trying unsorted:', indexError.message);
        candlesSnapshot = await db.collection('candles')
          .where('email', '==', normalizedEmail)
          .get();
      }
      
      // If no results, try without normalization (for legacy data)
      if (candlesSnapshot.empty) {
        console.log('No candles found with normalized email, trying raw email:', email);
        try {
          candlesSnapshot = await db.collection('candles')
            .where('email', '==', email)
            .orderBy('createdAt', 'desc')
            .get();
        } catch (indexError) {
          console.log('Index error on legacy query, trying unsorted:', indexError.message);
          candlesSnapshot = await db.collection('candles')
            .where('email', '==', email)
            .get();
        }
      }
      
      console.log(`Found ${candlesSnapshot.size} candles`);

      // Sort by createdAt descending if we couldn't use orderBy in query
      // Sort by createdAt descending if we couldn't use orderBy in query
      const candles = candlesSnapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate()?.toISOString(),
          updatedAt: doc.data().updatedAt?.toDate()?.toISOString(),
          mintedAt: doc.data().mintedAt?.toDate()?.toISOString(),
        }))
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

      // Update any candles that were minted on-chain but not marked in database
      // This fixes candles where transaction succeeded but Firestore update failed
      for (const candle of candles) {
        if (candle.status === 'minting_failed' && candle.nftMintAddress) {
          // Candle has a mint address but was marked as failed - check if it's actually minted
          try {
            const { Connection, clusterApiUrl, PublicKey } = require('@solana/web3.js');
            const connection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');
            const mintPubkey = new PublicKey(candle.nftMintAddress);
            
            // Check if account exists
            const accountInfo = await connection.getAccountInfo(mintPubkey);
            if (accountInfo) {
              console.log(`Candle ${candle.id} has valid mint on-chain, updating status`);
              // Update in background (don't await)
              db.collection('candles').doc(candle.id).update({
                status: 'minted',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
              }).catch(e => console.error('Failed to update candle status:', e));
              
              // Update in memory for this response
              candle.status = 'minted';
            }
          } catch (checkError) {
            console.log(`Could not verify candle ${candle.id} on-chain:`, checkError.message);
          }
        }
      }

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

      // Simplified query to avoid index requirements - just get all public candles with valid statuses
      // then sort in memory
      let candlesSnapshot;
      try {
        candlesSnapshot = await db.collection('candles')
          .where('isPublic', '==', true)
          .orderBy('createdAt', 'desc')
          .limit(limit * 2) // Get more to account for filtering
          .get();
      } catch (indexError) {
        console.log('Index error, falling back to simple query:', indexError.message);
        // Fallback: get all and filter in memory
        candlesSnapshot = await db.collection('candles')
          .where('isPublic', '==', true)
          .limit(100)
          .get();
      }

      // Filter by status in memory - only show successfully minted candles on the wall
      const candles = candlesSnapshot.docs
        .map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            prayer: data.prayer,
            status: data.status,
            nftMintAddress: data.nftMintAddress,
            mintedAt: data.mintedAt?.toDate()?.toISOString(),
            createdAt: data.createdAt?.toDate()?.toISOString(),
          };
        })
        .filter(c => c.status === 'minted' && c.nftMintAddress)
        .slice(0, limit);

      // Get total count for counter - only count successfully minted candles
      let totalCount = 0;
      try {
        const totalSnapshot = await db.collection('candles')
          .where('status', '==', 'minted')
          .count()
          .get();
        totalCount = totalSnapshot.data().count;
      } catch (countError) {
        console.log('Count query failed:', countError.message);
        totalCount = candles.length;
      }

      return res.status(200).json({ candles, totalCount });

    } catch (error) {
      console.error('Error fetching public candles:', error);
      return res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Get NFT Metadata
 * GET /nftMetadata?candleId=xxx
 * Returns JSON metadata for a specific candle NFT
 */
exports.nftMetadata = functions.https.onRequest((req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      // Support both ?candleId=xxx and ?c=xxx (shorter for transaction size)
      const candleId = req.query.candleId || req.query.c;
      
      if (!candleId) {
        return res.status(400).json({ error: 'candleId is required' });
      }

      // Fetch candle data
      const candleDoc = await db.collection('candles').doc(candleId).get();
      
      if (!candleDoc.exists) {
        return res.status(404).json({ error: 'Candle not found' });
      }
      
      const candleData = candleDoc.data();

      // Return metadata in Metaplex format
      const metadata = {
        name: `Everlit Candle #${candleId.slice(-6)}`,
        symbol: 'EVERLIT',
        description: `A prayer candle lit on the Solana blockchain.\n\nPrayer: "${candleData.prayer}"\n\nLit by: ${candleData.email}\nDate: ${candleData.createdAt?.toDate?.() ? candleData.createdAt.toDate().toISOString() : new Date().toISOString()}`,
        image: 'https://seliganmd.github.io/EverlitCandle/assets/EverlitCandle_animated.gif',
        attributes: [
          { trait_type: 'Prayer', value: candleData.prayer?.slice(0, 100) + (candleData.prayer?.length > 100 ? '...' : '') },
          { trait_type: 'Lit By', value: candleData.email },
          { trait_type: 'Lit Date', value: candleData.createdAt?.toDate?.() ? candleData.createdAt.toDate().toISOString() : new Date().toISOString() },
          { trait_type: 'Visibility', value: candleData.isPublic ? 'Public' : 'Private' },
          { trait_type: 'Network', value: 'Solana' }
        ],
        properties: {
          category: 'image',
          files: [{ uri: 'https://seliganmd.github.io/EverlitCandle/assets/EverlitCandle_animated.gif', type: 'image/gif' }]
        }
      };

      return res.status(200).json(metadata);
      
    } catch (error) {
      console.error('Metadata fetch failed:', error);
      return res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Retry Minting for Failed Candles
 * POST /retryMint
 * Body: { candleId: string }
 */
exports.retryMint = functions.https.onRequest((req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { candleId } = req.body;
      
      if (!candleId) {
        return res.status(400).json({ error: 'candleId is required' });
      }

      // Fetch candle data
      const candleDoc = await db.collection('candles').doc(candleId).get();
      const candleData = candleDoc.data();
      
      if (!candleData) {
        return res.status(404).json({ error: 'Candle not found' });
      }

      if (candleData.status === 'minted') {
        return res.status(200).json({ success: true, message: 'Already minted', mintAddress: candleData.nftMintAddress });
      }

      console.log(`Retrying mint for candle ${candleId}...`);

      // Mint the NFT on Solana
      const heliusApiKey = functions.config().helius?.api_key || process.env.HELIUS_API_KEY;
      const treasuryKey = functions.config().solana?.treasury_key || process.env.SOLANA_TREASURY_KEY;
      
      console.log('Retry mint config:', {
        heliusApiKeyPresent: !!heliusApiKey,
        heliusApiKeyLength: heliusApiKey?.length,
        treasuryKeyPresent: !!treasuryKey
      });
      
      if (!heliusApiKey || !treasuryKey) {
        console.error('Missing config. Run: firebase functions:config:set helius.api_key="..." solana.treasury_key="..."');
        return res.status(500).json({ error: 'Missing Solana configuration' });
      }
      
      const mintResult = await mintEverlitCandle({
        heliusApiKey,
        treasuryPrivateKey: treasuryKey,
        prayer: candleData.prayer,
        email: candleData.email,
        candleId: candleId,
        isPublic: candleData.isPublic
      });
      
      // Update candle with NFT data
      await db.collection('candles').doc(candleId).update({
        status: 'minted',
        nftMintAddress: mintResult.mintAddress,
        nftSignature: mintResult.signature,
        nftMetadataUri: mintResult.metadataUri,
        mintedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        error: null // Clear any previous error
      });
      
      console.log(`NFT minted successfully on retry: ${mintResult.mintAddress}`);
      
      return res.status(200).json({
        success: true,
        mintAddress: mintResult.mintAddress,
        signature: mintResult.signature
      });
      
    } catch (error) {
      console.error('Retry mint failed:', error);
      return res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Check Candle Status on Solana
 * GET /checkCandleStatus?candleId=xxx
 * Verifies if a candle was minted on-chain and updates Firestore
 */
exports.checkCandleStatus = functions.https.onRequest((req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { candleId } = req.query;
      
      if (!candleId) {
        return res.status(400).json({ error: 'candleId is required' });
      }

      // Fetch candle from Firestore
      const candleDoc = await db.collection('candles').doc(candleId).get();
      
      if (!candleDoc.exists) {
        return res.status(404).json({ error: 'Candle not found' });
      }
      
      const candleData = candleDoc.data();
      
      // If already minted, just return success
      if (candleData.status === 'minted' && candleData.nftMintAddress) {
        return res.status(200).json({
          status: 'minted',
          mintAddress: candleData.nftMintAddress,
          signature: candleData.nftSignature,
          message: 'Already minted'
        });
      }
      
      // If there's a signature, check if transaction succeeded
      if (candleData.nftSignature && candleData.nftSignature !== 'pending') {
        const { Connection, clusterApiUrl } = require('@solana/web3.js');
        const connection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');
        
        try {
          // Check transaction status
          const status = await connection.getSignatureStatus(candleData.nftSignature);
          
          if (status.value?.err) {
            // Transaction failed
            return res.status(200).json({
              status: 'failed',
              signature: candleData.nftSignature,
              error: status.value.err,
              message: 'Transaction failed on-chain'
            });
          } else if (status.value?.confirmationStatus === 'confirmed' || status.value?.confirmationStatus === 'finalized') {
            // Transaction succeeded but Firestore wasn't updated
            // Update Firestore now
            await db.collection('candles').doc(candleId).update({
              status: 'minted',
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            
            return res.status(200).json({
              status: 'minted',
              mintAddress: candleData.nftMintAddress,
              signature: candleData.nftSignature,
              message: 'Transaction confirmed, status updated'
            });
          } else {
            return res.status(200).json({
              status: 'pending',
              signature: candleData.nftSignature,
              confirmationStatus: status.value?.confirmationStatus,
              message: 'Transaction pending confirmation'
            });
          }
        } catch (checkError) {
          console.error('Error checking transaction:', checkError);
          return res.status(200).json({
            status: candleData.status,
            signature: candleData.nftSignature,
            message: 'Could not verify transaction status'
          });
        }
      }
      
      return res.status(200).json({
        status: candleData.status,
        message: 'No transaction signature found'
      });
      
    } catch (error) {
      console.error('Check candle status failed:', error);
      return res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Fix Candle Status (Admin only - manually mark as minted)
 * POST /fixCandleStatus
 * Body: { candleId: string, mintAddress: string, signature: string }
 */
exports.fixCandleStatus = functions.https.onRequest((req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { candleId, mintAddress, signature } = req.body;
      
      if (!candleId || !mintAddress) {
        return res.status(400).json({ error: 'candleId and mintAddress are required' });
      }

      // Fetch candle from Firestore
      const candleDoc = await db.collection('candles').doc(candleId).get();
      
      if (!candleDoc.exists) {
        return res.status(404).json({ error: 'Candle not found' });
      }

      // Update candle to minted status
      await db.collection('candles').doc(candleId).update({
        status: 'minted',
        nftMintAddress: mintAddress,
        nftSignature: signature || 'unknown',
        nftMetadataUri: `https://us-central1-everlitcandle.cloudfunctions.net/nftMetadata?c=${candleId}`,
        mintedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        error: null
      });

      console.log(`Fixed candle ${candleId} to minted status with mint ${mintAddress}`);
      
      return res.status(200).json({
        success: true,
        message: 'Candle status fixed',
        candleId,
        mintAddress
      });
      
    } catch (error) {
      console.error('Fix candle status failed:', error);
      return res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Transfer NFT to User Wallet
 * POST /transferNFT
 * Body: { candleId: string, destinationWallet: string }
 * Transfers NFT from treasury to user's wallet
 */
exports.transferNFT = functions.https.onRequest((req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { candleId, destinationWallet } = req.body;
      
      if (!candleId || !destinationWallet) {
        return res.status(400).json({ error: 'candleId and destinationWallet are required' });
      }

      // Fetch candle from Firestore
      const candleDoc = await db.collection('candles').doc(candleId).get();
      
      if (!candleDoc.exists) {
        return res.status(404).json({ error: 'Candle not found' });
      }
      
      const candleData = candleDoc.data();
      
      if (!candleData.nftMintAddress) {
        return res.status(400).json({ error: 'Candle has no NFT mint address' });
      }

      // Get treasury key
      const treasuryKey = functions.config().solana?.treasury_key;
      if (!treasuryKey) {
        return res.status(500).json({ error: 'Treasury not configured' });
      }

      // Import Solana modules
      const { Connection, Keypair, PublicKey, Transaction } = require('@solana/web3.js');
      const { 
        getAssociatedTokenAddress,
        createAssociatedTokenAccountInstruction,
        createTransferInstruction,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      } = require('@solana/spl-token');
      const bs58 = require('bs58');

      // Setup connection
      const heliusApiKey = functions.config().helius?.api_key;
      const rpcUrl = heliusApiKey 
        ? `https://mainnet.helius-rpc.com/?api-key=***
        : 'https://api.mainnet-beta.solana.com';
      
      const connection = new Connection(rpcUrl, 'confirmed');

      // Load treasury keypair
      const secretKey = bs58.decode(treasuryKey);
      const treasuryKeypair = Keypair.fromSecretKey(secretKey);
      const treasuryPubkey = treasuryKeypair.publicKey;

      const mintPubkey = new PublicKey(candleData.nftMintAddress);
      const destinationPubkey = new PublicKey(destinationWallet);

      console.log(`Transferring NFT ${candleData.nftMintAddress} from ${treasuryPubkey.toBase58()} to ${destinationWallet}`);

      // Get token accounts
      const sourceTokenAccount = await getAssociatedTokenAddress(mintPubkey, treasuryPubkey);
      const destinationTokenAccount = await getAssociatedTokenAddress(mintPubkey, destinationPubkey);

      // Build transaction
      const transaction = new Transaction();

      // Check if destination token account exists
      const destAccountInfo = await connection.getAccountInfo(destinationTokenAccount);
      
      if (!destAccountInfo) {
        console.log('Creating destination token account...');
        transaction.add(
          createAssociatedTokenAccountInstruction(
            treasuryPubkey,
            destinationTokenAccount,
            destinationPubkey,
            mintPubkey,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }

      // Transfer the NFT
      transaction.add(
        createTransferInstruction(
          sourceTokenAccount,
          destinationTokenAccount,
          treasuryPubkey,
          1,
          [],
          TOKEN_PROGRAM_ID
        )
      );

      // Send transaction
      console.log('Sending transaction...');
      const signature = await connection.sendTransaction(transaction, [treasuryKeypair], {
        commitment: 'confirmed'
      });

      console.log('Transfer successful:', signature);

      // Update Firestore
      await db.collection('candles').doc(candleId).update({
        transferredTo: destinationWallet,
        transferredAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return res.status(200).json({
        success: true,
        signature: signature,
        mintAddress: candleData.nftMintAddress,
        destination: destinationWallet,
        explorerUrl: `https://explorer.solana.com/tx/${signature}`
      });
      
    } catch (error) {
      console.error('Transfer NFT failed:', error);
      return res.status(500).json({ error: error.message });
    }
  });
});
