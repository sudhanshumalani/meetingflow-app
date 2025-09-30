#!/bin/bash
# Setup script for Render deployment
# Builds whisper.cpp from source and downloads model

set -e

echo "🔧 Setting up Whisper.cpp for Render..."

# Create directories
mkdir -p whisper-bin models

# Build whisper.cpp from source (more reliable than pre-built binaries)
echo "📥 Cloning whisper.cpp repository..."
cd whisper-bin
git clone https://github.com/ggerganov/whisper.cpp.git .
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
