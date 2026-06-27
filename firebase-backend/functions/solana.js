/**
 * Everlit Candle - Solana NFT Minting
 * Metaplex UMI integration for minting prayer candles
 */

const { createUmi } = require('@metaplex-foundation/umi-bundle-defaults');
const { 
  generateSigner, 
  percentAmount,
  publicKey
} = require('@metaplex-foundation/umi');
const { fromWeb3JsKeypair } = require('@metaplex-foundation/umi-web3js-adapters');
const { 
  createNft,
  mplTokenMetadata
} = require('@metaplex-foundation/mpl-token-metadata');
const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');

// Helper for Option<none>
function none() {
  return { __option: 'None' };
}

/**
 * Initialize UMI with Helius RPC
 */
function initializeUmi(heliusApiKey, treasuryPrivateKey) {
  const rpcUrl = heliusApiKey 
    ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
    : 'https://api.mainnet-beta.solana.com';
  
  console.log('Initializing UMI...');
  
  const umi = createUmi(rpcUrl).use(mplTokenMetadata());
  
  // Decode private key and create keypair
  const secretKeyUint8 = bs58.decode(treasuryPrivateKey);
  const keypair = Keypair.fromSecretKey(secretKeyUint8);
  
  // Convert to UMI signer using web3js adapter (this has signTransaction)
  const treasurySigner = fromWeb3JsKeypair(keypair);
  
  // Set identity and payer
  umi.identity = treasurySigner;
  umi.payer = treasurySigner;
  
  console.log('Treasury:', keypair.publicKey.toBase58());
  
  return { umi, treasurySigner, keypair };
}

/**
 * Mint a new Everlit Candle NFT
 * Uses external metadata URL to keep transaction small
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
    console.log(`Minting Everlit #${candleId.slice(-4)}...`);
    
    // Initialize UMI
    const { umi, treasurySigner } = initializeUmi(heliusApiKey, treasuryPrivateKey);
    
    // Use external metadata URL
    const metadataUri = `https://us-central1-everlitcandle.cloudfunctions.net/nftMetadata?candleId=${candleId}`;
    console.log('Metadata URL:', metadataUri);
    
    // Generate mint signer
    const mintSigner = generateSigner(umi);
    console.log('Mint:', mintSigner.publicKey.toString().slice(0, 16) + '...');
    
    // Create NFT - treasury is already set as identity/payer
    const result = await createNft(umi, {
      mint: mintSigner,
      name: `Everlit #${candleId.slice(-4)}`,
      symbol: 'EVERLIT',
      uri: metadataUri,
      sellerFeeBasisPoints: percentAmount(5),
      collection: none(),
      uses: none(),
      isMutable: true,
    }).sendAndConfirm(umi);
    
    console.log('Success! Tx:', result.signature.slice(0, 20) + '...');
    
    return {
      success: true,
      mintAddress: mintSigner.publicKey.toString(),
      signature: result.signature,
      metadataUri: metadataUri
    };
    
  } catch (error) {
    console.error('Mint failed:', error.message);
    console.error('Stack:', error.stack);
    throw error;
  }
}

module.exports = { mintEverlitCandle };
