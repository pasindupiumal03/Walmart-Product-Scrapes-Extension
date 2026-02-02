const fs = require('fs');
const path = require('path');

const checkExtension = () => {
  const distPath = path.join(__dirname, '..', 'dist');
  const manifestPath = path.join(distPath, 'manifest.json');

  console.log('🔍 Chrome Extension Health Check');
  console.log('================================');

  // Check if build exists
  if (!fs.existsSync(distPath)) {
    console.log('❌ No build found. Run "npm run build" or "npm run dev" first.');
    return false;
  }

  console.log('✅ Build directory exists');

  // Check essential files
  const essentialFiles = [
    'manifest.json',
    'popup.html',
    'popup.js',
    'content.js',
    'background.js'
  ];

  const missingFiles = essentialFiles.filter(file => 
    !fs.existsSync(path.join(distPath, file))
  );

  if (missingFiles.length > 0) {
    console.log('❌ Missing essential files:', missingFiles.join(', '));
    return false;
  }

  console.log('✅ All essential files present');

  // Check manifest.json
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    console.log('✅ Manifest.json is valid JSON');
    console.log(`📋 Extension: ${manifest.name} v${manifest.version}`);
    console.log(`🔖 Manifest version: ${manifest.manifest_version}`);
  } catch (error) {
    console.log('❌ Manifest.json is invalid:', error.message);
    return false;
  }

  console.log('');
  console.log('🎉 Extension is ready to load in Chrome!');
  console.log('');
  console.log('📝 Next steps:');
  console.log('1. Open Chrome and go to chrome://extensions/');
  console.log('2. Enable "Developer mode"');
  console.log('3. Click "Load unpacked"');
  console.log(`4. Select the "dist" folder: ${distPath}`);

  return true;
};

if (require.main === module) {
  checkExtension();
}

module.exports = checkExtension;