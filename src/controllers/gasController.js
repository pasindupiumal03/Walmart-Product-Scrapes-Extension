/**
 * Google Apps Script API Controller
 * Handles all communication with the GAS backend
 */

/**
 * Initiates the listing generation job via Google Apps Script
 * In the new flow, this just kicks off the background process
 */
export async function startListingGeneration(sheetUrl, gasEndpoint) {
  // We keep this signature for compatibility with popup.jsx, 
  // but logically we just need to verify endpoints.
  return { success: true, jobId: 'client_side_' + Date.now() };
}

/**
 * Validates the GAS endpoint URL format
 */
export function validateGasEndpoint(url) {
  if (!url || typeof url !== 'string') return false;
  return /^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(url);
}

/**
 * Fetches the list of pending items (rows not marked DONE) from the Sheet
 */
export async function fetchPendingItems(gasEndpoint, sheetUrl) {
  try {
    const response = await fetch(gasEndpoint, {
      method: 'POST',
      body: JSON.stringify({
        action: 'GET_PENDING',
        sheetUrl: sheetUrl
      })
    });
    return await response.json();
  } catch (error) {
    console.error('Error fetching pending items:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Submits the scraped data for a single row to GAS for AI processing
 */
export async function submitProcessedRow(gasEndpoint, sheetUrl, row, productData, keywords) {
  try {
    const response = await fetch(gasEndpoint, {
      method: 'POST',
      body: JSON.stringify({
        action: 'PROCESS_ROW',
        sheetUrl: sheetUrl,
        row: row,
        productData: productData,
        keywords: keywords
      })
    });
    return await response.json();
  } catch (error) {
    console.error('Error submitting row:', error);
    return { success: false, error: error.message };
  }
}

// Deprecated/Stubbed methods to prevent build errors in popup.jsx
export async function checkJobStatus(jobId, gasEndpoint) {
  return { status: 'PROCESSING' };
}
export async function pollJobStatus(jobId, gasEndpoint, onProgress) {
  // Start the background process? 
  // For now, allow popup to think it's polling, but status updates will come via storage
  return { success: true };
}
