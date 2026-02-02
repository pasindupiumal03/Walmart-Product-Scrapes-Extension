# Walmart Listing Generator - Chrome Extension

A production-ready Chrome Extension (Manifest V3) built with React that automates Walmart product listing generation using Google Sheets and OpenAI via Google Apps Script.

## 🎯 Overview

This extension streamlines the process of creating optimized Walmart product listings by:
- Reading product URLs and keywords from Google Sheets
- Fetching product data from Walmart
- Generating SEO-optimized titles, bullets, and descriptions via OpenAI
- Writing results back to Google Sheets
- Providing real-time progress tracking

**Key Architecture Decision:** All OpenAI API calls happen in Google Apps Script (GAS), never in the extension. This ensures API key security and easier maintenance.

## ✨ Features

- ⚛️ **React 18** - Modern React with hooks
- 🎨 **TailwindCSS** - Clean, minimal UI
- 📦 **Webpack 5** - Optimized bundling
- 🔒 **Manifest V3** - Latest Chrome extension API
- 🔐 **Security First** - No API keys in extension
- 📊 **Real-time Progress** - Row-by-row status updates
- ⚡ **Polling System** - Auto-check status every 5 seconds
- 🎯 **Error Handling** - Graceful error recovery
- 💾 **Persistent Storage** - Saves GAS endpoint

## 🏗️ Architecture

```
┌─────────────────┐
│  React Popup    │ (User Interface)
│   - Input form  │
│   - Status log  │
└────────┬────────┘
         │
         │ chrome.runtime.sendMessage
         │
┌────────▼────────────┐
│ Background Worker   │ (Messaging Layer)
│  - Message routing  │
│  - Fetch API calls  │
└────────┬────────────┘
         │
         │ HTTPS POST/GET
         │
┌────────▼─────────────┐
│ Google Apps Script   │ (Backend)
│  - Read Google Sheet │
│  - Fetch Walmart data│
│  - Call OpenAI API   │
│  - Write results     │
└──────────────────────┘
```

## 📂 Project Structure

```
├── public/
│   └── manifest.json          # Manifest V3 configuration
├── src/
│   ├── popup.jsx             # Main UI component
│   ├── popup.html            # Popup HTML
│   ├── background.jsx        # Service worker
│   ├── index.css             # Styles
│   ├── controllers/
│   │   ├── gasController.js      # GAS API wrapper
│   │   └── storageController.js  # Chrome storage
│   └── utils/
│       ├── validators.js     # Input validation
│       └── browser.js        # Browser compatibility
├── GAS_API_CONTRACT.md       # Backend API documentation
└── package.json              # Dependencies
```

## 🚀 Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Google Apps Script Web App (deployed)
- Google Sheets with proper structure

### Installation

1. **Clone the repository**
   ```bash
   cd Walmart
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Build the extension**
   ```bash
   # Development build with watch mode
   npm run dev

   # Production build (optimized)
   npm run build
   ```

4. **Load in Chrome**
   - Open `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the `dist` folder

## 📖 How to Use

### Step 1: Set Up Google Sheet

Create a Google Sheet with this structure:

**Sheet: "Products"**
| Column A | Column B | Column C | Column D | Column E | Column F |
|----------|----------|----------|----------|----------|----------|
| Walmart URL | Keywords | Title | Bullets | Description | Status |

**Sheet: "FlaggedTerms"**
| Column A |
|----------|
| fake |
| counterfeit |
| replica |

See [GAS_API_CONTRACT.md](GAS_API_CONTRACT.md) for detailed sheet structure.

### Step 2: Configure GAS Endpoint

1. Deploy your Google Apps Script as a Web App
2. Copy the deployment URL (format: `https://script.google.com/macros/s/.../exec`)
3. Open the extension popup
4. Paste your GAS endpoint URL
5. Extension will save it for future use

### Step 3: Generate Listings

1. Paste your Google Sheets URL
2. Click "Generate Listings"
3. Watch real-time progress:
   - Current row being processed
   - Success/error status per row
   - Overall progress bar
4. Check your Google Sheet for results

## 🔧 Configuration

### manifest.json
Key permissions configured:
- `storage` - Save GAS endpoint
- `activeTab` - Access current tab
- `host_permissions` - Call Google APIs

### Environment Variables
No environment variables needed! All secrets stay in GAS.

## 🏗️ Development

### Project Components

#### 1. Popup UI ([popup.jsx](src/popup.jsx))
- Input fields for Sheet URL and GAS endpoint
- Generate button with disabled state
- Real-time progress display
- Status log with timestamps
- Error handling UI

#### 2. Background Service Worker ([background.jsx](src/background.jsx))
- Handles chrome.runtime.sendMessage
- Makes fetch calls to GAS endpoint
- Manages Chrome storage
- No business logic (all in GAS)

