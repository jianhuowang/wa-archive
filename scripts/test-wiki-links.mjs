import assert from 'node:assert/strict';
import { remarkWikiLinks, wikiLinkNodes } from './remark-wiki-links.mjs';

const nodes = wikiLinkNodes('继续看 [[acm-palindrome|回文题解]] 和 [[linear-algebra-rank#三种视角]]。', { base: '/wa-archive/' });
assert.equal(nodes[1].type, 'link');
assert.equal(nodes[1].url, '/wa-archive/blog/acm-palindrome/');
assert.equal(nodes[1].children[0].value, '回文题解');
assert.equal(nodes[3].url, '/wa-archive/blog/linear-algebra-rank/#三种视角');

const localHeading = wikiLinkNodes('[[#易错点]]')[0];
assert.equal(localHeading.url, '#易错点');

const image = wikiLinkNodes('![[diagrams/union-find.png|并查集示意图]]', { base: '/' })[0];
assert.equal(image.type, 'image');
assert.equal(image.url, '/images/diagrams/union-find.png');
assert.equal(image.alt, '并查集示意图');

const tree = {
  type: 'root',
  children: [
    { type: 'paragraph', children: [{ type: 'text', value: '参见 [[acm-palindrome]]。' }] },
    { type: 'code', lang: 'md', value: '[[不会转换]]' },
  ],
};
remarkWikiLinks({ base: '/' })(tree);
assert.equal(tree.children[0].children[1].type, 'link');
assert.equal(tree.children[0].children[1].url, '/blog/acm-palindrome/');
assert.equal(tree.children[1].value, '[[不会转换]]');
console.log('Wiki Links 转换测试通过。');
