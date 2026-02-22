import { AccountInfo, PublicKey } from '@solana/web3.js';
import { AccountLayout, TOKEN_PROGRAM_ID } from '@solana/spl-token';

export interface TokenAccountChange {
  ownerAddress: string;
  newBalance: bigint;
  mint: string;
}

export function parseTokenAccount(
  accountInfo: AccountInfo<Buffer>,
  expectedMint: string
): TokenAccountChange | null {
  try {
    const data = AccountLayout.decode(accountInfo.data);
    const mint = new PublicKey(data.mint).toBase58();

    if (mint !== expectedMint) return null;

    return {
      ownerAddress: new PublicKey(data.owner).toBase58(),
      newBalance: data.amount,
      mint,
    };
  } catch {
    return null;
  }
}

export function determineEventType(
  previousBalance: bigint,
  newBalance: bigint,
  hasSolMovement: boolean
): 'buy' | 'sell' | 'transfer_in' | 'transfer_out' {
  if (newBalance > previousBalance) {
    return hasSolMovement ? 'buy' : 'transfer_in';
  } else {
    return hasSolMovement ? 'sell' : 'transfer_out';
  }
}
