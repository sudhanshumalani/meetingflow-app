#!/bin/bash
# Setup script for Render deployment
# Downloads whisper.cpp binary and model

set -e

echo "🔧 Setting up Whisper.cpp for Render..."

# Create directories
mkdir -p whisper-bin models

# Download whisper.cpp binary for Linux (Render uses Linux)
echo "📥 Downloading whisper.cpp binary..."
cd whisper-bin
curl -L "https://huggingface.co/echogarden/echogarden-packages/resolve/main/whisper.cpp-binaries-linux-x64-cpu-1.5.5-20240403.tar.gz" -o whisper-cpp-linux.tar.gz
tar -xzf whisper-cpp-linux.tar.gz
rm whisper-cpp-linux.tar.gz

# Find the main binary and make it executable
find . -name "main" -type f -exec chmod +x {} \;
BINARY_PATH=$(find . -name "main" -type f | head -1)
echo "✅ Binary found at: $BINARY_PATH"

cd ..

# Download Whisper model
echo "📥 Downloading Whisper model..."
cd models
if [ ! -f "ggml-base.en.bin" ]; then
  curl -L "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin" -o ggml-base.en.bin
  echo "✅ Model downloaded: ggml-base.en.bin"
else
  echo "✅ Model already exists"
fi
cd ..

echo "✅ Whisper.cpp setup complete!"
