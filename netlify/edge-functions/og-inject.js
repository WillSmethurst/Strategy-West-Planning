// netlify/edge-functions/og-inject.js
// Injects per-post Open Graph tags into /insights/* pages server-side,
// so social crawlers (which do not run JS) see the correct title,
// description, and image for each blog post.

const PROJECT_ID  = "0ziwk9hm";
const DATASET     = "production";
const API_VERSION = "2023-05-03";
const SITE_ORIGIN = "https://strategywestplanning.com";

const QUERY =
  `*[_type == "blogPost" && slug.current == $slug][0]{title, excerpt, "imageUrl": mainImage.asset->url}`;

function imgParams(url, width) {
  if (!url) return "";
  const sep = url.indexOf("?") === -1 ? "?" : "&";
  return url + sep + "w=" + width + "&auto=format&fit=max&q=80";
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setMetaById(html, id, value) {
  const re = new RegExp(`(<meta\\b[^>]*\\bid="${id}"[^>]*>)`);
  return html.replace(re, (tag) => {
    if (/content="[^"]*"/.test(tag)) {
      return tag.replace(/content="[^"]*"/, `content="${value}"`);
    }
    return tag.replace(/<meta/, `<meta content="${value}"`);
  });
}

export default async function handler(request, context) {
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/insights\/([^\/]+)\/?$/);
  if (!m) return context.next();
  const slug = decodeURIComponent(m[1]);

  const response = await context.next();
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;

  let post = null;
  try {
    const endpoint =
      `https://${PROJECT_ID}.apicdn.sanity.io/v${API_VERSION}/data/query/${DATASET}` +
      `?query=${encodeURIComponent(QUERY)}` +
      `&$slug=${encodeURIComponent(JSON.stringify(slug))}`;
    const r = await fetch(endpoint);
    if (r.ok) {
      const data = await r.json();
      post = data.result || null;
    }
  } catch (_e) {
    post = null;
  }

  if (!post) return response;

  const title    = post.title || "Insight";
  const excerpt  = post.excerpt || "";
  const image    = imgParams(post.imageUrl, 1200);
  const canonical = `${SITE_ORIGIN}/insights/${slug}`;

  let html = await response.text();

  html = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${esc(title)} | Strategy West Planning</title>`
  );

  html = setMetaById(html, "metaDescription", esc(excerpt));
  html = setMetaById(html, "ogTitle", esc(title));
  html = setMetaById(html, "ogDescription", esc(excerpt));
  if (image) html = setMetaById(html, "ogImage", esc(image));

  html = html.replace(
    /(<meta\s+property="og:site_name"[^>]*>)/,
    `$1\n  <meta property="og:url" content="${esc(canonical)}" />`
  );

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");

  return new Response(html, { status: 200, headers });
}

export const config = { path: "/insights/*" };
