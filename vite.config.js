const { defineConfig, loadEnv } = require('vite');
const react = require('@vitejs/plugin-react');

module.exports = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    root: 'frontend',
    plugins: [react()],
    // A literal build-time constant (not import.meta.env) so the same reference is
    // syntactically inert — and safely undefined — when this component is loaded under
    // Jest/Babel instead of Vite's own build pipeline.
    define: {
      __KIOSK_VENUE_ID__: JSON.stringify(env.VITE_KIOSK_VENUE_ID || '')
    },
    build: {
      outDir: '../dist',
      emptyOutDir: true
    },
    server: {
      proxy: {
        '/api': 'http://localhost:3001'
      }
    }
  };
});
