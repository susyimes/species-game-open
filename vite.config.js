import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  server: { watch: { usePolling: true, interval: 700 },proxy:{'/api/ecology':'http://127.0.0.1:5197'} },
  build: { rolldownOptions: {input:{main:resolve('index.html'),legacy:resolve('legacy/index.html')},output: { manualChunks(id) { if(id.includes('node_modules/three/'))return 'three'; } } } },
});
