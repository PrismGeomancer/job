import { imageUrl } from "../../site/js/shared/image-url.js";
export { imageUrl };

export async function downloadImage(url, { timeoutMs = 45_000 } = {}) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "";
    if (!/^image\/(png|jpeg|webp)/.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000 || buf.length > 4_000_000) return null;
    return { buf, ext: type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg" };
  } catch {
    return null;
  }
}
