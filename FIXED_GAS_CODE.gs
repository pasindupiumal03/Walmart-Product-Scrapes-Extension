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
      // Note: We accept productData from the extension now, so we skip fetchWalmartData
      const result = processRowWithData(data.sheetUrl, data.row, data.productData, data.keywords);
      return json({ success: true, result: result });
    }
    
    // Legacy/Batch mode (Optional)
    if (action === 'START_GENERATION') {
       const jobId = 'job_' + Date.now();
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
    
    // Check if status indicates completion
    const statusStr = String(status || '').trim();
    const isDone = statusStr.toUpperCase().startsWith('DONE');
    
    // Normalize Input: If it's just an ID (digits), convert to URL
    let inputStr = String(url || '').trim();
    if (inputStr && !inputStr.startsWith('http')) {
        inputStr = `https://www.walmart.com/ip/${inputStr}`;
    }

    // If URL/ID exists AND it's not marked DONE
    if (inputStr && !isDone) {
      pending.push({
        row: i + 1, // 1-based row index
        url: inputStr,
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
    
    const finalStatus = parsed.warning ? `DONE (${parsed.warning})` : 'DONE';
    sheet.getRange(rowNumber, 6).setValue(finalStatus);
    
    return { status: finalStatus, title: parsed.title };

  } catch (err) {
    const errorMsg = err.message || '';
    let simpleMsg = 'Failed';

    if (errorMsg.includes('429') || errorMsg.includes('Quota')) {
        simpleMsg = 'Quota Exceeded';
    } else if (errorMsg.includes('API key not set')) {
        simpleMsg = 'API Key Missing';
    } else if (errorMsg.includes('401')) {
        simpleMsg = 'Invalid API Key';
    } 
    // All other errors (Timeout, Image, Parsing) default to 'Failed'
    
    sheet.getRange(rowNumber, 6).setValue(simpleMsg);
    
    // We do NOT re-throw, so the loop continues
    return { status: simpleMsg, error: errorMsg };
  }
}

/***********************
 * LOAD FLAGGED TERMS
 ***********************/
function loadFlaggedTerms() {
  try {
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
  } catch (e) {
    // Fallback if permission issues or missing sheet
    return ["fake", "counterfeit"];
  }
}

/***********************
 * CONFIGURATION
 ***********************/
// PASTE YOUR OPENAI API KEY HERE DIRECTLY:
const OPENAI_API_KEY = 'sk-proj-YOUR_NEW_KEY_HERE'; 

/***********************
 * OPENAI CALL
 ***********************/
function callOpenAI(product, keywords, flaggedTerms) {
  // Use the direct constant or fallback to Properties if constant is placeholder
  let key = OPENAI_API_KEY;
  if (!key || key.includes('YOUR_NEW_KEY')) {
      key = PropertiesService.getScriptProperties().getProperty('OPENAI_KEY');
  }
  
  if (!key) throw new Error('OpenAI API key not set. Please paste it in the OPENAI_API_KEY constant at the top of the script.');

  // Construct message with images for Vision model
  // Use rich context if available, otherwise fallback to basic metadata
  let promptText = '';
  if (product.richContext) {
     promptText = `
${product.richContext}

Target Keywords: ${keywords}
Flagged Terms: ${flaggedTerms.join(', ')}
`;
  } else {
     promptText = `Brand: ${product.brand}\nProduct Name: ${product.name}\nSize: ${product.size}\nKeywords: ${keywords}\nFlagged Terms: ${flaggedTerms.join(', ')}`;
  }

  const userContent = [
    {
      type: "text",
      text: promptText
    }
  ];

  // Add images to payload (GPT-4o Vision or mini)
  if (product.images && Array.isArray(product.images)) {
    product.images.forEach(url => {
      // Clean URL to remove resizing parameters (reduces errors)
      // e.g. .jpeg?odnHeight=117 -> .jpeg
      let cleanUrl = url.split('?')[0];
      
      userContent.push({
        type: "image_url",
        image_url: {
          url: cleanUrl
        }
      });
    });
  }

  const payload = {
    // try gpt-4o-mini first as it is cheaper and has higher limits for some tiers
    model: 'gpt-4o-mini', 
    temperature: 0.3,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent }
    ]
  };

  try {
    const res = UrlFetchApp.fetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'post',
        contentType: 'application/json',
        headers: {
          Authorization: 'Bearer ' + key
        },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true // Capture 429 errors gracefully
      }
    );

    const responseCode = res.getResponseCode();
    const responseText = res.getContentText();
    const responseJson = JSON.parse(responseText);

    if (responseCode !== 200) {
       // Log the key prefix for debugging (first 7 chars)
       const keyPrefix = key.substring(0, 7) + '...';
       throw new Error(`OpenAI Error (${responseCode}) with key ${keyPrefix}: ${responseJson.error?.message || responseText}`);
    }

    return responseJson.choices[0].message.content;

  } catch (e) {
    if (e.message.includes('429')) {
       throw new Error("Quota Exceeded (429). Please check your OpenAI billing settings. You may need to add credit balance.");
    }
    throw e;
  }
}

/***********************
 * VALIDATION
 ***********************/
function validate(text, flaggedTerms) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  if (lines.length < 7) throw new Error('Incomplete AI output');

  let title = lines[0];
  // Remove Markdown bolding from title (**Title**)
  title = title.replace(/^\*\*|\*\*$/g, '').trim();

  const bullets = lines.slice(1, 6);
  let description = lines.slice(6).join(' ');
  
  // Remove "Product Description" header if present
  description = description.replace(/\*\*Product Description\*\*:?/gi, '').trim();
  description = description.replace(/^Product Description:?/gi, '').trim();

  if (title.length > 200) throw new Error('Title too long (Max 200)');
  if (bullets.length !== 5) throw new Error('Must have exactly 5 bullets');

  if (title.length > 75) {
      // Add to warnings instead of failing
      // We will handle this in the warning collection below
  }

  bullets.forEach(b => {
    if (b.length > 80) throw new Error('Bullet too long');
    if (b.includes('.')) throw new Error('Period found in bullet');
    if (!b.includes(':')) throw new Error('Bullet missing colon');
  });

  if (description.length > 1000) {
    throw new Error('Description too long');
  }

  const combined = (title + bullets.join(' ') + description).toLowerCase();
  
  const foundTerms = [];

  if (title.length > 75) {
      foundTerms.push(`Title length (${title.length}) > 75`);
  }

  flaggedTerms.forEach(t => {
    // Escape regex
    const escapedTerm = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedTerm}\\b`, 'i');
    
    if (regex.test(combined)) {
       foundTerms.push(t);
    }
  });

  if (foundTerms.length > 0) {
     // Instead of throwing, we return with a warning property
     return { 
         title, 
         bullets, 
         description, 
         warning: `Flagged: ${foundTerms.join(', ')}` 
     };
  }

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
