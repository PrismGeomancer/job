// Wallet keys. Envelope encryption: each secret gets its own random data key (AES-256-GCM),
// and the data key is wrapped with the master key from the environment. Keys never leave the server.
import { randomBytes, createCipheriv, createDecipheriv, createHash, timingSafeEqual } from "node:crypto";
import { Keypair } from "@solana/web3.js";

function masterKeyBytes(masterKeyHex) {
  if (!/^[0-9a-f]{64}$/i.test(masterKeyHex || "")) throw new Error("MASTER_KEY must be 64 hex chars (32 bytes)");
  return Buffer.from(masterKeyHex, "hex");
}

function seal(key, plaintext, aad) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plaintext), c.final()]);
  return { iv: iv.toString("base64"), ct: ct.toString("base64"), tag: c.getAuthTag().toString("base64") };
}

function open(key, box, aad) {
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(box.iv, "base64"));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(Buffer.from(box.tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(box.ct, "base64")), d.final()]);
}

// aad binds the ciphertext to the wallet's public address, so boxes can't be swapped between wallets.
export function encryptSecret(secret, masterKeyHex, aad) {
  const mk = masterKeyBytes(masterKeyHex);
  const dek = randomBytes(32);
  const data = seal(dek, Buffer.from(secret), aad);
  const wrapped = seal(mk, dek, `dek:${aad}`);
  dek.fill(0);
  return { v: 1, alg: "aes-256-gcm", data, wrapped };
}

export function decryptSecret(envelope, masterKeyHex, aad) {
  const mk = masterKeyBytes(masterKeyHex);
  const dek = open(mk, envelope.wrapped, `dek:${aad}`);
  try {
    return open(dek, envelope.data, aad);
  } finally {
    dek.fill(0);
  }
}

export function newWallet(masterKeyHex) {
  const kp = Keypair.generate();
  const address = kp.publicKey.toBase58();
  const enc = encryptSecret(kp.secretKey, masterKeyHex, address);
  kp.secretKey.fill(0);
  return { address, enc };
}

export function loadKeypair(wallet, masterKeyHex) {
  const secret = decryptSecret(wallet.enc, masterKeyHex, wallet.address);
  const kp = Keypair.fromSecretKey(new Uint8Array(secret));
  secret.fill(0);
  if (kp.publicKey.toBase58() !== wallet.address) throw new Error("keys: decrypted key does not match address");
  return kp;
}

// Owner keys: shown once, stored only as a hash.
export function newOwnerKey() {
  const key = "jobk_" + randomBytes(24).toString("base64url");
  return { key, hash: hashOwnerKey(key) };
}
export function hashOwnerKey(key) {
  return createHash("sha256").update(String(key)).digest("hex");
}
export function ownerKeyMatches(key, hash) {
  const a = Buffer.from(hashOwnerKey(key), "hex");
  const b = Buffer.from(String(hash), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
