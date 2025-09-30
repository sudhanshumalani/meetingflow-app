const https = require('https');
const fs = require('fs');
const path = require('path');

const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin';
const MODEL_DIR = path.join(__dirname, '../models');
const MODEL_PATH = path.join(MODEL_DIR, 'ggml-base.en.bin');

console.log('=================================================');
console.log('📥 Downloading Whisper Model');
console.log('=================================================');

// Check if model already exists
if (fs.existsSync(MODEL_PATH)) {
  const stats = fs.statSync(MODEL_PATH);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`✓ Model already exists: ${MODEL_PATH} (${sizeMB} MB)`);
  console.log('Skipping download.');
  process.exit(0);
}

// Create models directory
if (!fs.existsSync(MODEL_DIR)) {
  fs.mkdirSync(MODEL_DIR, { recursive: true });
  console.log(`✓ Created directory: ${MODEL_DIR}`);
}

console.log(`Downloading from: ${MODEL_URL}`);
console.log(`Saving to: ${MODEL_PATH}`);
console.log('This may take a few minutes...\n');

const file = fs.createWriteStream(MODEL_PATH);
let downloadedBytes = 0;

https.get(MODEL_URL, (response) => {
  // Handle redirects
  if (response.statusCode === 302 || response.statusCode === 301) {
    console.log('Following redirect...');
    https.get(response.headers.location, handleDownload);
    return;
  }

  handleDownload(response);
});

function handleDownload(response) {
  const totalBytes = parseInt(response.headers['content-length'], 10);
  const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);

  console.log(`Total size: ${totalMB} MB\n`);

  response.on('data', (chunk) => {
    downloadedBytes += chunk.length;
    const downloadedMB = (downloadedBytes / (1024 * 1024)).toFixed(2);
    const progress = ((downloadedBytes / totalBytes) * 100).toFixed(1);

    process.stdout.write(`\rProgress: ${downloadedMB} MB / ${totalMB} MB (${progress}%)`);
  });

  response.pipe(file);

  file.on('finish', () => {
    file.close();
    console.log('\n\n✓ Model downloaded successfully!');
    console.log(`Location: ${MODEL_PATH}`);
    console.log('=================================================');
  });
}

file.on('error', (err) => {
  fs.unlink(MODEL_PATH, () => {});
  console.error('\n❌ Download failed:', err.message);
  process.exit(1);
});
