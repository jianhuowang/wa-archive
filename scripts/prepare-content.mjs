import { cp, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const publishedDir = path.join(root, 'vault', 'published');
const assetsDir = path.join(root, 'vault', 'assets');
const generatedImagesDir = path.join(root, 'public', 'images');
const articleExtensions = new Set(['.md', '.mdx']);
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif']);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else files.push(fullPath);
  }
  return files;
}

function articleId(file) {
  return path.relative(publishedDir, file).replace(/\\/g, '/').replace(/\.(md|mdx)$/i, '');
}

function parseTarget(raw) {
  const destination = raw.split('|', 1)[0].trim();
  return destination.split('#', 1)[0].replace(/\\/g, '/').replace(/\.(md|mdx)$/i, '');
}

const articles = (await walk(publishedDir)).filter((file) => articleExtensions.has(path.extname(file).toLowerCase()));
const ids = new Set(articles.map(articleId));
const basenames = new Map(articles.map((file) => [path.basename(articleId(file)).toLowerCase(), articleId(file)]));
const errors = [];

for (const file of articles) {
  const source = await readFile(file, 'utf8');
  const relative = path.relative(root, file);
  const frontmatter = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  for (const field of ['title', 'date', 'tags', 'category', 'description']) {
    if (!frontmatter || !new RegExp(`^${field}:`, 'm').test(frontmatter[1])) errors.push(`${relative}: 缺少 ${field}`);
  }

  for (const match of source.matchAll(/(?<!!)\[\[([^\]]+)\]\]/g)) {
    const target = parseTarget(match[1]);
    if (!target) continue;
    const resolved = ids.has(target) || basenames.has(target.toLowerCase());
    if (!resolved) errors.push(`${relative}: 找不到 Wiki Link [[${match[1]}]]`);
  }

  for (const match of source.matchAll(/!\[\[([^\]]+)\]\]/g)) {
    const target = parseTarget(match[1]);
    const extension = path.extname(target).toLowerCase();
    if (!imageExtensions.has(extension)) errors.push(`${relative}: 不支持的附件类型 [[${match[1]}]]`);
    const assetPath = path.resolve(assetsDir, target);
    if (!assetPath.startsWith(`${assetsDir}${path.sep}`)) {
      errors.push(`${relative}: 附件路径超出 assets 目录 [[${match[1]}]]`);
      continue;
    }
    try { await readFile(assetPath); }
    catch { errors.push(`${relative}: 找不到附件 [[${match[1]}]]`); }
  }
}

if (errors.length) {
  console.error('\n内容检查失败：\n- ' + errors.join('\n- ') + '\n');
  process.exit(1);
}

await rm(generatedImagesDir, { recursive: true, force: true });
await mkdir(generatedImagesDir, { recursive: true });
await cp(assetsDir, generatedImagesDir, { recursive: true });
console.log(`内容检查通过：${articles.length} 篇文章，附件已同步。`);
