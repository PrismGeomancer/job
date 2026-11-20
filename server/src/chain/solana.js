// Solana transaction sending with idempotency. The signature is known before sending, so the
// worker records it first; after a crash it checks that signature instead of sending again.
import bs58 from "bs58";
import { Connection, Transaction, TransactionInstruction, PublicKey, SystemProgram, ComputeBudgetProgram } from "@solana/web3.js";

export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export function memoInstruction(memo, signer) {
  return new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
    data: Buffer.from(memo, "utf8"),
  });
}

export function createSolana(rpcUrl) {
  const connection = new Connection(rpcUrl, "confirmed");

  // Build, sign and return { tx, signature, lastValidBlockHeight } without sending.
  async function prepare(txOrIxs, { feePayer, signers, memo, priorityMicroLamports = 20_000 }) {
    const tx = txOrIxs instanceof Transaction ? txOrIxs : new Transaction().add(...txOrIxs);
    tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityMicroLamports }));
    if (memo) tx.add(memoInstruction(memo, feePayer.publicKey));
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = feePayer.publicKey;
    const uniq = [feePayer, ...signers.filter((s) => !s.publicKey.equals(feePayer.publicKey))];
    tx.sign(...uniq);
    const signature = tx.signatures[0].signature;
    return { tx, signature: bs58.encode(signature), lastValidBlockHeight };
  }

  async function send(prepared) {
    await connection.sendRawTransaction(prepared.tx.serialize(), { skipPreflight: false, maxRetries: 5 });
    return confirm(prepared.signature, prepared.lastValidBlockHeight);
  }

  // "confirmed" | "failed" | "expired" | "pending"
  async function status(signature, lastValidBlockHeight) {
    const { value } = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
    const s = value[0];
    if (s) {
      if (s.err) return "failed";
      if (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized") return "confirmed";
      return "pending";
    }
    const height = await connection.getBlockHeight("confirmed");
    return height > lastValidBlockHeight ? "expired" : "pending";
  }

  async function confirm(signature, lastValidBlockHeight, timeoutMs = 90_000) {
    const until = Date.now() + timeoutMs;
    for (;;) {
      const st = await status(signature, lastValidBlockHeight);
      if (st !== "pending" || Date.now() > until) return st;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  const transferIx = (from, to, lamports) =>
    SystemProgram.transfer({ fromPubkey: from, toPubkey: new PublicKey(to), lamports: BigInt(lamports) });

  // First produced slot >= slot, and its blockhash (skipped slots have no block).
  async function blockhashAtOrAfter(slot) {
    const slots = await connection.getBlocks(slot, slot + 100, "finalized");
    if (!slots.length) return null;
    const block = await connection.getBlock(slots[0], { maxSupportedTransactionVersion: 0, transactionDetails: "none", rewards: false, commitment: "finalized" });
    return block ? { slot: slots[0], blockhash: block.blockhash } : null;
  }

  return {
    connection, prepare, send, status, confirm, transferIx, blockhashAtOrAfter,
    getSlot: () => connection.getSlot("finalized"),
    getBalance: (addr) => connection.getBalance(new PublicKey(addr), "confirmed").then(BigInt),
  };
}
