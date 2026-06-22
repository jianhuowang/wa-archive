import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

const repository = process.env.GITHUB_REPOSITORY;
const [owner, repo] = repository?.split('/') ?? [];
const isUserSite = repo === `${owner}.github.io`;

export default defineConfig({
  integrations: [mdx()],
  site: repository ? `https://${owner}.github.io` : 'http://localhost:4321',
  base: repository && !isUserSite ? `/${repo}/` : '/',
  output: 'static',
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      wrap: true,
    },
  },
});
