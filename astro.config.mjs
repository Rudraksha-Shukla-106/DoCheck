import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  output: 'static',
  site: 'https://www.exampicfix.in',
  integrations: [
    sitemap({
      // Exclude error pages and the /privacy/ redirect alias
      // (canonical lives at /privacy-policy/).
      filter: (page) => !/(\/404\/?|\/500\/?|\/privacy\/?)$/.test(page),
      serialize(item) {
        const url = new URL(item.url);
        const path = url.pathname;

        // Homepage
        if (path === '/') {
          item.changefreq = 'weekly';
          item.priority = 1.0;
          return item;
        }
        // Exam resizer hubs
        if (
          path === '/exam-photo-and-signature-resizer/' ||
          path === '/photo-resizer-for-government-exams/' ||
          path === '/ssc-photo-and-signature-resizer/' ||
          path === '/upsc-photo-and-signature-resizer/' ||
          path === '/ibps-photo-and-signature-resizer/' ||
          path === '/rrb-photo-and-signature-resizer/'
        ) {
          item.changefreq = 'weekly';
          item.priority = 0.9;
          return item;
        }
        // Passport resizer + custom image resizer + requirements index
        if (path === '/passport-photo-resizer/' || path === '/resize-image-online/' || path === '/requirements/') {
          item.changefreq = path === '/requirements/' ? 'weekly' : 'monthly';
          item.priority = 0.8;
          return item;
        }
        // Individual requirement pages
        if (path.startsWith('/requirements/')) {
          item.changefreq = 'monthly';
          item.priority = path.includes('ssc-cgl') ? 0.8 : path.includes('pan-card') || path.includes('voter-id') || path.includes('aadhaar') || path.includes('bank-kyc') || path.includes('mutual-fund') ? 0.6 : 0.7;
          return item;
        }
        // Informational pages
        if (path === '/how-it-works/' || path === '/about-us/') {
          item.changefreq = 'monthly';
          item.priority = 0.5;
          return item;
        }
        // Legal / contact pages
        item.changefreq = 'yearly';
        item.priority = 0.3;
        return item;
      },
    }),
  ],
});
