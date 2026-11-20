// SPL token helpers the worker may use: read a wallet's balance and BURN. No transfer out.
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, createBurnCheckedInstruction } from "@solana/spl-token";

export function createTokens(connection, decimals) {
  const ata = (mint, owner) => getAssociatedTokenAddressSync(new PublicKey(mint), owner);
  async function balance(mint, owner) {
    try {
      const r = await connection.getTokenAccountBalance(ata(mint, owner), "confirmed");
      return BigInt(r.value.amount);
    } catch {
      return 0n;
    }
  }
  const burnIx = (mint, owner, amount) =>
    createBurnCheckedInstruction(ata(mint, owner), new PublicKey(mint), owner, BigInt(amount), decimals);
  return { balance, burnIx };
}
