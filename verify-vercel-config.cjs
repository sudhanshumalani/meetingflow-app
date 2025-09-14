#!/usr/bin/env node

// Vercel Configuration Verification Script
const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying Vercel Configuration...\n');

// Check vercel.json exists
const vercelConfigPath = path.join(__dirname, 'vercel.json');
if (fs.existsSync(vercelConfigPath)) {
  console.log('✅ vercel.json exists');

  try {
    const config = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));
    console.log(`✅ vercel.json is valid JSON`);
    console.log(`✅ Build command: ${config.buildCommand}`);
    console.log(`✅ Output directory: ${config.outputDirectory}`);
    console.log(`✅ Framework: ${config.framework}`);
    console.log(`✅ Regions configured: ${config.regions?.length || 0}`);
  } catch (error) {
    console.log('❌ vercel.json has invalid JSON syntax');
    console.error(error.message);
  }
} else {
  console.log('❌ vercel.json not found');
}

// Check package.json scripts
const packageJsonPath = path.join(__dirname, 'package.json');
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const scripts = packageJson.scripts;

  console.log('\n📦 Package Scripts:');
  if (scripts['build:vercel']) {
    console.log('✅ build:vercel script exists');
  } else {
    console.log('❌ build:vercel script missing');
  }

  if (scripts['deploy:vercel']) {
    console.log('✅ deploy:vercel script exists');
  } else {
    console.log('❌ deploy:vercel script missing');
  }
}

// Check dist folder after build
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  console.log('\n📁 Build Output:');
  console.log('✅ dist folder exists');

  const requiredFiles = ['index.html', 'manifest.webmanifest', 'sw.js'];
  requiredFiles.forEach(file => {
    if (fs.existsSync(path.join(distPath, file))) {
      console.log(`✅ ${file} exists`);
    } else {
      console.log(`❌ ${file} missing`);
    }
  });

  const assetsPath = path.join(distPath, 'assets');
  if (fs.existsSync(assetsPath)) {
    const assetFiles = fs.readdirSync(assetsPath);
    console.log(`✅ ${assetFiles.length} asset files generated`);
  }
} else {
  console.log('\n📁 Build Output:');
  console.log('⚠️  dist folder not found - run npm run build:vercel first');
}

console.log('\n🚀 Vercel Configuration Verification Complete!');
console.log('\nTo deploy to Vercel:');
console.log('1. npm run build:vercel');
console.log('2. vercel --prod');
console.log('3. Or connect Git repo at vercel.com');