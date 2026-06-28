/**
 * Transfer NFT from Treasury to User Wallet
 */

const { Connection, Keypair, PublicKey, Transaction } = require('@solana/web3.js');
const { 
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} = require('@solana/spl-token');
const bs58 = require('bs58');

const MINT_ADDRESS = 'Gv5h13twhqSDmQzwUhwx2LtkyboF8zMPbfwTJh1W4CpE';
const DESTINATION_WALLET = 'F16SqWFwh3UgH7xAvrLjx2XZx454gbSXgZFvPGWz1E38';

async function transferNFT(treasuryPrivateKey) {
  try {
    console.log('Transferring NFT...');
    console.log('Mint:', MINT_ADDRESS);
    console.log('To:', DESTINATION_WALLET);

    const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

    const secretKey = bs58.decode(treasuryPrivateKey);
    const treasuryKeypair = Keypair.fromSecretKey(secretKey);
    const treasuryPubkey = treasuryKeypair.publicKey;
    
    console.log('From (Treasury):', treasuryPubkey.toBase58());

    const mintPubkey = new PublicKey(MINT_ADDRESS);
    const destinationPubkey = new PublicKey(DESTINATION_WALLET);

    const sourceTokenAccount = await getAssociatedTokenAddress(mintPubkey, treasuryPubkey);
    const destinationTokenAccount = await getAssociatedTokenAddress(mintPubkey, destinationPubkey);

    console.log('Source ATA:', sourceTokenAccount.toBase58());
    console.log('Destination ATA:', destinationTokenAccount.toBase58());

    const transaction = new Transaction();

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

    console.log('Adding transfer instruction...');
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

    console.log('Sending transaction...');
    const signature = await connection.sendTransaction(transaction, [treasuryKeypair], {
      commitment: 'confirmed'
    });

    console.log('\nSuccess!');
    console.log('Transaction:', signature);
    console.log('View on Solana:', `https://explorer.solana.com/tx/${signature}`);

    return signature;

  } catch (error) {
    console.error('Transfer failed:', error);
    throw error;
  }
}

const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('Everlit Candle NFT Transfer');
console.log('============================');
console.log('Mint:', MINT_ADDRESS);
console.log('To:', DESTINATION_WALLET);
console.log('');

rl.question('Enter treasury private key (base58): ', (privateKey) => {
  rl.close();
  
  if (!privateKey || privateKey.length < 50) {
    console.error('Invalid private key');
    process.exit(1);
  }

  transferNFT(privateKey)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
});
