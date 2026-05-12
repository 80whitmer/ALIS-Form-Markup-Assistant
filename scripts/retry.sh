#!/bin/bash

# Create the directory just in case it doesn't exist
mkdir -p "$HOME/ALIS Form Markup Assistant/scripts"

# Create the script file
cat << 'EOF' > "$HOME/ALIS Form Markup Assistant/scripts/dev-reset.sh"
#!/bin/bash

# Navigate to the project root (one level up from scripts folder)
cd "$(dirname "$0")/.."

echo "🚀 Resetting Database..."
npm run reset-db

echo "✨ Starting Development Server..."
npm run dev
EOF