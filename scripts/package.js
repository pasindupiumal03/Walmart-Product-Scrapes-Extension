const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const packageExtension = () => {
  const distPath = path.join(__dirname, '..', 'dist');
  const outputPath = path.join(__dirname, '..', 'extension.zip');

  if (!fs.existsSync(distPath)) {
    console.error('❌ Build directory not found. Run "npm run build" first.');
    process.exit(1);
  }

  const output = fs.createWriteStream(outputPath);
  const archive = archiver('zip', {
    zlib: { level: 9 } // Maximum compression
  });

  output.on('close', () => {
    console.log('✅ Extension packaged successfully!');
    console.log(`📦 Package size: ${(archive.pointer() / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📍 Location: ${outputPath}`);
  });

  archive.on('error', (err) => {
    console.error('❌ Error creating package:', err);
    process.exit(1);
  });

  archive.pipe(output);
  archive.directory(distPath, false);
  archive.finalize();
};

if (require.main === module) {
  packageExtension();
}

module.exports = packageExtension;