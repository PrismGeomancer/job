import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { encryptSecret, decryptSecret, newWallet, loadKeypair, newOwnerKey, ownerKeyMatches } from "../src/keys.js";
import { buildPublicLog } from "../src/publiclog.js";

const MK = randomBytes(32).toString("hex");

test("envelope encryption round-trips and is bound to the wallet address", () => {
  const env = encryptSecret(Buffer.from("secret-bytes"), MK, "addrA");
  assert.equal(decryptSecret(env, MK, "addrA").toString(), "secret-bytes");
  assert.throws(() => decryptSecret(env, MK, "addrB"));
  assert.throws(() => decryptSecret(env, randomBytes(32).toString("hex"), "addrA"));
});

test("new wallets store no plaintext key and decrypt to the same address", () => {
  const w = newWallet(MK);
  assert.ok(!JSON.stringify(w).match(/secret/i));
  assert.equal(loadKeypair(w, MK).publicKey.toBase58(), w.address);
});

test("owner keys are stored as hashes only", () => {
  const { key, hash } = newOwnerKey();
  assert.ok(ownerKeyMatches(key, hash));
  assert.ok(!ownerKeyMatches(key + "x", hash));
  assert.notEqual(key, hash);
});

test("the public log never contains key envelopes or owner key hashes", () => {
  const w = newWallet(MK);
  const state = {
    coins: [{ mint: "M", pool: "P", config: "C", name: "N", ticker: "T", description: "d", image: null, job: "cleaner", jobWallet: w, ownerKeyHash: "h".repeat(64),
      createdAt: "", launchTx: "", decimals: 6, supplyRaw: "1", metadataUri: "", ledger: { burnedRaw: "0", paidLamports: "0", workLamports: "0", claimedLamports: "0", potLamports: "0" }, payroll: {} }],
    actions: [{ id: "x", intentId: "secret-intent", kind: "claim" }], rounds: [], halted: null, drafts: { d: {} }, intents: { i: {} },
  };
  const text = JSON.stringify(buildPublicLog(state, { network: "devnet", roundSeconds: 3600 }));
  assert.ok(!text.includes(w.enc.wrapped.ct));
  assert.ok(!text.includes("h".repeat(64)));
  assert.ok(!text.includes("secret-intent"));
  assert.ok(!text.includes("drafts") && !text.includes("intents"));
  assert.ok(text.includes(w.address)); // the job wallet address is public so anyone can audit it
});
