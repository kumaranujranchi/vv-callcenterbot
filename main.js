const { app, BrowserWindow, ipcMain, globalShortcut, screen, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

// Load Client Configuration
let clientConfig = { serverUrl: 'http://localhost:3847', hotkey: 'CommandOrControl+Shift+Space' };
try {
  const cfgPath = path.join(__dirname, 'client-config.json');
  if (fs.existsSync(cfgPath)) {
    clientConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  }
} catch (e) {
  console.warn('Could not read client-config.json, falling back to localhost.');
}

// Start local server if running in standalone/localhost mode
if (clientConfig.serverUrl.includes('localhost') || clientConfig.serverUrl.includes('127.0.0.1')) {
  require('./server');
}

// Set AppUserModelId for proper taskbar grouping & icon display on Windows
if (process.platform === 'win32') {
  app.setAppUserModelId('com.vastuvihar.copilot');
}

let mainWindow;
let tray = null;
let isExpanded = false;

// Geometry constants
const BUBBLE_SIZE = { width: 80, height: 80 };
const EXPANDED_SIZE = { width: 440, height: 650 };

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  // Initial bubble position at bottom right
  const initialX = screenWidth - BUBBLE_SIZE.width - 24;
  const initialY = screenHeight - BUBBLE_SIZE.height - 40;

  // Icon path resolution (ico for Windows, png as fallback)
  const icoPath = path.join(__dirname, 'public', 'icon.ico');
  const pngPath = path.join(__dirname, 'public', 'logo.png');
  const appIcon = fs.existsSync(icoPath) ? icoPath : (fs.existsSync(pngPath) ? pngPath : undefined);

  mainWindow = new BrowserWindow({
    width: BUBBLE_SIZE.width,
    height: BUBBLE_SIZE.height,
    x: initialX,
    y: initialY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: false,
    icon: appIcon,
    title: 'Vastu Vihar Copilot',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  if (appIcon && mainWindow.setIcon) {
    mainWindow.setIcon(appIcon);
  }

  // Initialize System Tray Icon with Vastu Vihar logo
  if (appIcon && !tray) {
    try {
      tray = new Tray(appIcon);
      const contextMenu = Menu.buildFromTemplate([
        { label: 'Vastu Vihar Copilot v1.0', enabled: false },
        { type: 'separator' },
        { label: 'Show / Hide Assistant', click: () => toggleExpandState() },
        { type: 'separator' },
        { label: 'Quit Application', click: () => app.quit() }
      ]);
      tray.setToolTip('Vastu Vihar Copilot');
      tray.setContextMenu(contextMenu);
      tray.on('click', () => toggleExpandState());
    } catch (err) {
      console.warn('Tray creation error:', err);
    }
  }

  // Always on top level (screen saver / floating level on Mac & Windows)
  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Load UI from central server URL or local
  mainWindow.loadURL(clientConfig.serverUrl || 'http://localhost:3847');

  // Handle window states
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Global hotkey to toggle window
  globalShortcut.register(clientConfig.hotkey || 'CommandOrControl+Shift+Space', () => {
    toggleExpandState();
  });
}

function toggleExpandState() {
  if (!mainWindow) return;

  const currentBounds = mainWindow.getBounds();
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  if (isExpanded) {
    // Collapse to Bubble
    isExpanded = false;
    const newX = Math.min(Math.max(20, currentBounds.x + (EXPANDED_SIZE.width - BUBBLE_SIZE.width)), screenWidth - BUBBLE_SIZE.width - 20);
    const newY = Math.min(Math.max(20, currentBounds.y + (EXPANDED_SIZE.height - BUBBLE_SIZE.height)), screenHeight - BUBBLE_SIZE.height - 20);

    mainWindow.setBounds({
      x: newX,
      y: newY,
      width: BUBBLE_SIZE.width,
      height: BUBBLE_SIZE.height
    });
    mainWindow.webContents.send('window-mode-changed', { expanded: false });
  } else {
    // Expand to Chat Window
    isExpanded = true;
    let newX = currentBounds.x - (EXPANDED_SIZE.width - BUBBLE_SIZE.width);
    let newY = currentBounds.y - (EXPANDED_SIZE.height - BUBBLE_SIZE.height);

    // Keep within bounds
    if (newX < 20) newX = 20;
    if (newX + EXPANDED_SIZE.width > screenWidth) newX = screenWidth - EXPANDED_SIZE.width - 20;
    if (newY < 30) newY = 30;
    if (newY + EXPANDED_SIZE.height > screenHeight) newY = screenHeight - EXPANDED_SIZE.height - 20;

    mainWindow.setBounds({
      x: newX,
      y: newY,
      width: EXPANDED_SIZE.width,
      height: EXPANDED_SIZE.height
    });
    mainWindow.webContents.send('window-mode-changed', { expanded: true });
  }
}

// IPC Handlers
ipcMain.on('toggle-window-mode', () => {
  toggleExpandState();
});

ipcMain.on('set-expanded', (event, expand) => {
  if (isExpanded !== expand) {
    toggleExpandState();
  }
});

ipcMain.on('close-app', () => {
  app.quit();
});

ipcMain.on('move-window', (event, { deltaX, deltaY }) => {
  if (!mainWindow) return;
  const bounds = mainWindow.getBounds();
  mainWindow.setBounds({
    x: Math.round(bounds.x + deltaX),
    y: Math.round(bounds.y + deltaY),
    width: bounds.width,
    height: bounds.height
  });
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
