/**
 * Everlit Candle - Solana NFT Minting
 * Metaplex UMI integration for minting prayer candles
 */

const { createUmi, signerIdentity } = require('@metaplex-foundation/umi-bundle-defaults');
const { createSignerFromKeypair } = require('@metaplex-foundation/umi');
const { 
  createNft,
  mplTokenMetadata
} = require('@metaplex-foundation/mpl-token-metadata');
const { 
  generateSigner,
  percentAmount
} = require('@metaplex-foundation/umi');
const bs58 = require('bs58');

// Collection configuration
const COLLECTION_CONFIG = {
  name: 'Everlit Candle',
  symbol: 'EVERLIT',
  sellerFeeBasisPoints: 500 // 5% royalty
};

// Helper functions for Option types
function some(value) {
  return { __option: 'Some', value };
}

function none() {
  return { __option: 'None' };
}

/**
 * Initialize UMI with Helius RPC
 */
function initializeUmi(heliusApiKey, treasuryPrivateKey) {
  // Use Helius RPC for reliability
  const rpcUrl = heliusApiKey 
    ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
    : 'https://api.mainnet-beta.solana.com';
  
  console.log('Initializing UMI with RPC:', rpcUrl.substring(0, 50) + '...');
  
  const umi = createUmi(rpcUrl)
    .use(mplTokenMetadata());
  
  // Decode the private key
  const secretKey = bs58.decode(treasuryPrivateKey);
  
  // Create a UMI keypair from the secret key
  const keypair = {
    publicKey: umi.eddsa.getPublicKey(secretKey.slice(0, 32)), // First 32 bytes are seed
    secretKey: secretKey
  };
  
  // Create a proper signer from the keypair
  const treasurySigner = createSignerFromKeypair(umi, keypair);
  
  // Set the signer as identity and payer
  umi.use(signerIdentity(treasurySigner));
  
  console.log('Treasury signer public key:', treasurySigner.publicKey.toString());
  
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
    console.log('Candle ID:', candleId);
    
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
    console.log('Creating NFT transaction...');
    const result = await createNft(umi, {
      mint: mintSigner,
      name: metadata.name,
      symbol: metadata.symbol,
      uri: metadataUri,
      sellerFeeBasisPoints: percentAmount(5),
      collection: none(),
      uses: none(),
      isMutable: true,
    }).sendAndConfirm(umi, {
      confirm: { commitment: 'confirmed' }
    });
    
    console.log('NFT minted successfully!');
    console.log('Signature:', result.signature);
    console.log('Mint Address:', mintSigner.publicKey.toString());
    
    return {
      success: true,
      mintAddress: mintSigner.publicKey.toString(),
      signature: result.signature,
      metadataUri: metadataUri,
      metadata: metadata
    };
    
  } catch (error) {
    console.error('NFT minting failed:', error);
    console.error('Error stack:', error.stack);
    throw error;
  }
}

module.exports = {
  mintEverlitCandle,
  initializeUmi
};
