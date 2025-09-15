#!/bin/bash

# MeetingFlow GitHub Pages Deployment Script
echo "🚀 Preparing MeetingFlow for GitHub Pages deployment..."

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "❌ Error: Not in a git repository. Please initialize git first."
    exit 1
fi

# Check if there are uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo "📝 Uncommitted changes found. Staging and committing..."
    git add .
    echo "Enter commit message (or press Enter for default):"
    read commit_message
    if [ -z "$commit_message" ]; then
        commit_message="Deploy MeetingFlow to GitHub Pages 🚀"
    fi
    git commit -m "$commit_message"
fi

# Push to main branch to trigger deployment
echo "🔄 Pushing to main branch..."
git push origin main

echo "✅ Deployment initiated!"
echo "📱 Your app will be available at: https://[your-username].github.io/meetingflow-app/"
echo "⏱️  Deployment typically takes 2-5 minutes."
echo "🔧 Don't forget to update your N8N webhook URLs in .env.production"

