/**
 * Validates Google Sheets URL format
 * Accepts formats:
 * - https://docs.google.com/spreadsheets/d/{id}/edit...
 * - https://docs.google.com/spreadsheets/d/{id}
 */
export function validateGoogleSheetsUrl(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL is required' };
  }

  const pattern = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
  const match = url.match(pattern);

  if (!match) {
    return { 
      valid: false, 
      error: 'Invalid Google Sheets URL format' 
    };
  }

  return { 
    valid: true, 
    spreadsheetId: match[1] 
  };
}

/**
 * Extracts spreadsheet ID from Google Sheets URL
 */
export function extractSpreadsheetId(url) {
  const validation = validateGoogleSheetsUrl(url);
  return validation.valid ? validation.spreadsheetId : null;
}
