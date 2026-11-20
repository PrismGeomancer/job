// Balance history for the payroll roll call, from standard RPC methods (works on a free Helius RPC
// URL; the public RPC usually blocks getProgramAccounts). For each token account of the mint, the
// balance right after each transaction comes from postTokenBalances.
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

export function createHistory(connection) {
  async function tokenAccounts(mint) {
    const accs = await connection.getParsedProgramAccounts(TOKEN_PROGRAM_ID, {
      filters: [{ dataSize: 165 }, { memcmp: { offset: 0, bytes: mint } }],
    });
    return accs.map((a) => a.pubkey.toBase58());
  }

  // The newest balance point of one token account with slot <= untilSlot (that's all a roll call needs).
  async function accountPoints(account, mint, untilSlot) {
    let before;
    for (let page = 0; page < 20; page++) {
      const sigs = await connection.getSignaturesForAddress(new PublicKey(account), { before, limit: 1000 }, "finalized");
      if (!sigs.length) break;
      for (const s of sigs) {
        if (s.slot > untilSlot || s.err) continue;
        const tx = await connection.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: "finalized" });
        if (!tx?.meta) continue;
        const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
        const idx = keys.indexOf(account);
        const post = tx.meta.postTokenBalances?.find((b) => b.accountIndex === idx && b.mint === mint);
        const pre = tx.meta.preTokenBalances?.find((b) => b.accountIndex === idx && b.mint === mint);
        const ref = post ?? pre;
        if (!ref) continue;
        return [{ slot: s.slot, index: 0, account, owner: ref.owner, amount: post ? post.uiTokenAmount.amount : "0", signature: s.signature }];
      }
      before = sigs[sigs.length - 1].signature;
    }
    return [];
  }

  // Balance points for every known token account of the mint, as of untilSlot.
  // knownAccounts covers accounts closed since (they no longer show up in getProgramAccounts).
  async function mintPoints(mint, untilSlot, knownAccounts = []) {
    const accounts = new Set([...(await tokenAccounts(mint)), ...knownAccounts]);
    const all = [];
    for (const a of accounts) all.push(...(await accountPoints(a, mint, untilSlot)));
    return { points: all, accounts: [...accounts] };
  }

  return { tokenAccounts, accountPoints, mintPoints };
}
