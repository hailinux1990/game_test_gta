#!/bin/bash
# PIXEL CITY Game Launcher - Linux/macOS
# Created for easy distribution of the GTA-style 3D game

echo "===================================================="
echo "            PIXEL CITY - Game Server Launcher"
echo "===================================================="
echo ""
echo "Starting PIXEL CITY game server..."
echo ""
echo "SERVER WILL BE AVAILABLE AT:"
echo "  http://localhost:8123/"
echo ""
echo "Instructions:"
echo "   1. Wait for server to start (you see server messages)"
echo "   2. Open your browser"
echo "   3. Go to: http://localhost:8123/"
echo "   4. Game loads automatically!"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""
echo "===================================================="

# Change to the directory where this script is located
cd "$(dirname "$0")"

# Start Python HTTP server on port 8123
echo "Server started at: http://localhost:8123/"
echo "Press Ctrl+C to stop"
python3 -m http.server 8123

echo ""
echo "===================================================="
echo "            Server stopped. Goodbye!"
echo "===================================================="
echo ""

# Keep terminal open on error
read -p "Press Enter to exit..." -n 1 -s