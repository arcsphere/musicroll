// Anonymous, cookie-free usage stats via Umami Cloud.
// Paste the website ID from Umami (Settings → Websites → musiciate.com) below to turn it on.
// Nothing the user types is ever sent: only event names and a small category.

export const UMAMI_WEBSITE_ID = "";

export function initAnalytics() {
  if (!UMAMI_WEBSITE_ID) return;
  const s = document.createElement("script");
  s.defer = true;
  s.src = "https://cloud.umami.is/script.js";
  s.dataset.websiteId = UMAMI_WEBSITE_ID;
  s.dataset.domains = "musiciate.com,www.musiciate.com"; // ignore local/preview traffic
  s.dataset.excludeSearch = "true"; // ?s= holds the song (and the user's text), never send it
  s.dataset.doNotTrack = "true";
  document.head.append(s);
}

export function track(name, data) {
  try { window.umami?.track(name, data); } catch {}
}
