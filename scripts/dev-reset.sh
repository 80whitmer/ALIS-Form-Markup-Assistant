#!/bin/bash

# Navigate to the project root (one level up from scripts folder)
cd "$(dirname "$0")/.."

echo "🚀 Resetting Database..."
npm run reset-db

echo "✨ Starting Development Server..."
npm run dev
