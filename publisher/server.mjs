import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import YAML from 'yaml';
import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import sanitizeHtml from 'sanitize-html';

const execFileAsync = promisify(execFile);
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(currentDir, '..');
const vaultDir = path.join(root, 'vault');
const publishedDir = path.join(vaultDir, 'published');
const assetsDir = path.join(vaultDir, 'assets');
const uiDir = path.join(currentDir, 'ui');
const categories = ['算法笔记', '课程笔记', '项目记录', '周报/碎碎念'];
const noteExtensions = new Set(['.md', '.mdx']);
const ignoredVaultFolders = new Set(['assets', 'published', 'templates', 'Excalidraw']);
const token = randomBytes(24).toString('hex');
let publishing = false;

marked.use(markedKatex({ throwOnError: false, nonStandard: true }));

function posix(relativePath) {
  return relativePath.replace(/\\/g, '/');
}

function isInside(parent, candidate) {
  return candidate === parent || candidate.startsWith(`${parent}${path.sep}`);
}

function resolveVaultPath(relativePath) {
  if (typeof relativePath !== 'string' || relativePath.includes('\0')) throw new Error('无效笔记路径');
  const resolved = path.resolve(vaultDir, relativePath);
  if (!isInside(vaultDir, resolved)) throw new Error('笔记路径超出 Vault');
  return resolved;
}