#### 3. GAS Controller ([gasController.js](src/controllers/gasController.js))
- `startListingGeneration()` - Initiates job
- `checkJobStatus()` - Polls status
- `pollJobStatus()` - Auto-polling with callback
- `validateGasEndpoint()` - URL validation

#### 4. Validators ([validators.js](src/utils/validators.js))
- `validateGoogleSheetsUrl()` - Sheet URL validation
- `extractSpreadsheetId()` - Extract ID from URL

### Adding Features

**Add a new API call:**
```javascript
// In gasController.js
export async function newApiCall(params, gasEndpoint) {
  const response = await fetch(gasEndpoint, {
    method: 'POST',
    body: JSON.stringify({ action: 'NEW_ACTION', ...params })
  });
  return await response.json();
}
```

**Add a new message handler:**
```javascript
// In background.jsx
case 'NEW_ACTION':
  await handleNewAction(message.data, sendResponse);
  break;
```

## 🧪 Testing

### Manual Testing Checklist
- [ ] Valid Google Sheets URL accepted
- [ ] Invalid URLs rejected with error message
- [ ] GAS endpoint saves correctly
- [ ] Generation starts and polls status
- [ ] Progress updates in real-time
- [ ] Logs display correctly
- [ ] Error states handled gracefully
- [ ] Button disables during generation
- [ ] Reset button clears state

### Mock GAS Response
For testing without GAS backend, modify [background.jsx](src/background.jsx):
```javascript
// Mock response for testing
if (gasEndpoint.includes('mock')) {
  sendResponse({
    success: true,
    jobId: 'test_' + Date.now()
  });
  return;
}
```

## 🔐 Security

### What's Safe
✅ All OpenAI API calls in GAS  
✅ No API keys in extension  
✅ HTTPS-only communication  
✅ Input validation before sending  
✅ Chrome storage for non-sensitive data  

### What to Avoid
❌ Never store API keys in extension  
❌ Never call OpenAI from extension  
❌ Never trust user input without validation  
❌ Never expose GAS implementation details  

## 📦 Building for Production

1. **Build optimized bundle**
   ```bash
   npm run build
   ```

2. **Test the production build**
   - Load `dist` folder in Chrome
   - Test all features
   - Check console for errors

3. **Package for Chrome Web Store**
   ```bash
   cd dist
   zip -r ../walmart-listing-generator.zip .
   ```

4. **Upload to Chrome Web Store**
   - Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   - Upload the ZIP file
   - Fill in store listing details
   - Submit for review

## 📚 API Documentation

See [GAS_API_CONTRACT.md](GAS_API_CONTRACT.md) for:
- Complete API endpoint specifications
- Request/response formats
- Google Sheet structure requirements
- GAS implementation guidelines
- Error handling protocols
- Security best practices

## 🐛 Troubleshooting

### Extension won't load
- Check console for syntax errors
- Ensure `dist` folder exists
- Rebuild with `npm run build`

### GAS endpoint not working
- Verify deployment URL is correct
- Check GAS Web App is deployed as "Anyone"
- Test endpoint in Postman/curl first

### Polling stops unexpectedly
- Check network tab for failed requests
- Verify GAS response format matches contract
- Check service worker console (`chrome://serviceworker-internals/`)

### Sheet access denied
- Verify sheet sharing settings
- Ensure GAS has proper OAuth scopes
- Check if sheet URL is correct

## 🎨 Customization

### Change Polling Interval
```javascript
// In popup.jsx, line ~155
const pollInterval = 5000; // Change to desired milliseconds
```

### Modify UI Colors
```css
/* In index.css */
.popup-header {
  background: linear-gradient(135deg, #your-color-1, #your-color-2);
}
```

### Add Custom Validation
```javascript
// In validators.js
export function customValidator(input) {
  // Your validation logic
  return { valid: true/false, error: 'message' };
}
```

## 📄 License

MIT License - feel free to use for commercial projects.

## 🤝 Contributing

This is a production-ready template. Customize as needed for your specific use case.

## 📞 Support

For Google Apps Script backend implementation help, refer to [GAS_API_CONTRACT.md](GAS_API_CONTRACT.md).

## ⚠️ Important Notes

1. **API Keys**: NEVER store OpenAI API keys in the extension
2. **GAS Backend**: You must implement the GAS backend separately
3. **Polling**: Default 5-second interval is optimal for most cases
4. **Rate Limits**: Respect Walmart and OpenAI rate limits in GAS
5. **Testing**: Always test with small batches first

---

**Built with ❤️ for Walmart sellers**

{
  "permissions": ["storage", "activeTab", "tabs"]
}
```

### Icons
Replace icons in `src/assets/icons/` with your own (16px, 32px, 48px, 64px, 128px).

## Browser Compatibility

- ✅ Chrome (Manifest V3)
- ✅ Firefox (with minor adjustments)
- ⚠️ Edge (Chromium-based)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the ISC License.

## Support

For issues and questions, please create an issue in the repository.