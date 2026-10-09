// Song-in-the-link sharing: the whole song is compressed into the ?s= query parameter,
// so sharing needs no server or database.

const MAX_PARAM = 12000;

function toB64url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeState(obj) {
  const json = new TextEncoder().encode(JSON.stringify(obj));
  try {
    return "z." + toB64url(await pipe(json, new CompressionStream("deflate-raw")));
  } catch {
    return "j." + toB64url(json);
  }
}

// Returns the decoded object, or null if the parameter is missing or malformed.
export async function decodeState(param) {
  if (!param || param.length > MAX_PARAM) return null;
  try {
    const [kind, data] = [param.slice(0, 2), param.slice(2)];
    let bytes = fromB64url(data);
    if (kind === "z.") bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
    else if (kind !== "j.") return null;
    const obj = JSON.parse(new TextDecoder().decode(bytes));
    return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : null;
  } catch {
    return null;
  }
}

export function shareTargets(url, text) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(text);
  return {
    x: `https://x.com/intent/post?text=${t}&url=${u}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
    email: `mailto:?subject=${encodeURIComponent("A song made from words · musiciate")}&body=${encodeURIComponent(`${text}\n\n${url}`)}`,
  };
}

export async function copyText(text, fallbackInput) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (!fallbackInput) return false;
    fallbackInput.focus();
    fallbackInput.select();
    try { return document.execCommand("copy"); } catch { return false; }
  }
}