function splitDocument(source) {
  const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
  if (!match) return { data: {}, body: source };
  let data = {};
  try { data = YAML.parse(match[1]) ?? {}; } catch { data = {}; }
  return { data, body: source.slice(match[0].length) };
}

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function deriveDescription(body) {
  const paragraphs = body
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\$\$[\s\S]*?\$\$/g, '')
    .split(/\r?\n\s*\r?\n/)
    .map((part) => cleanText(part.replace(/^#{1,6}\s+/gm, '').replace(/^>\s?/gm, '').replace(/!?(\[\[|\]\])/g, '')))
    .filter((part) => part && !part.startsWith('---') && !/^[-*+]\s/.test(part));
  return (paragraphs[0] || '一篇来自 WHJ 学习档案馆的笔记。').slice(0, 140);
}

function deriveMetadata(source, relativePath) {
  const { data, body } = splitDocument(source);
  const heading = body.match(/^#\s+(.+)$/m)?.[1];
  const filename = path.basename(relativePath, path.extname(relativePath));
  return {
    title: cleanText(data.title || heading || filename),
    date: data.date ? new Date(data.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    tags: Array.isArray(data.tags) ? data.tags.map(cleanText).filter(Boolean) : [],
    category: categories.includes(data.category) ? data.category : '算法笔记',
    description: cleanText(data.description || deriveDescription(body)),
    difficulty: cleanText(data.difficulty),
    platform: cleanText(data.platform),
    status: cleanText(data.status),
    slug: filename.toLowerCase(),
  };
}

async function walkNotes(directory = vaultDir, relativeBase = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const notes = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (!relativeBase && ignoredVaultFolders.has(entry.name)) continue;
    const relative = posix(path.join(relativeBase, entry.name));
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) notes.push(...await walkNotes(fullPath, relative));
    else if (noteExtensions.has(path.extname(entry.name).toLowerCase())) notes.push({ relative, fullPath });
  }
  return notes;
}

async function publishedIndex() {
  const entries = await readdir(publishedDir, { withFileTypes: true });
  const map = new Map();
  for (const entry of entries) {
    if (!entry.isFile() || !noteExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    const stem = path.basename(entry.name, path.extname(entry.name)).toLowerCase();
    map.set(stem, entry.name);
  }
  return map;
}

function wikiTargets(body) {
  return [...body.matchAll(/(?<!!)\[\[([^\]]+)\]\]/g)]
    .map((match) => match[1].split('|', 1)[0].split('#', 1)[0].trim().replace(/\.(md|mdx)$/i, ''))
    .filter(Boolean);
}

function imageTargets(body) {
  return [...body.matchAll(/!\[\[([^\]]+)\]\]/g)]
    .map((match) => match[1].split('|', 1)[0].trim())
    .filter(Boolean);
}

async function noteIndex() {
  const notes = await walkNotes();
  const byStem = new Map();
  for (const note of notes) {
    const stem = path.basename(note.relative, path.extname(note.relative)).toLowerCase();
    if (!byStem.has(stem)) byStem.set(stem, []);
    byStem.get(stem).push(note);
  }
  return { notes, byStem };
}

async function dependencyClosure(startRelative) {
  const { byStem } = await noteIndex();
  const published = await publishedIndex();
  const queue = [startRelative];
  const visited = new Set([startRelative.toLowerCase()]);
  const dependencies = [];
  const unresolved = [];
  const ambiguous = [];

  while (queue.length) {
    const relative = queue.shift();
    const source = await readFile(resolveVaultPath(relative), 'utf8');
    const { body } = splitDocument(source);
    for (const target of wikiTargets(body)) {
      const stem = path.basename(target).toLowerCase();
      if (published.has(stem)) continue;
      const matches = byStem.get(stem) ?? [];
      if (!matches.length) { unresolved.push(target); continue; }
      if (matches.length > 1) { ambiguous.push({ target, paths: matches.map((item) => item.relative) }); continue; }
      const match = matches[0];
      if (visited.has(match.relative.toLowerCase())) continue;
      visited.add(match.relative.toLowerCase());
      dependencies.push(match.relative);
      queue.push(match.relative);
    }
  }
  return { dependencies, unresolved: [...new Set(unresolved)], ambiguous };
}

export async function listNotes() {
  const { notes } = await noteIndex();
  const published = await publishedIndex();
  const result = await Promise.all(notes.map(async (note) => {
    const source = await readFile(note.fullPath, 'utf8');
    const info = await stat(note.fullPath);
    const metadata = deriveMetadata(source, note.relative);
    return {
      path: note.relative,
      title: metadata.title,
      folder: posix(path.dirname(note.relative)) === '.' ? 'Vault 根目录' : posix(path.dirname(note.relative)),
      modified: info.mtime.toISOString(),
      published: published.has(path.basename(note.relative, path.extname(note.relative)).toLowerCase()),
    };
  }));
  return result.sort((a, b) => b.modified.localeCompare(a.modified));
}

export async function getNote(relativePath) {
  const fullPath = resolveVaultPath(relativePath);
  if (!noteExtensions.has(path.extname(fullPath).toLowerCase())) throw new Error('仅支持 Markdown 笔记');
  const source = await readFile(fullPath, 'utf8');
  const metadata = deriveMetadata(source, relativePath);
  const links = await dependencyClosure(relativePath);
  return { path: relativePath, metadata, ...links };
}

function validateMetadata(metadata) {
  const value = {
    title: cleanText(metadata?.title),
    date: cleanText(metadata?.date),
    tags: Array.isArray(metadata?.tags) ? metadata.tags.map(cleanText).filter(Boolean) : [],
    category: cleanText(metadata?.category),
    description: cleanText(metadata?.description),
    difficulty: cleanText(metadata?.difficulty),
    platform: cleanText(metadata?.platform),
    status: cleanText(metadata?.status),
    slug: cleanText(metadata?.slug).toLowerCase(),
  };
  if (!value.title || !value.date || !value.description) throw new Error('标题、日期和简介不能为空');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.date)) throw new Error('日期格式必须是 YYYY-MM-DD');
  if (!categories.includes(value.category)) throw new Error('文章分类无效');
  value.slug = value.slug.replace(/\.(md|mdx)$/i, '').replace(/[<>:"/\\|?*#%\x00-\x1f]/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!value.slug) throw new Error('文件名不能为空');
  return value;
}

function renderWikiForPreview(body) {
  return body
    .replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => {
      const query = encodeURIComponent(target.trim());
      return `![${cleanText(alias || target)}](/api/asset?path=${query})`;
    })
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_, target, alias) => `[${cleanText(alias || target)}](#wiki-preview)`);
}

export function normalizeWikiLinks(body) {
  return body.replace(/(?<!!)\[\[([^\]]+)\]\]/g, (full, raw) => {
    const aliasIndex = raw.indexOf('|');
    const destination = aliasIndex === -1 ? raw : raw.slice(0, aliasIndex);
    const alias = aliasIndex === -1 ? '' : raw.slice(aliasIndex);
    const hashIndex = destination.indexOf('#');
    const target = hashIndex === -1 ? destination : destination.slice(0, hashIndex);
    const heading = hashIndex === -1 ? '' : destination.slice(hashIndex);
    if (!target.trim()) return full;
    const basename = target.trim().replace(/\\/g, '/').split('/').pop();
    return `[[${basename}${heading}${alias}]]`;
  });
}

