/**
 * Everlit Candle - Solana NFT Minting
 * Metaplex UMI integration for minting prayer candles
 */

const { createUmi } = require('@metaplex-foundation/umi-bundle-defaults');
const { fromWeb3JsKeypair } = require('@metaplex-foundation/umi-web3js-adapters');
const { 
  createNft,
  mplTokenMetadata,
  fetchDigitalAsset
} = require('@metaplex-foundation/mpl-token-metadata');
const { 
  generateSigner,
  percentAmount,
  sol,
  some
} = require('@metaplex-foundation/umi');
const { Keypair, Connection, clusterApiUrl } = require('@solana/web3.js');
const bs58 = require('bs58');

// Collection configuration
const COLLECTION_CONFIG = {
  name: 'Everlit Candle',
  symbol: 'EVERLIT',
  sellerFeeBasisPoints: 500, // 5% royalty
  creators: [
    { address: null, share: 100, verified: true } // Will be set to treasury
  ]
};

/**
 * Initialize UMI with Helius RPC
 */
function initializeUmi(heliusApiKey, treasuryPrivateKey) {
  // Use Helius RPC for reliability
  const rpcUrl = heliusApiKey 
    ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
    : clusterApiUrl('mainnet-beta');
  
  const umi = createUmi(rpcUrl)
    .use(mplTokenMetadata());
  
  // Load treasury keypair
  const treasuryKeypair = Keypair.fromSecretKey(bs58.decode(treasuryPrivateKey));
  const treasurySigner = fromWeb3JsKeypair(treasuryKeypair);
  
  // Set treasury as the signer
  umi.use({
    install(umi) {
      umi.identity = treasurySigner;
      umi.payer = treasurySigner;
    }
  });
  
  // Update creators with treasury address
  COLLECTION_CONFIG.creators[0].address = treasurySigner.publicKey;
  
  return { umi, treasurySigner };
}

/**
 * Upload metadata to Arweave via Helius
 */
async function uploadMetadata(heliusApiKey, metadata) {
  try {
    // Use Helius upload service or fallback to direct Arweave
    const response = await fetch('https://mainnet.helius-rpc.com/?api-key=' + heliusApiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'everlit-upload',
        method: 'uploadMetadata',
        params: {
          name: metadata.name,
          symbol: metadata.symbol,
          description: metadata.description,
          image: metadata.image,
          attributes: metadata.attributes,
          properties: {
            category: 'image',
            files: [{ uri: metadata.image, type: 'image/gif' }]
          }
        }
      })
    });
    
    const data = await response.json();
    if (data.result?.metadataUri) {
      return data.result.metadataUri;
    }
    
    // Fallback: Return a placeholder URI for now
    // In production, implement proper Arweave/Irys upload
    console.warn('Helius upload failed, using placeholder');
    return createPlaceholderUri(metadata);
    
  } catch (error) {
    console.error('Metadata upload error:', error);
    return createPlaceholderUri(metadata);
  }
}

/**
 * Create a placeholder URI for metadata
 * In production, replace with real Arweave/Irys upload
 */
function createPlaceholderUri(metadata) {
  // Create a data URI for testing
  const metadataJson = JSON.stringify({
    name: metadata.name,
    symbol: metadata.symbol,
    description: metadata.description,
    image: metadata.image,
    attributes: metadata.attributes,
    properties: {
      category: 'image',
      files: [{ uri: metadata.image, type: 'image/gif' }]
    }
  });
  
  return `data:application/json;base64,${Buffer.from(metadataJson).toString('base64')}`;
}

/**
 * Mint a new Everlit Candle NFT
 */
async function mintEverlitCandle({
  heliusApiKey,
  treasuryPrivateKey,
  prayer,
  email,
  candleId,
  isPublic
}) {
  try {
    console.log(`Minting Everlit Candle NFT for ${email}...`);
    
    // Initialize UMI
    const { umi, treasurySigner } = initializeUmi(heliusApiKey, treasuryPrivateKey);
    
    // Prepare metadata
    const metadata = {
      name: `Everlit Candle #${candleId.slice(-6)}`,
      symbol: COLLECTION_CONFIG.symbol,
      description: `A prayer candle lit on the Solana blockchain.\n\nPrayer: "${prayer}"\n\nLit by: ${email}\nDate: ${new Date().toISOString()}`,
      image: 'https://seliganmd.github.io/EverlitCandle/assets/EverlitCandle_animated.gif',
      attributes: [
        { trait_type: 'Prayer', value: prayer.slice(0, 100) + (prayer.length > 100 ? '...' : '') },
        { trait_type: 'Lit By', value: email },
        { trait_type: 'Lit Date', value: new Date().toISOString() },
        { trait_type: 'Visibility', value: isPublic ? 'Public' : 'Private' },
        { trait_type: 'Network', value: 'Solana' }
      ]
    };
    
    // Upload metadata
    const metadataUri = await uploadMetadata(heliusApiKey, metadata);
    console.log('Metadata URI:', metadataUri);
    
    // Generate mint signer
    const mintSigner = generateSigner(umi);
    console.log('Mint address:', mintSigner.publicKey.toString());
    
    // Create the NFT
    const { signature } = await createNft(umi, {
      mint: mintSigner,
      name: metadata.name,
      symbol: metadata.symbol,
      uri: metadataUri,
      sellerFeeBasisPoints: percentAmount(5),
      creators: null, // Single creator (the treasury) - no creators array needed
      collection: none(),
      uses: none(),
      isMutable: true,
    }).sendAndConfirm(umi);
    
    console.log('NFT minted successfully!');
    console.log('Signature:', signature);
    console.log('Mint Address:', mintSigner.publicKey.toString());
    
    return {
      success: true,
      mintAddress: mintSigner.publicKey.toString(),
      signature: signature,
      metadataUri: metadataUri,
      metadata: metadata
    };
    
  } catch (error) {
    console.error('NFT minting failed:', error);
    throw error;
  }
}

// Helper for Option<none>
function none() {
  return { __option: 'None' };
}

module.exports = {
  mintEverlitCandle,
  initializeUmi
};
