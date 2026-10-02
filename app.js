(function () {
  'use strict';

  const STORAGE = {
    content: 'mdreader.content',
    name: 'mdreader.name',
    mode: 'mdreader.mode',
    theme: 'mdreader.theme',
    toc: 'mdreader.toc',
  };

  const SAMPLE = `# Welcome to Markdown Reader

Open a \`.md\` file with **Open**, drag & drop one onto the window, or just start typing.

## Features

- Live preview with GitHub-flavored Markdown
- Syntax highlighting for code blocks
- Edit / Split / Read modes
- Table of contents
- Light and dark themes
- Save as \`.md\` or export to standalone HTML
- Your draft is kept in the browser between sessions

## Example

> Blockquotes look like this.

| Shortcut | Action |
|----------|--------|
| Ctrl+O   | Open file |
| Ctrl+S   | Save as .md |
| Ctrl+E   | Cycle view mode |

\`\`\`js
function greet(name) {
  return \`Hello, \${name}!\`;
}
\`\`\`

- [x] Write Markdown
- [ ] Read it beautifully
`;

  const $ = (sel) => document.querySelector(sel);
  const editor = $('#editor');
  const preview = $('#preview');
  const previewPane = $('#previewPane');
  const main = $('#main');
  const toc = $('#toc');
  const status = $('#status');
  const docTitle = $('#docTitle');
  const fileInput = $('#fileInput');
  const dropOverlay = $('#dropOverlay');

  let fileName = 'Untitled.md';

  // localStorage can throw (private mode, blocked storage) — never let that break the app.
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* ignore */ } },
  };

  // ---------- Markdown rendering ----------

  marked.setOptions({ gfm: true, breaks: false });

  function slugify(text, used) {
    let base = text.toLowerCase().trim()
      .replace(/<[^>]+>/g, '')
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-') || 'section';
    let slug = base;
    let i = 1;
    while (used.has(slug)) slug = `${base}-${i++}`;
    used.add(slug);
    return slug;
  }

  function render() {
    const html = DOMPurify.sanitize(marked.parse(editor.value), { ADD_ATTR: ['target'] });
    preview.innerHTML = html;

    preview.querySelectorAll('pre code').forEach((block) => hljs.highlightElement(block));

    preview.querySelectorAll('a[href]').forEach((a) => {
      if (/^https?:/i.test(a.getAttribute('href'))) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      }
    });

    buildToc();
    updateStatus();
  }

  function buildToc() {
    const used = new Set();
    const headings = preview.querySelectorAll('h1, h2, h3, h4, h5, h6');
    toc.innerHTML = '';
    if (!headings.length) {
      toc.innerHTML = '<div class="empty">No headings</div>';
      return;
    }
    headings.forEach((h) => {
      h.id = slugify(h.textContent, used);
      const level = Number(h.tagName[1]);
      const a = document.createElement('a');
      a.href = `#${h.id}`;
      a.textContent = h.textContent;
      a.style.paddingLeft = `${6 + (level - 1) * 12}px`;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        if (main.classList.contains('mode-edit')) setMode('split');
        h.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      toc.appendChild(a);
    });
  }

  function updateStatus() {
    const text = editor.value;
    const words = (text.match(/\S+/g) || []).length;
    const lines = text ? text.split('\n').length : 0;
    const minutes = Math.max(1, Math.round(words / 200));
    status.textContent = `${words} words · ${text.length} characters · ${lines} lines · ~${minutes} min read`;
  }

  let renderTimer;
  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      render();
      store.set(STORAGE.content, editor.value);
    }, 120);
  }

  // ---------- Files ----------

  function setFileName(name) {
    fileName = name || 'Untitled.md';
    docTitle.textContent = fileName;
    document.title = `${fileName} — Markdown Reader`;
    store.set(STORAGE.name, fileName);
  }

  function loadFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      editor.value = reader.result;
      setFileName(file.name);
      store.set(STORAGE.content, editor.value);
      render();
      previewPane.scrollTop = 0;
      if (main.classList.contains('mode-edit')) setMode('read');
    };
    reader.onerror = () => alert(`Could not read "${file.name}".`);
    reader.readAsText(file);
  }

  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function saveMarkdown() {
    const name = /\.(md|markdown|mdown|txt)$/i.test(fileName) ? fileName : `${fileName}.md`;
    download(name, editor.value, 'text/markdown;charset=utf-8');
  }

  function exportHtml() {
    // Inline the app stylesheet; when opened via file:// some browsers block reading cssRules,
    // so fall back to linking the stylesheet by its absolute URL.
    const appSheet = Array.from(document.styleSheets).find((s) => s.href && s.href.endsWith('style.css'));
    let css = '';
    let cssLink = '';
    try { css = Array.from(appSheet.cssRules).map((r) => r.cssText).join('\n'); }
    catch { cssLink = appSheet ? `<link rel="stylesheet" href="${appSheet.href}">` : ''; }
    const theme = document.documentElement.dataset.theme || 'light';
    const hljsHref = theme === 'dark' ? $('#hljs-dark').href : $('#hljs-light').href;
    const title = fileName.replace(/\.[^.]+$/, '');
    const html = `<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="${hljsHref}">
${cssLink}
<style>${css}\nbody{display:block;overflow:auto}</style>
</head>
<body>
<article class="markdown-body">
${preview.innerHTML}
</article>
</body>
</html>`;
    download(`${title}.html`, html, 'text/html;charset=utf-8');
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- View mode, theme, TOC ----------

  const MODES = ['edit', 'split', 'read'];

  function setMode(mode) {
    if (!MODES.includes(mode)) mode = 'split';
    main.classList.remove(...MODES.map((m) => `mode-${m}`));
    main.classList.add(`mode-${mode}`);
    document.querySelectorAll('.segmented button').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
    store.set(STORAGE.mode, mode);
  }

  function currentMode() {
    return MODES.find((m) => main.classList.contains(`mode-${m}`)) || 'split';
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    $('#hljs-light').disabled = theme === 'dark';
    $('#hljs-dark').disabled = theme !== 'dark';
    store.set(STORAGE.theme, theme);
  }

  function setTocVisible(visible) {
    toc.hidden = !visible;
    store.set(STORAGE.toc, visible ? '1' : '0');
  }

  // ---------- Synced scrolling (split mode) ----------

  let scrollLock = null;
  function syncScroll(from, to) {
    if (currentMode() !== 'split' || scrollLock === to) return;
    const max = from.scrollHeight - from.clientHeight;
    if (max <= 0) return;
    scrollLock = from;
    to.scrollTop = (from.scrollTop / max) * (to.scrollHeight - to.clientHeight);
    requestAnimationFrame(() => { scrollLock = null; });
  }

  // ---------- Events ----------

  editor.addEventListener('input', scheduleRender);
  editor.addEventListener('scroll', () => syncScroll(editor, previewPane));
  previewPane.addEventListener('scroll', () => syncScroll(previewPane, editor));

  // Tab inserts spaces instead of moving focus.
  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      const { selectionStart: s, selectionEnd: end } = editor;
      editor.setRangeText('    ', s, end, 'end');
      scheduleRender();
    }
  });

  fileInput.addEventListener('change', () => {
    loadFile(fileInput.files[0]);
    fileInput.value = '';
  });

  $('#saveBtn').addEventListener('click', saveMarkdown);
  $('#exportBtn').addEventListener('click', exportHtml);
  $('#pdfBtn').addEventListener('click', () => window.print());

  // PDF export goes through the print dialog ("Save as PDF"). While printing, use the light
  // code-highlight theme and set the title, which browsers use as the default PDF file name.
  let titleBeforePrint = null;
  window.addEventListener('beforeprint', () => {
    titleBeforePrint = document.title;
    document.title = fileName.replace(/\.[^.]+$/, '');
    $('#hljs-light').disabled = false;
    $('#hljs-dark').disabled = true;
  });
  window.addEventListener('afterprint', () => {
    if (titleBeforePrint !== null) document.title = titleBeforePrint;
    setTheme(document.documentElement.dataset.theme || 'light');
  });
  $('#tocBtn').addEventListener('click', () => setTocVisible(toc.hidden));
  $('#themeBtn').addEventListener('click', () => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });
  document.querySelectorAll('.segmented button').forEach((b) => {
    b.addEventListener('click', () => setMode(b.dataset.mode));
  });

  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === 's') { e.preventDefault(); saveMarkdown(); }
    else if (key === 'o') { e.preventDefault(); fileInput.click(); }
    else if (key === 'e') {
      e.preventDefault();
      setMode(MODES[(MODES.indexOf(currentMode()) + 1) % MODES.length]);
    }
  });

  // Drag & drop
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    dragDepth++;
    dropOverlay.hidden = false;
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dropOverlay.hidden = true;
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    dropOverlay.hidden = true;
    const file = e.dataTransfer && e.dataTransfer.files[0];
    if (file) loadFile(file);
  });

  // ---------- Init ----------

  const savedTheme = store.get(STORAGE.theme)
    || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  setTheme(savedTheme);
  setMode(store.get(STORAGE.mode) || 'split');
  setTocVisible(store.get(STORAGE.toc) === '1');
  setFileName(store.get(STORAGE.name));
  const saved = store.get(STORAGE.content);
  editor.value = saved !== null ? saved : SAMPLE;
  render();
})();
