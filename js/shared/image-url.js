// Coin image URLs from Pollinations (free, no key). Shared by the server and the site.
const STYLE = "flat vector logo, pure black background, white shapes, one muted yellow #E8D96A accent, thick uniform outlines, no text, no gradients, no glow, no 3D";

export function imageUrl(prompt, seed) {
  const p = encodeURIComponent(`${prompt}. ${STYLE}`);
  return `https://image.pollinations.ai/prompt/${p}?width=512&height=512&nologo=true&seed=${seed}`;
}

