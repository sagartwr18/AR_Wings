const { app, BrowserWindow, session } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1080,
    height: 1920,
    fullscreen: true,
    kiosk: true,              // Locks system in fullscreen kiosk mode
    frame: false,             // Frameless window
    autoHideMenuBar: true,
    alwaysOnTop: true,        // Prevents other apps from stealing screen focus
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false // Keep running at 60 FPS even if focus lost
    }
  });

  // Automatically approve camera permissions for the kiosk
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'https://localhost:5173';
  if (process.env.NODE_ENV === 'development') {
    win.loadURL(devServerUrl);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  // Allow self-signed certificate for local HTTPS testing
  app.commandLine.appendSwitch('ignore-certificate-errors');
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
