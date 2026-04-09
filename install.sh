#!/usr/bin/env bash
set -e

# CodeJury installer
# Usage: curl -fsSL https://raw.githubusercontent.com/eagleisbatman/codejury/main/install.sh | bash

INSTALL_DIR="${CODEJURY_INSTALL_DIR:-$HOME/.codejury-cli}"
REPO="https://github.com/eagleisbatman/codejury.git"

echo ""
echo "  Installing CodeJury..."
echo ""

# Check Node.js version
if ! command -v node &> /dev/null; then
  echo "  Error: Node.js is required (v22+). Install from https://nodejs.org"
  exit 1
fi

NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "  Error: Node.js v22+ required (found $(node -v))"
  exit 1
fi

# Clone or update
if [ -d "$INSTALL_DIR" ]; then
  echo "  Updating existing installation..."
  cd "$INSTALL_DIR"
  git pull --quiet
else
  echo "  Cloning repository..."
  git clone --quiet --depth 1 "$REPO" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# Install and build
echo "  Installing dependencies..."
npm install --quiet 2>/dev/null

echo "  Building..."
npm run build --quiet 2>/dev/null

# Link globally
echo "  Linking cj command..."
cd packages/cli
npm link --quiet 2>/dev/null

echo ""
echo "  Done! CodeJury installed."
echo ""
echo "  Get started:"
echo "    cd /path/to/your/project"
echo "    cj init"
echo ""

# Verify
if command -v cj &> /dev/null; then
  echo "  cj version: $(cj --version)"
else
  echo "  Note: You may need to restart your shell or add npm's bin to PATH."
  echo "  Try: export PATH=\"\$PATH:$(npm prefix -g)/bin\""
fi
echo ""
