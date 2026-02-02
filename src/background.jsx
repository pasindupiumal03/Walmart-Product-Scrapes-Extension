/**
 * Background Service Worker for Walmart Listing Generator
 * Client-Side Scraping Edition
 */

import { fetchPendingItems, submitProcessedRow } from './controllers/gasController.js';

const STORAGE_KEYS = {
  GAS_ENDPOINT: 'gasEndpoint',
  CURRENT_JOB: 'currentJob',
};

// --- Message Handler ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_GENERATION') {
    handleStartGeneration(message.data, sendResponse);
    return true; // Async response
  }

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

async function handleStartGeneration(data, sendResponse) {
  const { sheetUrl, gasEndpoint } = data;

  try {
    // 1. Get Pending Items from Sheet
    console.log('Fetching pending items...');
    const pendingRes = await fetchPendingItems(gasEndpoint, sheetUrl);

    if (!pendingRes.success) {
      sendResponse({ success: false, error: pendingRes.error });
      return;
    }

    const items = pendingRes.items;

    if (!items || items.length === 0) {
      sendResponse({ success: true, message: 'No pending items found.' });
      return;
    }

    // 2. Respond to Popup immediately so it doesn't timeout
    sendResponse({
      success: true,
      jobId: 'client_process_' + Date.now(),
      message: `Found ${items.length} items. Processing in background...`
    });

    // 3. Process the queue asynchronously
    processQueue(items, gasEndpoint, sheetUrl);

  } catch (error) {
    console.error('Start Generation Error:', error);
    // If we haven't sent a response yet, send one
    try { sendResponse({ success: false, error: error.message }); } catch (e) { }
  }
}

async function processQueue(items, gasEndpoint, sheetUrl) {
  console.log(`Starting queue processing for ${items.length} items.`);

  for (let i = 0; i < items.length; i++) {
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

  // 2. Extract Images (User's Regex)
  const images = [];
  const thumbnailRegex = /data-testid="item-page-vertical-carousel-hero-image-button"[\s\S]*?src="(https:[^"]+)"/g;
  let match;
  while ((match = thumbnailRegex.exec(html)) !== null) {
    if (!images.includes(match[1])) {
      images.push(match[1]);
    }
    if (images.length >= 4) break;
  }

  // 3. Extract Metadata (Regex)
  const extract = (r) => (html.match(r) || [])[1] || '';

  const brand = extract(/"brand":"(.*?)"/) || extract(/"brand":\{"name":"(.*?)"\}/);
  const name = extract(/"productName":"(.*?)"/) || extract(/<h1[^>]*>(.*?)<\/h1>/);
  const size = extract(/"size":"(.*?)"/);

  if (images.length === 0) {
    // Fallback strategies could go here, but starting with the user's requirement
    throw new Error(`No images found with carousel selector.`);
  }

  return {
    brand: brand || 'Unknown Brand',
    name: name || 'Unknown Product',
    size: size || '',
    images: images
  };
}
