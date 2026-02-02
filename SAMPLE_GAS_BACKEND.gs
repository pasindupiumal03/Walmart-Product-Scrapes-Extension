/***********************
 * ONE-TIME SETUP
 ***********************/
function setup() {
  PropertiesService.getScriptProperties().setProperty(
    'OPENAI_KEY',
    'Your KEY'
  );
}

/***********************
 * SYSTEM PROMPT
 ***********************/
const SYSTEM_PROMPT = `
You are an expert Walmart marketplace copywriter.

STRICT RULES – FAILURE MEANS INVALID OUTPUT:

TITLE:
- Max 70 characters
- Structure: Brand + Product Name + Size

BULLETS:
- Exactly 5 bullets
- Max 80 characters per bullet
- NO periods anywhere
- Format: Leading Phrase (2–5 words): Independent clause
- Use "&" instead of "and" in leading phrase only

DESCRIPTION:
- Max 1000 characters
- Natural, shopper-friendly flow

LANGUAGE:
- Allowed verbs ONLY: supports, aids, offers support
- FORBIDDEN: promotes, provides, enhances, treats, cures, prevents
- No medical or disease claims

If any flagged term appears, remove it completely.

OUTPUT FORMAT ONLY:
Product Title
Bullet 1
Bullet 2
Bullet 3
Bullet 4
Bullet 5
Product Description
`;

/***********************
 * WEB APP ENTRY POINT
 ***********************/
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    if (action === 'GET_PENDING') {
      const items = getPendingItems(data.sheetUrl);
      return json({ success: true, items: items });
    }

    if (action === 'PROCESS_ROW') {
      const result = processRowWithData(data.sheetUrl, data.row, data.productData, data.keywords);
      return json({ success: true, result: result });
    }
    
    // Legacy/Batch mode (Optional, if you still want to try server-side)
    if (action === 'START_GENERATION') {
       const jobId = 'job_' + Date.now();
       // In this new flow, we just acknowledge. The extension should drive the process.
       return json({ success: true, jobId: jobId, message: "Use Client-Side flow" });
    }

    return json({ success: false, error: 'Unknown action' });

  } catch (err) {
    return json({
      success: false,
      error: err.message,
      stack: err.stack
    });
  }
}

function doGet() {
  return json({
    success: false,
    message: 'This endpoint expects a POST request'
  });
}

/***********************
 * MAIN WORKFLOW
 ***********************/
function getPendingItems(sheetUrl) {
  const ss = sheetUrl ? SpreadsheetApp.openByUrl(sheetUrl) : SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName('Products');
  if (!sheet) throw new Error('Sheet "Products" not found');
  
  const rows = sheet.getDataRange().getValues();
  const pending = [];
  
  // Start from row 2 (index 1) to skip header
  for (let i = 1; i < rows.length; i++) {
    const [url, keywords, title, bullets, desc, status] = rows[i];
    // If URL exists AND it's not marked DONE
    if (url && status !== 'DONE') {
      pending.push({
        row: i + 1, // 1-based row index for updating later
        url: url,
        keywords: keywords
      });
    }
  }
  return pending;
}

function processRowWithData(sheetUrl, rowNumber, productData, keywords) {
  const ss = sheetUrl ? SpreadsheetApp.openByUrl(sheetUrl) : SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName('Products');
  
  // Mark as processing
  sheet.getRange(rowNumber, 6).setValue('AI Generating...');

  try {
    const flaggedTerms = loadFlaggedTerms();
    
    // Call OpenAI with the Client-provided data
    const aiText = callOpenAI(productData, keywords, flaggedTerms);
    const parsed = validate(aiText, flaggedTerms);

    // Write results
    sheet.getRange(rowNumber, 3).setValue(parsed.title);
    sheet.getRange(rowNumber, 4).setValue(parsed.bullets.join('\n'));
    sheet.getRange(rowNumber, 5).setValue(parsed.description);
    sheet.getRange(rowNumber, 6).setValue('DONE');
    
    return { status: 'DONE', title: parsed.title };

  } catch (err) {
    sheet.getRange(rowNumber, 6).setValue('ERROR: ' + err.message);
    throw err;
  }
}

// Deprecated: Server-side generation 
function generateWalmartListings() {
   throw new Error("Use Client-Side scraping flow");
}

/***********************
 * LOAD FLAGGED TERMS (FIXED)
 ***********************/
function loadFlaggedTerms() {
  const flaggedSS = SpreadsheetApp.openById(
    '1INqdThdA06EpzqUCyX3gbFmp1_ElvtZ50HFWVbauCDg'
  );

  const sheet = flaggedSS.getSheets()[0];

  return sheet
    .getRange('A:A')
    .getValues()
    .flat()
    .filter(v => typeof v === 'string' && v.trim() !== '')
    .map(v => v.trim().toLowerCase());
}

/***********************
 * WALMART SCRAPER
 ***********************/
