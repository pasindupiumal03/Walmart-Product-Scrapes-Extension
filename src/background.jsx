/**
 * Background Service Worker for Walmart Listing Generator
 * Client-Side Scraping Edition
 */

import { fetchPendingItems, submitProcessedRow } from './controllers/gasController.js';

const STORAGE_KEYS = {
  GAS_ENDPOINT: 'gasEndpoint',
  CURRENT_JOB: 'currentJob',
};

// --- Keep-Alive Logic ---
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "keep-alive") {
    console.log("Keep-alive connection established");
    // We don't need to do anything, just holding the port open helps
    port.onDisconnect.addListener(() => {
      console.log("Keep-alive disconnected");
    });
  }
});

// --- Message Handler ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_GENERATION') {
    // Start processing but don't wait for it to finish to reply
    handleStartGeneration(message.data, sendResponse);
    return true;
  }

  // ... other handlers ...
  if (message.action === 'SAVE_GAS_ENDPOINT') {
    chrome.storage.local.set({ [STORAGE_KEYS.GAS_ENDPOINT]: message.data.gasEndpoint })
      .then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.action === 'GET_GAS_ENDPOINT') {
    chrome.storage.local.get([STORAGE_KEYS.GAS_ENDPOINT])
      .then(res => sendResponse({ success: true, gasEndpoint: res[STORAGE_KEYS.GAS_ENDPOINT] || '' }));
    return true;
  }
});

// --- Core Logic ---

// --- Keep-Alive / Offscreen Logic ---
let creatingOffscreenPromise;
async function createOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;

  if (creatingOffscreenPromise) await creatingOffscreenPromise;
  else {
    creatingOffscreenPromise = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['BLOBS'], // Valid reason that keeps it alive
      justification: 'Keep service worker alive for long-running scraping task',
    });
    await creatingOffscreenPromise;
    creatingOffscreenPromise = null;
  }
}

async function closeOffscreen() {
  if (await chrome.offscreen.hasDocument()) {
    await chrome.offscreen.closeDocument();
  }
}

// Ensure we create offscreen when processing starts
async function handleStartGeneration(data, sendResponse) {
  const { sheetUrl, gasEndpoint } = data;

  try {
    // START KEEP ALIVE
    await createOffscreen();

    // 1. Get Pending Items from Sheet
    console.log('Fetching pending items...');
    const pendingRes = await fetchPendingItems(gasEndpoint, sheetUrl);

    if (!pendingRes.success) {
      sendResponse({ success: false, error: pendingRes.error });
      await closeOffscreen();
      return;
    }

    const items = pendingRes.items;

    if (!items || items.length === 0) {
      sendResponse({ success: true, message: 'No pending items found.' });
      await closeOffscreen();
      return;
    }

    // 2. Respond to Popup immediately
    sendResponse({
      success: true,
      jobId: 'client_process_' + Date.now(),
      message: `Found ${items.length} items. Processing in background...`
    });

    // 3. Process the queue asynchronously
    await processQueue(items, gasEndpoint, sheetUrl);

    // DONE
    await closeOffscreen();

  } catch (error) {
    console.error('Start Generation Error:', error);
    await closeOffscreen();
    try { sendResponse({ success: false, error: error.message }); } catch (e) { }
  }
}

async function processQueue(items, gasEndpoint, sheetUrl) {
  console.log(`Starting queue processing for ${items.length} items.`);

  for (let i = 0; i < items.length; i++) {
    // Refresh offscreen if needed (paranoia check)
    await createOffscreen();

    const item = items[i];
    console.log(`Processing Row ${item.row}: ${item.url}`);

    try {
      // Step A: Client-Side Scrape
      const productData = await scrapeWalmartProduct(item.url);

      // Step B: Send to GAS for AI
      console.log('Sending data to GAS:', productData.name);
      await submitProcessedRow(gasEndpoint, sheetUrl, item.row, productData, item.keywords);

      console.log(`Row ${item.row} DONE`);

    } catch (err) {
      console.error(`Failed Row ${item.row}:`, err);
      // Optional: Report error back to GAS so it's logged in the sheet
      // await submitError(gasEndpoint, sheetUrl, item.row, err.message);
    }

    // Nice-to-have: Random delay to be polite
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
  }

  console.log('Queue processing complete.');
}

async function scrapeWalmartProduct(url) {
  // 1. Fetch HTML
  const response = await fetch(url, {
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5'
    }
  });

  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
  const html = await response.text();

  // Helper to strip HTML tags
  const cleanText = (str) => {
    if (!str) return '';
    return str.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  };

  // 2. Extract Images (Existing Logic)
  const images = [];
  const thumbnailRegex = /data-testid="item-page-vertical-carousel-hero-image-button"[\s\S]*?src="(https:[^"]+)"/g;
  let match;
  while ((match = thumbnailRegex.exec(html)) !== null) {
    if (!images.includes(match[1])) images.push(match[1]);
    if (images.length >= 4) break;
  }

  // 3. Extract Metadata via JSON Blob (Most reliable for Walmart)
  let brand = '', name = '', description = '', shortDescription = '', specifications = [], variants = [];

  // Try extracting from __NEXT_DATA__ if available (common in React apps)
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/);
  if (nextDataMatch && nextDataMatch[1]) {
    try {
      const json = JSON.parse(nextDataMatch[1]);
      const product = json?.props?.pageProps?.initialData?.data?.product || {};

      brand = product.brand || '';
      name = product.name || '';
      shortDescription = cleanText(product.shortDescription || '');
      description = cleanText(product.longDescription || '');

      // Specifications
      if (product.specifications && Array.isArray(product.specifications)) {
        specifications = product.specifications.map(s => `${s.name}: ${s.value}`);
      }

      // Variants (size/color/flavor)
      if (product.variantCriteria && Array.isArray(product.variantCriteria)) {
        variants = product.variantCriteria.map(v => `${v.name}: ${v.variantList ? v.variantList.map(vl => vl.name).join(', ') : ''}`);
      }

    } catch (e) {
      console.warn('JSON extraction failed', e);
    }
  }

  // Fallback Regex Extraction if JSON fails or is empty
  const extract = (r) => (html.match(r) || [])[1] || '';

  if (!brand) brand = extract(/"brand":"(.*?)"/) || extract(/"brand":\{"name":"(.*?)"\}/);
  if (!name) name = extract(/"productName":"(.*?)"/) || extract(/<h1[^>]*>(.*?)<\/h1>/);

  // About / Key Features (often in description or specific section)
  if (!description) {
    const descMatch = html.match(/<div class="dangerous-html mb3">(.*?)<\/div>/s) || html.match(/data-testid="product-description"(.*?)<\/section>/s);
    description = cleanText(descMatch ? descMatch[1] : '');
  }

  // Combine extracted data for the AI context
  const fullContent = `
    Product: ${name}
    Brand: ${brand}
    Short Description: ${shortDescription}
    Long Description: ${description}
    Specifications: ${specifications.join('; ')}
    Variants/Options: ${variants.join('; ')}
  `.trim();

  if (images.length === 0) {
    throw new Error(`No images found with carousel selector.`);
  }

  return {
    brand: brand || 'Unknown Brand',
    name: name || 'Unknown Product',
    size: extract(/"size":"(.*?)"/) || '', // Keep size standalone if needed, or rely on variants
    images: images,
    // Pass the rich text to GAS
    richContext: fullContent
  };
}
