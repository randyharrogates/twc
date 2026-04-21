import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fsApiPlugin } from './src/devServer/fsApi';

export default defineConfig({
  plugins: [react(), tailwindcss(), fsApiPlugin()],
});
