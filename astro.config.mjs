import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { remarkWikiLinks } from './scripts/remark-wiki-links.mjs';

const repository = process.env.GITHUB_REPOSITORY;
const [owner, repo] = repository?.split('/') ?? [];
const isUserSite = repo === `${owner}.github.io`;
const base = repository && !isUserSite ? `/${repo}/` : '/';

export default defineConfig({
  integrations: [mdx()],
  site: repository ? `https://${owner}.github.io` : 'http://localhost:4321',
  base,
  output: 'static',
  markdown: {
    processor: unified({
      remarkPlugins: [remarkMath, [remarkWikiLinks, { base }]],
      rehypePlugins: [rehypeKatex],
    }),
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      wrap: true,
    },
  },
});