export async function previewNote(relativePath, metadataInput) {
  const source = await readFile(resolveVaultPath(relativePath), 'utf8');
  const { body } = splitDocument(source);
  const metadata = validateMetadata(metadataInput);
  const rawHtml = await marked.parse(renderWikiForPreview(body));
  const html = sanitizeHtml(rawHtml, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'span', 'math', 'semantics', 'annotation', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'mfrac']),
    allowedAttributes: {
      '*': ['class', 'id', 'aria-hidden', 'style', 'encoding'],
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'loading'],
    },
    allowedSchemes: ['http', 'https', 'data'],
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  });
  const links = await dependencyClosure(relativePath);
  return { html, metadata, ...links };
}

function composeDocument(source, metadataInput) {
  const metadata = validateMetadata(metadataInput);
  const { body } = splitDocument(source);
  const frontmatter = {
    title: metadata.title,
    date: metadata.date,
    tags: metadata.tags,
    category: metadata.category,
    description: metadata.description,
  };
  if (metadata.difficulty) frontmatter.difficulty = metadata.difficulty;
  if (metadata.platform) frontmatter.platform = metadata.platform;
  if (metadata.status) frontmatter.status = metadata.status;
  return { metadata, content: `---\n${YAML.stringify(frontmatter, { lineWidth: 0 }).trim()}\n---\n\n${normalizeWikiLinks(body).trimStart()}` };
}

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

async function run(command, args, options = {}) {
  try {
    return await execFileAsync(command, args, { cwd: root, timeout: 180_000, maxBuffer: 4_000_000, windowsHide: true, ...options });
  } catch (error) {
    const detail = [error.stdout, error.stderr, error.message].filter(Boolean).join('\n').trim();
    const wrapped = new Error(detail || `${command} 执行失败`);
    wrapped.code = error.code;
    throw wrapped;
  }
}

async function rollback(backups) {
  for (const [target, previous] of backups) {
    if (previous === null) await unlink(target).catch(() => {});
    else await writeFile(target, previous, 'utf8');
  }
}

export async function publishNote(payload) {
  if (publishing) throw new Error('已有发布任务正在进行');
  publishing = true;
  const backups = new Map();
  let committed = false;
  try {
    const relativePath = payload?.path;
    const requestedDependencies = new Set(Array.isArray(payload?.dependencies) ? payload.dependencies : []);
    const closure = await dependencyClosure(relativePath);
    if (closure.unresolved.length) throw new Error(`找不到关联笔记：${closure.unresolved.join('、')}`);
    if (closure.ambiguous.length) throw new Error(`存在同名关联笔记，请先整理：${closure.ambiguous.map((item) => item.target).join('、')}`);
    const omitted = closure.dependencies.filter((item) => !requestedDependencies.has(item));
    if (omitted.length) throw new Error(`尚未确认公开关联笔记：${omitted.join('、')}`);

    const jobs = [{ path: relativePath, metadata: payload.metadata, primary: true }];
    for (const dependency of closure.dependencies) {
      const source = await readFile(resolveVaultPath(dependency), 'utf8');
      jobs.push({ path: dependency, metadata: deriveMetadata(source, dependency), primary: false });
    }

    const written = [];
    const assets = new Set();
    await mkdir(publishedDir, { recursive: true });
    for (const job of jobs) {
      const source = await readFile(resolveVaultPath(job.path), 'utf8');
      const composed = composeDocument(source, job.metadata);
      const slug = job.primary ? composed.metadata.slug : path.basename(job.path, path.extname(job.path)).toLowerCase();
      const target = path.join(publishedDir, `${slug}.md`);
      if (!isInside(publishedDir, target)) throw new Error('生成的发布路径无效');
      backups.set(target, await exists(target) ? await readFile(target, 'utf8') : null);
      await writeFile(target, composed.content, 'utf8');
      written.push(target);
      for (const asset of imageTargets(splitDocument(source).body)) {
        const assetPath = path.resolve(assetsDir, asset);
        if (!isInside(assetsDir, assetPath) || !await exists(assetPath)) throw new Error(`找不到附件：${asset}`);
        assets.add(assetPath);
      }
    }

    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    await run(npmCommand, ['run', 'build']);
    const stagePaths = [...written, ...assets].map((file) => path.relative(root, file));
    await run('git', ['add', '--', ...stagePaths]);
    try { await run('git', ['diff', '--cached', '--quiet']); }
    catch (error) {
      if (error.code !== 1) throw error;
      const message = cleanText(payload.commitMessage) || `Publish ${validateMetadata(payload.metadata).title}`;
      await run('git', ['commit', '-m', message]);
      committed = true;
    }
    await run('git', ['-c', 'http.version=HTTP/1.1', 'push']);
    return { ok: true, committed, files: written.map((file) => posix(path.relative(root, file))) };
  } catch (error) {
    if (!committed) await rollback(backups);
    error.committed = committed;
    throw error;
  } finally {
    publishing = false;
  }
}

