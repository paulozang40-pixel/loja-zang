import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const privadas = ['/admin/', '/finalizar/', '/pedido/', '/formularios/'];

export default defineConfig({
  site: 'https://www.zangeditoracrista.com.br',
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [
    sitemap({ filter: (page) => !privadas.some((p) => page.includes(p)) }),
  ],
});
