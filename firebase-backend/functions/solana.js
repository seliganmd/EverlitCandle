/**
 * Everlit Candle - Solana NFT Minting
 * Using raw Solana web3.js with Token Metadata Program
 */

const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  clusterApiUrl
} = require('@solana/web3.js');
const {
  createMint,
  mintTo,
  createAssociatedTokenAccount,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} = require('@solana/spl-token');
const {
  createCreateMetadataAccountV3Instruction,
  PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID
} = require('@metaplex-foundation/mpl-token-metadata');
const bs58 = require('bs58');

/**
 * Create metadata instruction
 */
function createMetadataInstruction(metadata, mint, mintAuthority, payer) {
  const [metadataPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer()
    ],
    TOKEN_METADATA_PROGRAM_ID
  );

  const data = {
    name: metadata.name,
    symbol: metadata.symbol,
    uri: metadata.uri,
    sellerFeeBasisPoints: metadata.sellerFeeBasisPoints || 0,
    creators: metadata.creators || null,
    collection: null,
    uses: null
  };

  return createCreateMetadataAccountV3Instruction(
    {
      metadata: metadataPDA,
      mint: mint,
      mintAuthority: mintAuthority,
      payer: payer,
      updateAuthority: mintAuthority
    },
    {
      createMetadataAccountArgsV3: {
        data: data,
        isMutable: true,
        collectionDetails: null
      }
    }
  );
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
    console.log(`Minting Everlit #${candleId.slice(-4)}...`);

    // Setup connection
    const rpcUrl = heliusApiKey
      ? `https://mainnet.helius-rpc.com/?api-key=***
      : clusterApiUrl('mainnet-beta');

    const connection = new Connection(rpcUrl, 'confirmed');

    // Load treasury keypair
    const secretKey = bs58.decode(treasuryPrivateKey);
    const treasuryKeypair = Keypair.fromSecretKey(secretKey);
    console.log('Treasury:', treasuryKeypair.publicKey.toBase58());

    // Create new mint keypair
    const mintKeypair = Keypair.generate();
    console.log('Mint:', mintKeypair.publicKey.toBase58());

    // Build transaction
    const transaction = new Transaction();

    // Create mint account
    const createMintAccountInstruction =
      require('@solana/spl-token').createInitializeMint2Instruction(
        mintKeypair.publicKey,
        0, // 0 decimals for NFT
        treasuryKeypair.publicKey,
        treasuryKeypair.publicKey,
        TOKEN_PROGRAM_ID
      );

    // Get rent-exempt balance for mint
    const mintRent = await connection.getMinimumBalanceForRentExemption(82);

    // Add create account instruction
    transaction.add(
      require('@solana/web3.js').SystemProgram.createAccount({
        fromPubkey: treasuryKeypair.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: 82,
        lamports: mintRent,
        programId: TOKEN_PROGRAM_ID
      })
    );

    // Add initialize mint instruction
    transaction.add(createMintAccountInstruction);

    // Create associated token account for treasury
    const associatedTokenAddress = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      treasuryKeypair.publicKey
    );

    transaction.add(
      require('@solana/spl-token').createAssociatedTokenAccountInstruction(
        treasuryKeypair.publicKey,
        associatedTokenAddress,
        treasuryKeypair.publicKey,
        mintKeypair.publicKey,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );

    // Mint 1 token to treasury
    transaction.add(
      require('@solana/spl-token').createMintToInstruction(
        mintKeypair.publicKey,
        associatedTokenAddress,
        treasuryKeypair.publicKey,
        1, // Mint 1 NFT
        [],
        TOKEN_PROGRAM_ID
      )
    );

    // Create metadata
    const metadataUri = `https://us-central1-everlitcandle.cloudfunctions.net/nftMetadata?candleId=${candleId}`;

    const metadataInstruction = createMetadataInstruction(
      {
        name: `Everlit #${candleId.slice(-4)}`,
        symbol: 'EVERLIT',
        uri: metadataUri,
        sellerFeeBasisPoints: 500,
        creators: [
          {
            address: treasuryKeypair.publicKey,
            share: 100,
            verified: true
          }
        ]
      },
      mintKeypair.publicKey,
      treasuryKeypair.publicKey,
      treasuryKeypair.publicKey
    );

    transaction.add(metadataInstruction);

    // Send transaction
    console.log('Sending transaction...');
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [treasuryKeypair, mintKeypair],
      { commitment: 'confirmed' }
    );

    console.log('Success! Signature:', signature);

    return {
      success: true,
      mintAddress: mintKeypair.publicKey.toBase58(),
      signature: signature,
      metadataUri: metadataUri
    };

  } catch (error) {
    console.error('Mint failed:', error);
    console.error('Stack:', error.stack);
    throw error;
  }
}

module.exports = { mintEverlitCandle };
