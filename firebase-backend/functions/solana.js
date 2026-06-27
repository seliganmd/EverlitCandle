/**
 * Everlit Candle - Solana NFT Minting
 * Using raw Solana web3.js
 */

const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
  clusterApiUrl,
  SYSVAR_RENT_PUBKEY
} = require('@solana/web3.js');
const {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  createMintToInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction
} = require('@solana/spl-token');
const bs58 = require('bs58');

// Token Metadata Program ID
const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

/**
 * Get metadata PDA
 */
function getMetadataPDA(mint) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer()
    ],
    TOKEN_METADATA_PROGRAM_ID
  )[0];
}

/**
 * Create metadata instruction
 */
function createMetadataInstruction(accounts, data) {
  // Manually build the instruction
  const keys = [
    { pubkey: accounts.metadata, isSigner: false, isWritable: true },
    { pubkey: accounts.mint, isSigner: false, isWritable: false },
    { pubkey: accounts.mintAuthority, isSigner: true, isWritable: false },
    { pubkey: accounts.payer, isSigner: true, isWritable: true },
    { pubkey: accounts.updateAuthority, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }
  ];

  // Build instruction data manually
  // Discriminator for CreateMetadataAccountV3 = 33
  const discriminator = Buffer.from([33]);
  
  // Serialize args with generous buffer
  const nameBuf = Buffer.from(data.name);
  const symbolBuf = Buffer.from(data.symbol);
  const uriBuf = Buffer.from(data.uri);
  
  // Calculate needed size: 3x u32 lengths (4 bytes each) + strings + u16 (2 bytes) + 5x bool/option (1 byte each)
  // Total: 12 + name + symbol + uri + 2 + 5 = 19 + name + symbol + uri
  const neededSize = 4 + nameBuf.length + 4 + symbolBuf.length + 4 + uriBuf.length + 2 + 1 + 1 + 1 + 1 + 1;
  console.log('Buffer calc - name:', nameBuf.length, 'symbol:', symbolBuf.length, 'uri:', uriBuf.length, 'needed:', neededSize);
  
  // Allocate with extra padding for safety
  const argsBuf = Buffer.alloc(Math.max(neededSize + 50, 250));
  let offset = 0;
  
  // name
  argsBuf.writeUInt32LE(nameBuf.length, offset);
  offset += 4;
  nameBuf.copy(argsBuf, offset);
  offset += nameBuf.length;
  
  // symbol
  argsBuf.writeUInt32LE(symbolBuf.length, offset);
  offset += 4;
  symbolBuf.copy(argsBuf, offset);
  offset += symbolBuf.length;
  
  // uri
  argsBuf.writeUInt32LE(uriBuf.length, offset);
  offset += 4;
  uriBuf.copy(argsBuf, offset);
  offset += uriBuf.length;
  
  // sellerFeeBasisPoints (u16)
  argsBuf.writeUInt16LE(data.sellerFeeBasisPoints, offset);
  offset += 2;
  
  // creators (Option) - None for simplicity
  argsBuf.writeUInt8(0, offset);
  offset += 1;
  
  // collection (Option) - None
  argsBuf.writeUInt8(0, offset);
  offset += 1;
  
  // uses (Option) - None
  argsBuf.writeUInt8(0, offset);
  offset += 1;
  
  // isMutable (bool)
  argsBuf.writeUInt8(data.isMutable ? 1 : 0, offset);
  offset += 1;
  
  // collectionDetails (Option) - None
  argsBuf.writeUInt8(0, offset);
  offset += 1;
  
  console.log('Final offset:', offset, 'buffer size:', argsBuf.length);
  
  if (offset > argsBuf.length) {
    throw new Error(`Buffer overflow: offset ${offset} exceeds buffer size ${argsBuf.length}`);
  }
  
  const dataBuffer = Buffer.concat([discriminator, argsBuf.slice(0, offset)]);
  
  console.log('Instruction data size:', dataBuffer.length);
  
  return {
    programId: TOKEN_METADATA_PROGRAM_ID,
    keys: keys,
    data: dataBuffer
  };
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
    console.log('Helius API key present:', heliusApiKey ? 'yes' : 'no');
    console.log('Helius API key length:', heliusApiKey ? heliusApiKey.length : 0);

    // Setup connection - try Helius first, fall back to default if invalid
    let connection;
    let usingHelius = false;
    
    if (heliusApiKey && heliusApiKey.length > 30) {
      try {
        const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
        connection = new Connection(rpcUrl, 'confirmed');
        // Test the connection
        await connection.getSlot();
        usingHelius = true;
        console.log('Using Helius RPC');
      } catch (connError) {
        console.log('Helius connection failed, falling back to default:', connError.message);
        connection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');
      }
    } else {
      console.log('No valid Helius key, using default RPC');
      connection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');
    }

    // Load treasury keypair
    const secretKey = bs58.decode(treasuryPrivateKey);
    const treasuryKeypair = Keypair.fromSecretKey(secretKey);
    console.log('Treasury:', treasuryKeypair.publicKey.toBase58());

    // Create new mint keypair
    const mintKeypair = Keypair.generate();
    console.log('Mint:', mintKeypair.publicKey.toBase58());

    // Get associated token address
    const associatedTokenAddress = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      treasuryKeypair.publicKey
    );

    // Get metadata PDA
    const metadataPDA = getMetadataPDA(mintKeypair.publicKey);

    // Build transaction
    const transaction = new Transaction();

    // 1. Create mint account
    const mintRent = await connection.getMinimumBalanceForRentExemption(82);
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: treasuryKeypair.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: 82,
        lamports: mintRent,
        programId: TOKEN_PROGRAM_ID
      })
    );

    // 2. Initialize mint
    transaction.add(
      createInitializeMintInstruction(
        mintKeypair.publicKey,
        0,
        treasuryKeypair.publicKey,
        treasuryKeypair.publicKey
      )
    );

    // 3. Create associated token account
    transaction.add(
      createAssociatedTokenAccountInstruction(
        treasuryKeypair.publicKey,
        associatedTokenAddress,
        treasuryKeypair.publicKey,
        mintKeypair.publicKey
      )
    );

    // 4. Mint 1 token
    transaction.add(
      createMintToInstruction(
        mintKeypair.publicKey,
        associatedTokenAddress,
        treasuryKeypair.publicKey,
        1
      )
    );

    // 5. Create metadata with SHORTER URI to fit in transaction
    // Use a shorter URL format to save space in the transaction
    const shortUri = `https://us-central1-everlitcandle.cloudfunctions.net/nftMetadata?c=${candleId}`;
    console.log('Metadata URI length:', shortUri.length);
    
    const metadataIx = createMetadataInstruction(
      {
        metadata: metadataPDA,
        mint: mintKeypair.publicKey,
        mintAuthority: treasuryKeypair.publicKey,
        payer: treasuryKeypair.publicKey,
        updateAuthority: treasuryKeypair.publicKey
      },
      {
        name: `Everlit #${candleId.slice(-4)}`,
        symbol: 'EVRL',
        uri: shortUri,
        sellerFeeBasisPoints: 500,
        isMutable: true
      }
    );

    transaction.add(metadataIx);

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
      metadataUri: shortUri
    };

  } catch (error) {
    console.error('Mint failed:', error);
    console.error('Stack:', error.stack);
    throw error;
  }
}

module.exports = { mintEverlitCandle };
