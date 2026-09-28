import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// In dev the browser talks to Vite only; Vite forwards the api and the socket to :3000.
// The two provider webhooks are forwarded too, so ONE public address (the ngrok tunnel, pointed
// here) serves her join link, the console, guruji's screens, Meta and Razorpay — the same shape
// production has, where his own domain fronts everything. Without this, a join link sent to a
// real phone says localhost, which is that phone, and the link is dead.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // ngrok presents a hostname Vite does not know; without this it refuses the request.
    allowedHosts: ['.ngrok-free.dev', '.ngrok-free.app', '.ngrok.io'],
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
      '/webhook': 'http://localhost:3000',
      '/razorpay': 'http://localhost:3000',
    },
  },
  test: {
    environment: 'node',
  },
});
