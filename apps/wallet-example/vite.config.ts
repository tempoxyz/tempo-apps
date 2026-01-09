import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        // Required for mobile testing (ngrok / local network)
        host: true,
        allowedHosts: true,
    },
    optimizeDeps: {
        include: ['wagmi', 'viem'],
    },
});
