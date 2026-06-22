import GithubSlugger from 'github-slugger';

const SKIP_PARENTS = new Set(['code', 'inlineCode', 'link', 'image', 'html']);
const WIKI_PATTERN = /(!?)\[\[([^\]]+)\]\]/g;

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function parseWikiTarget(raw) {
  const [destination, alias] = raw.split('|', 2).map((part) => part.trim());
  const hashIndex = destination.indexOf('#');
  const note = (hashIndex === -1 ? destination : destination.slice(0, hashIndex))
    .replace(/\\/g, '/')
    .replace(/\.(md|mdx)$/i, '');
  const heading = hashIndex === -1 ? '' : destination.slice(hashIndex + 1).trim();
  return { note, heading, alias };
}

export function wikiLinkNodes(value, { base = '/' } = {}) {
  const nodes = [];
  let cursor = 0;

  for (const match of value.matchAll(WIKI_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push({ type: 'text', value: value.slice(cursor, index) });

    const embedded = match[1] === '!';
    const { note, heading, alias } = parseWikiTarget(match[2]);

    if (embedded) {
      const filename = note.split('/').pop() ?? note;
      nodes.push({
        type: 'image',
        url: `${base}images/${encodePath(note)}`,
        alt: alias || filename.replace(/\.[^.]+$/, ''),
        title: null,
      });
    } else {
      const slugger = new GithubSlugger();
      const hash = heading ? `#${slugger.slug(heading)}` : '';
      const label = alias || heading || note.split('/').pop() || note;
      nodes.push({
        type: 'link',
        url: note ? `${base}blog/${encodePath(note.toLowerCase())}/${hash}` : hash || '#',
        title: null,
        data: { hProperties: { className: ['wiki-link'] } },
        children: [{ type: 'text', value: label }],
      });
    }
    cursor = index + match[0].length;
  }

  if (cursor < value.length) nodes.push({ type: 'text', value: value.slice(cursor) });
  return nodes;
}

function transformChildren(node) {
  if (!node?.children || SKIP_PARENTS.has(node.type)) return;

  const next = [];
  for (const child of node.children) {
    if (child.type === 'text' && WIKI_PATTERN.test(child.value)) {
      WIKI_PATTERN.lastIndex = 0;
      next.push(...wikiLinkNodes(child.value, transformChildren.options));
    } else {
      transformChildren(child);
      next.push(child);
    }
  }
  node.children = next;
}

export function remarkWikiLinks(options = {}) {
  return (tree) => {
    transformChildren.options = options;
    transformChildren(tree);
  };
}
