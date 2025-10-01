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

# Verify binary was built (CMake builds to build/bin/, Makefile to root)
if [ -f "build/bin/main" ]; then
  chmod +x build/bin/main
  # Create symlink at root for easier access
  ln -sf build/bin/main main
  echo "✅ Whisper.cpp built successfully: build/bin/main"
elif [ -f "build/bin/whisper-cli" ]; then
  chmod +x build/bin/whisper-cli
  ln -sf build/bin/whisper-cli main
  echo "✅ Whisper.cpp built successfully: build/bin/whisper-cli"
elif [ -f "bin/main" ]; then
  chmod +x bin/main
  ln -sf bin/main main
  echo "✅ Whisper.cpp built successfully: bin/main"
elif [ -f "main" ]; then
  chmod +x main
  echo "✅ Whisper.cpp built successfully: main"
else
  echo "❌ Failed to build whisper.cpp binary"
  echo "Checking build directories..."
  ls -la build/bin/ 2>/dev/null || echo "build/bin/ not found"
  ls -la bin/ 2>/dev/null || echo "bin/ not found"
  ls -la | grep main || echo "No main binary in root"
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
