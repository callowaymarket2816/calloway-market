type ImageLookupResult = { url: string; source: "upcitemdb" | "openfoodfacts" | "openproductsfacts" } | null;

async function tryUpcItemDb(upc: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${upc}`);
    if (!res.ok) return null;
    const data = await res.json();
    const item = data.items?.[0];
    if (item && Array.isArray(item.images) && item.images.length > 0) {
      return item.images[0];
    }
    return null;
  } catch (err) {
    console.error(`UPCitemdb lookup failed for ${upc}:`, err);
    return null;
  }
}

// Minimum pixel width to accept a crowdsourced image. Filters out tiny
// thumbnails and obviously low-effort submissions (OFF exposes image
// dimensions via the "images" field, keyed by image id, with "sizes").
const MIN_IMAGE_WIDTH = 400;

async function tryOpenFoodFacts(upc: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${upc}.json?fields=product_name,image_url,image_front_url,images`,
      { headers: { "User-Agent": "CallowayMarketWebsite/1.0 (contact: callowaymarket2816@gmail.com)" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status === 0 || !data.product) return null;

    const imageUrl = data.product.image_front_url || data.product.image_url;
    if (!imageUrl) return null;

    // Quality check: only accept if OFF reports a large-enough front image.
    const images = data.product.images || {};
    const frontEntry = Object.values(images).find((img: any) => img?.sizes?.full) as any;
    const width = frontEntry?.sizes?.full?.w || 0;
    if (width && width < MIN_IMAGE_WIDTH) return null;

    return imageUrl;
  } catch (err) {
    console.error(`Open Food Facts lookup failed for ${upc}:`, err);
    return null;
  }
}

async function tryOpenProductsFacts(upc: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://world.openproductsfacts.org/api/v2/product/${upc}.json?fields=product_name,image_url,image_front_url,images`,
      { headers: { "User-Agent": "CallowayMarketWebsite/1.0 (contact: callowaymarket2816@gmail.com)" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status === 0 || !data.product) return null;

    const imageUrl = data.product.image_front_url || data.product.image_url;
    if (!imageUrl) return null;

    const images = data.product.images || {};
    const frontEntry = Object.values(images).find((img: any) => img?.sizes?.full) as any;
    const width = frontEntry?.sizes?.full?.w || 0;
    if (width && width < MIN_IMAGE_WIDTH) return null;

    return imageUrl;
  } catch (err) {
    console.error(`Open Products Facts lookup failed for ${upc}:`, err);
    return null;
  }
}

async function lookupProductImageByUpc(upc: string): Promise<ImageLookupResult> {
  const fromUpcItemDb = await tryUpcItemDb(upc);
  if (fromUpcItemDb) return { url: fromUpcItemDb, source: "upcitemdb" };

  const fromOFF = await tryOpenFoodFacts(upc);
  if (fromOFF) return { url: fromOFF, source: "openfoodfacts" };

  const fromOPF = await tryOpenProductsFacts(upc);
  if (fromOPF) return { url: fromOPF, source: "openproductsfacts" };

  return null;
}