function fetchWalmartData(url) {
  let html = '';
  try {
    html = UrlFetchApp.fetch(url, {
      followRedirects: true,
      muteHttpExceptions: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    }).getContentText();
  } catch (e) {
    console.warn('Primary fetch failed', e);
  }

  const extract = (raw, r) => (raw.match(r) || [])[1] || '';
  
  // Helper to extract images from HTML
  const extractImages = (htmlContent) => {
    let imgs = [];
    
    // 1️⃣ User Targeted Extraction (Thumbnails from Carousel)
    const thumbnailRegex = /data-testid="item-page-vertical-carousel-hero-image-button"[\s\S]*?src="(https:[^"]+)"/g;
    let match;
    while ((match = thumbnailRegex.exec(htmlContent)) !== null) {
        if (!imgs.includes(match[1])) imgs.push(match[1]);
        if (imgs.length >= 4) break; 
    }

    // 2️⃣ Fallback: JSON blob (imageInfo)
    if (imgs.length === 0) {
      const imgInfoMatch = htmlContent.match(/"imageInfo":(\[.*?\])/);
      if (imgInfoMatch) {
        try {
          imgs = JSON.parse(imgInfoMatch[1]).map(i => i.thumbnailUrl);
        } catch (_) {}
      }
    }

    // 3️⃣ Fallback: imageUrl pattern
    if (imgs.length === 0) {
      const imgUrlMatch = htmlContent.match(/"imageUrl":"(https:[^"]+)"/g);
      if (imgUrlMatch) {
        imgs = imgUrlMatch.map(i => i.replace(/"imageUrl":"|"/g, '')).slice(0, 4);
      }
    }
    
    // 4️⃣ Fallback: primaryImageUrl
    if (imgs.length === 0) {
      const primaryMatch = htmlContent.match(/"primaryImageUrl":"(https:[^"]+)"/);
      if (primaryMatch) imgs = [primaryMatch[1]];
    }

    // 5️⃣ Fallback: OG Image
    if (imgs.length === 0) {
      const ogMatch = htmlContent.match(/property="og:image" content="(https:[^"]+)"/);
      if (ogMatch) imgs = [ogMatch[1]];
    }
    
    return [...new Set(imgs)].slice(0, 4);
  };

  let images = extractImages(html);

  // ⚠️ RELOAD STRATEGY: Try Google Cache if blocked
  if (images.length === 0) {
    console.log('Blocked by Walmart? Trying Google Cache...');
    try {
      const cacheUrl = 'http://webcache.googleusercontent.com/search?q=cache:' + encodeURIComponent(url);
      const cacheHtml = UrlFetchApp.fetch(cacheUrl, {
        muteHttpExceptions: true,
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
        }
      }).getContentText();
      
      images = extractImages(cacheHtml);
      if (images.length > 0) {
          html = cacheHtml; // Use cache HTML for other extractions
      }
    } catch (e) {
      console.warn('Cache fetch failed', e);
    }
  }

  if (images.length === 0) {
    // Return a specific error with HTML preview (first 100 chars) to debug
    const preview = html.substring(0, 200).replace(/\n/g, ' ');
    throw new Error(`Images not found. HTML Preview: ${preview}...`);
  }

  return {
    brand: extract(html, /"brand":"(.*?)"/),
    name: extract(html, /"productName":"(.*?)"/),
    size: extract(html, /"size":"(.*?)"/),
    images: images
  };
}


/***********************
 * OPENAI CALL
 ***********************/
function callOpenAI(product, keywords, flaggedTerms) {
  const key = PropertiesService.getScriptProperties().getProperty('OPENAI_KEY');
  if (!key) throw new Error('OpenAI API key not set');

  // Construct message with images for Vision model
  const userContent = [
    {
      type: "text",
      text: `Brand: ${product.brand}\nProduct Name: ${product.name}\nSize: ${product.size}\nKeywords: ${keywords}\nFlagged Terms: ${flaggedTerms.join(', ')}`
    }
  ];

  // Add images to payload
  product.images.forEach(url => {
    userContent.push({
      type: "image_url",
      image_url: {
        url: url
      }
    });
  });

  const payload = {
    model: 'gpt-4o', // Using GPT-4o for best text+vision performance
    temperature: 0.3,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent }
    ]
  };

  const res = UrlFetchApp.fetch(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + key
      },
      payload: JSON.stringify(payload)
    }
  );

  const responseJson = JSON.parse(res.getContentText());
  if (responseJson.error) {
    throw new Error('OpenAI Error: ' + responseJson.error.message);
  }
  return responseJson.choices[0].message.content;
}

/***********************
 * VALIDATION
 ***********************/
function validate(text, flaggedTerms) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  if (lines.length < 7) throw new Error('Incomplete AI output');

  const title = lines[0];
  const bullets = lines.slice(1, 6);
  const description = lines.slice(6).join(' ');

  if (title.length > 70) throw new Error('Title too long');
  if (bullets.length !== 5) throw new Error('Must have exactly 5 bullets');

  bullets.forEach(b => {
    if (b.length > 80) throw new Error('Bullet too long');
    if (b.includes('.')) throw new Error('Period found in bullet');
    if (!b.includes(':')) throw new Error('Bullet missing colon');
  });

  if (description.length > 1000) {
    throw new Error('Description too long');
  }

  const combined = (title + bullets.join(' ') + description).toLowerCase();
  flaggedTerms.forEach(t => {
    if (combined.includes(t)) {
      throw new Error('Flagged term detected: ' + t);
    }
  });

  return { title, bullets, description };
}

/***********************
 * JSON RESPONSE
 ***********************/
function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