async function parseJsonBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error('请求内容过大');
  }
  return body ? JSON.parse(body) : {};
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

function validToken(request) {
  const supplied = request.headers['x-publisher-token'];
  if (typeof supplied !== 'string' || supplied.length !== token.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(token));
}

async function serveUi(response, filename, contentType, injectToken = false) {
  let content = await readFile(path.join(uiDir, filename));
  if (injectToken) content = Buffer.from(content.toString('utf8').replace('__PUBLISHER_TOKEN__', token));
  response.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(content);
}

export function createPublisherServer() {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/') return await serveUi(response, 'index.html', 'text/html; charset=utf-8', true);
      if (request.method === 'GET' && url.pathname === '/app.js') return await serveUi(response, 'app.js', 'text/javascript; charset=utf-8');
      if (request.method === 'GET' && url.pathname === '/styles.css') return await serveUi(response, 'styles.css', 'text/css; charset=utf-8');
      if (request.method === 'GET' && url.pathname === '/api/asset') {
        const asset = path.resolve(assetsDir, url.searchParams.get('path') || '');
        if (!isInside(assetsDir, asset)) return sendJson(response, 403, { error: '附件路径无效' });
        const content = await readFile(asset);
        const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.avif': 'image/avif' };
        response.writeHead(200, { 'Content-Type': types[path.extname(asset).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        return response.end(content);
      }
      if (url.pathname.startsWith('/api/') && !validToken(request)) return sendJson(response, 403, { error: '发布器令牌无效，请刷新页面' });
      if (request.method === 'GET' && url.pathname === '/api/notes') return sendJson(response, 200, { notes: await listNotes() });
      if (request.method === 'GET' && url.pathname === '/api/note') return sendJson(response, 200, await getNote(url.searchParams.get('path')));
      if (request.method === 'POST' && url.pathname === '/api/preview') {
        const payload = await parseJsonBody(request);
        return sendJson(response, 200, await previewNote(payload.path, payload.metadata));
      }
      if (request.method === 'POST' && url.pathname === '/api/publish') {
        const payload = await parseJsonBody(request);
        try { return sendJson(response, 200, await publishNote(payload)); }
        catch (error) { return sendJson(response, 400, { error: error.message, committed: Boolean(error.committed) }); }
      }
      if (request.method === 'POST' && url.pathname === '/api/retry-push') {
        await run('git', ['-c', 'http.version=HTTP/1.1', 'push']);
        return sendJson(response, 200, { ok: true });
      }
      sendJson(response, 404, { error: 'Not found' });
    } catch (error) {
      sendJson(response, 400, { error: error.message || '请求处理失败' });
    }
  });
}

function openBrowser(url) {
  if (process.env.PUBLISHER_NO_OPEN === '1') return;
  const commands = process.platform === 'win32'
    ? ['cmd.exe', ['/c', 'start', '', url]]
    : process.platform === 'darwin'
      ? ['open', [url]]
      : ['xdg-open', [url]];
  const child = spawn(commands[0], commands[1], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PUBLISHER_PORT || 4179);
  const server = createPublisherServer();
  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}`;
    console.log(`\nWA Publisher 已启动：${url}`);
    console.log('关闭发布器请按 Ctrl + C。\n');
    openBrowser(url);
  });
}
