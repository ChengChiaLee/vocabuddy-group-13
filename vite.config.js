import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { exampleApiPlugin } from './server/examples.js';
export default defineConfig(({ mode }) => ({
  plugins: [react(), exampleApiPlugin({ ...loadEnv(mode, process.cwd(), ''), ...process.env })],
}));
