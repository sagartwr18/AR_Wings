import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  plugins: [
    basicSsl()
  ],
  server: {
    host: '0.0.0.0', // Listen on all network interfaces (LAN Wi-Fi)
    port: 5173,
    https: true,     // Required for mobile camera access (navigator.mediaDevices)
    cors: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
});
