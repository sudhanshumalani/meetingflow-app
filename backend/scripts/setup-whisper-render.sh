#!/bin/bash
# Setup script for Render deployment
# Builds whisper.cpp from source and downloads model

set -e

echo "🔧 Setting up Whisper.cpp for Render..."

# Create directories
mkdir -p models

# Clean up and rebuild whisper.cpp from source
echo "📥 Cloning whisper.cpp repository..."
rm -rf whisper-bin
git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git whisper-bin
cd whisper-bin

echo "🔨 Building whisper.cpp..."
make

# Verify binary was built
if [ -f "main" ]; then
  chmod +x main
  echo "✅ Whisper.cpp built successfully: ./main"
else
  echo "❌ Failed to build whisper.cpp binary"
  exit 1
fi

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
