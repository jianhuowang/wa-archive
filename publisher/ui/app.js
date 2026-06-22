const token = document.querySelector('meta[name="publisher-token"]').content;
const listElement = document.querySelector('#note-list');
const searchInput = document.querySelector('#search');
const editor = document.querySelector('#editor');
const welcome = document.querySelector('#welcome');
const form = document.querySelector('#metadata-form');
const previewElement = document.querySelector('#preview');
const statusElement = document.querySelector('#status');
const dependencyBox = document.querySelector('#dependency-box');
const dependenciesElement = document.querySelector('#dependencies');
const warningBox = document.querySelector('#warning-box');
const confirmDialog = document.querySelector('#confirm-dialog');
const retryButton = document.querySelector('#retry-push');
let notes = [];
let current = null;

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-Publisher-Token': token, ...(options.headers || {}) },
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || '请求失败');
    error.committed = data.committed;
    throw error;
  }
  return data;
}

function escapeHtml(value) {
  const element = document.createElement('span');
  element.textContent = value;
  return element.innerHTML;
}

function renderList() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = notes.filter((note) => `${note.title} ${note.path}`.toLowerCase().includes(query));
  listElement.innerHTML = filtered.length ? filtered.map((note) => `
    <button class="note-item ${current?.path === note.path ? 'active' : ''}" data-path="${escapeHtml(note.path)}">
      <span class="note-title">${escapeHtml(note.title)}</span>
      <span class="note-meta">${escapeHtml(note.folder)}${note.published ? ' · 已发布' : ''}</span>
    </button>`).join('') : '<div class="empty">没有找到笔记。</div>';
  listElement.querySelectorAll('.note-item').forEach((button) => button.addEventListener('click', () => selectNote(button.dataset.path)));
}

async function loadNotes() {
  listElement.innerHTML = '<div class="empty">正在读取 Vault…</div>';
  const data = await api('/api/notes');
  notes = data.notes;
  renderList();
}

function setForm(metadata) {
  for (const [key, value] of Object.entries(metadata)) {
    if (!form.elements[key]) continue;
    form.elements[key].value = Array.isArray(value) ? value.join(', ') : value;
  }
}

function metadataFromForm() {
  const data = Object.fromEntries(new FormData(form));
  data.tags = data.tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean);
  return data;
}

function renderDependencies(data) {
  dependenciesElement.innerHTML = data.dependencies.map((path) => `<label class="dependency"><input type="checkbox" value="${escapeHtml(path)}" checked /><span><strong>${escapeHtml(path.split('/').pop())}</strong><small>${escapeHtml(path)}</small></span></label>`).join('');
  dependencyBox.classList.toggle('hidden', !data.dependencies.length);
  const warnings = [];
  if (data.unresolved.length) warnings.push(`找不到关联笔记：${data.unresolved.join('、')}`);
  if (data.ambiguous.length) warnings.push(`存在同名笔记：${data.ambiguous.map((item) => item.target).join('、')}`);
  warningBox.textContent = warnings.join('\n');
  warningBox.classList.toggle('hidden', !warnings.length);
  document.querySelector('#publish-button').disabled = Boolean(warnings.length);
}

async function selectNote(path) {
  try {
    status('正在读取笔记…', 'working');
    current = await api(`/api/note?path=${encodeURIComponent(path)}`);
    setForm(current.metadata);
    renderDependencies(current);
    document.querySelector('#source-path').textContent = current.path;
    document.querySelector('#editor-title').textContent = current.metadata.title;
    welcome.classList.add('hidden');
    editor.classList.remove('hidden');
    renderList();
    await refreshPreview();
  } catch (error) { status(error.message, 'error'); }
}

async function refreshPreview() {
  if (!current) return;
  try {
    status('正在生成预览…', 'working');
    const data = await api('/api/preview', { method: 'POST', body: JSON.stringify({ path: current.path, metadata: metadataFromForm() }) });
    previewElement.innerHTML = `<header class="preview-article-head"><span>${escapeHtml(data.metadata.category)}</span><h1>${escapeHtml(data.metadata.title)}</h1><p>${escapeHtml(data.metadata.description)}</p></header>${data.html}`;
    renderDependencies(data);
    status('预览已更新。', 'success');
  } catch (error) { status(error.message, 'error'); }
}

function selectedDependencies() {
  return [...dependenciesElement.querySelectorAll('input:checked')].map((input) => input.value);
}

function status(message, kind = '') {
  statusElement.textContent = message;
  statusElement.className = `status ${kind}`;
  if (kind !== 'push-error') retryButton.classList.add('hidden');
}

async function requestPublish() {
  if (!form.reportValidity() || !current) return;
  await refreshPreview();
  const required = current.dependencies ?? [];
  const selected = selectedDependencies();
  const omitted = required.filter((item) => !selected.includes(item));
  if (omitted.length) return status(`必须勾选关联笔记，或先移除正文中的链接：${omitted.join('、')}`, 'error');
  const metadata = metadataFromForm();
  document.querySelector('#confirm-summary').textContent = selected.length
    ? `将公开《${metadata.title}》，并同时公开 ${selected.length} 篇关联笔记。`
    : `将公开《${metadata.title}》。`;
  confirmDialog.showModal();
}

async function publish() {
  confirmDialog.close();
  const button = document.querySelector('#publish-button');
  button.disabled = true;
  try {
    status('正在检查、构建并推送，请不要关闭窗口…', 'working');
    const metadata = metadataFromForm();
    const result = await api('/api/publish', {
      method: 'POST',
      body: JSON.stringify({ path: current.path, metadata, dependencies: selectedDependencies(), commitMessage: `Publish ${metadata.title}` }),
    });
    status(`发布成功：${result.files.join('、')}。GitHub Pages 正在自动更新。`, 'success');
    await loadNotes();
  } catch (error) {
    if (error.committed) {
      status(`本地提交成功，但推送失败：${error.message}`, 'push-error error');
      retryButton.classList.remove('hidden');
    }
    else status(`发布已取消并回滚：${error.message}`, 'error');
  } finally { button.disabled = false; }
}

async function retryPush() {
  retryButton.disabled = true;
  try {
    status('正在重新连接 GitHub…', 'working');
    await api('/api/retry-push', { method: 'POST', body: '{}' });
    status('推送成功，GitHub Pages 正在自动更新。', 'success');
  } catch (error) {
    status(`重试失败：${error.message}`, 'push-error error');
    retryButton.classList.remove('hidden');
  } finally { retryButton.disabled = false; }
}

searchInput.addEventListener('input', renderList);
document.querySelector('#refresh').addEventListener('click', loadNotes);
document.querySelector('#preview-button').addEventListener('click', refreshPreview);
document.querySelector('#publish-button').addEventListener('click', requestPublish);
document.querySelector('#dialog-publish').addEventListener('click', (event) => { event.preventDefault(); publish(); });
retryButton.addEventListener('click', retryPush);
form.addEventListener('input', () => status('属性已修改，发布前会重新生成预览。'));
loadNotes().catch((error) => status(error.message, 'error'));
