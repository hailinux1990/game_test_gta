# Deployment Guide

PIXEL CITY is a standalone web-based game that runs in any modern web browser on Windows, Ubuntu, or other platforms.

## Quick Start

### Windows

1. **Double-click `index.html`** to open the game directly
2. **Or run a local server** from Command Prompt/PowerShell:
   ```cmd
   cd game_test_gta
   python -m http.server 8123
   ```
3. **Open your browser** to: `http://localhost:8123/`

### Ubuntu / Linux

1. **Double-click `index.html`** to open the game directly
2. **Or run a local server** from Terminal:
   ```bash
   cd game_test_gta
   python3 -m http.server 8123
   ```
3. **Open your browser** to: `http://localhost:8123/`

## System Requirements

- **Browser**: Chrome, Edge, Firefox, or Safari (modern versions)
- **3D Support**: WebGL (most modern browsers have this enabled by default)
- **Memory**: 2GB+ RAM recommended
- **No GPU acceleration**: The game includes a headless mode for systems without dedicated GPU

## Launch Options

### Direct File Access
- Simply double-click `index.html` - the game loads entirely offline
- No internet connection required (all assets are bundled locally)
- Works in offline mode

### Local Server
Recommended for testing changes or sharing with others:

```bash
# Ubuntu/Linux
python3 -m http.server 8123

# Windows (Command Prompt)
python -m http.server 8123

# Windows (PowerShell)
python -m http.server 8123
```

### Alternative Servers
If Python isn't available:

**Node.js + http-server**:
```bash
npm install -g http-server
http-server game_test_gta -p 8123
```

**Serve with live reload** (for development):
```bash
# Install dependencies if needed
npm install

# For Ubuntu/Linux
npx live-server

# For Windows with npm globally installed
live-server
```

## Port Configuration

The default port is `8123`. If you need to change it:

```bash
# Ubuntu/Linux
python3 -m http.server 8080

# Windows
python -m http.server 8080
```

Then access the game at: `http://localhost:8080/`

## Troubleshooting

### Game doesn't load
1. **Refresh the page** - clear browser cache if needed
2. **Enable WebGL** - check browser settings
3. **Check console** - open browser developer tools for JavaScript errors

### Performance issues
1. **Close other tabs** - game uses significant GPU resources
2. **Lower graphics** - some browsers have graphics settings
3. **Increase pixel scale** - game uses `PIXEL_SCALE = 2` for pixel art look

### Audio not working
- The game uses WebAudio API - ensure browser allows audio autoplay
- Click anywhere on the page first to enable audio

## Advanced Usage

### Run smoke tests (headless mode)
Validate the game logic without graphics:

```bash
cd game_test_gta
node tests/smoke.test.cjs
```

All 67 smoke tests should pass.

### Mobile/iPad
- Works with touch controls
- Use virtual joystick on screen
- Tap to attack, swipe to aim

## Building for Distribution

To package as a desktop app:

### Electron (cross-platform)
1. Install Electron: `npm install -g electron`
2. Create main process script
3. Use `electron-packager` to distribute

### Web deployment
Deploy to any static hosting service:
- GitHub Pages
- Netlify
- Vercel
- AWS S3
- Firebase Hosting

Just upload all files (`index.html`, `js/`, `lib/`, `LICENSE`) to the root directory.

## Game Controls

**Keyboard:**
- WASD / Arrow keys: Move
- Shift: Run
- Mouse: Aim and shoot
- 1-4: Switch weapons
- R: Reload (gun/AK-47)
- E: Steal/open vehicles

**Touch:**
- Virtual joystick for movement
- Tap screen to attack/shoot
- Swipe to aim

## File Structure
```
game_test_gta/
├── index.html          # Game interface
├── js/game.js          # Game logic (2328 lines)
├── lib/three.min.js    # Three.js engine (r128)
├── LICENSE            # Game license
├── README.md          # This documentation
├── DEPLOYMENT.md      # Deployment guide
├── tests/             # Automated tests
└── debug_bridge.cjs   # Debug utilities
```

## Version Notes
- Built with Three.js r128
- No external dependencies
- All content procedural
- Tested on Windows 10/11 and Ubuntu 20.04+

## Support
For issues or questions:
1. Check the smoke tests: `node tests/smoke.test.cjs`
2. Verify browser console for JavaScript errors
3. Ensure WebGL is enabled
4. Check that the server is running correctly (port 8123)