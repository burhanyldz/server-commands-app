import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const configuredBase = env.VITE_APP_BASE_PATH?.trim() || '/';
  const withLeadingSlash = configuredBase.startsWith('/') ? configuredBase : `/${configuredBase}`;
  const base = withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;

  return {
    base,
    plugins: [react()]
  };
});
