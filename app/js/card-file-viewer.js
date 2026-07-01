const cardFileViewerModal = document.getElementById('cardFileViewerModal');
const cardFileViewerBody = document.getElementById('card-file-viewer-body');
const cardFileViewerTitle = document.getElementById('card-file-viewer-title');
const closeCardFileViewerBtn = document.getElementById('close-card-file-viewer-btn');

closeCardFileViewerBtn.addEventListener('click', closeCardFileViewer);

cardFileViewerModal.addEventListener('click', (e) => {
  if (e.target === cardFileViewerModal) closeCardFileViewer();
});

// Blob URLs minted for the files currently on screen — revoked when the viewer
// closes so we don't leak object URLs.
let viewerObjectUrls = [];

function closeCardFileViewer() {
  cardFileViewerModal.classList.add('hidden');
  cardFileViewerBody.innerHTML = '';
  viewerObjectUrls.forEach(u => URL.revokeObjectURL(u));
  viewerObjectUrls = [];
}

function getExt(file) {
  return (file.file_name.split('.').pop() || '').toLowerCase();
}

function isImage(file) {
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(getExt(file));
}

function isPdf(file) {
  return getExt(file) === 'pdf';
}

// The bucket is private, so files are fetched through the authenticated proxy
// (/api/card-file/:id) with the caller's JWT and handed back as a same-origin
// blob URL. <img>/<iframe> can't send an auth header, so this indirection is
// what lets them display a protected file — and the Supabase URL never appears.
async function fileObjectUrl(file) {
  const token = await getToken();
  const res = await fetch('/api/card-file/' + file.id, {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  if (!res.ok) throw new Error('Failed to load file (' + res.status + ')');
  const url = URL.createObjectURL(await res.blob());
  viewerObjectUrls.push(url);
  return url;
}

function openCardFileViewer(cardId) {
  const files = cardFilesMap[cardId] || [];
  cardFileViewerTitle.textContent = `Attachments (${files.length})`;
  cardFileViewerBody.innerHTML = '';

  const others = files.filter(f => !isImage(f) && !isPdf(f));
  const images = files.filter(f => isImage(f));
  const pdfs   = files.filter(f => isPdf(f));

  if (others.length) cardFileViewerBody.appendChild(renderOthersSection(others));
  if (images.length) cardFileViewerBody.appendChild(renderImagesSection(images));
  if (pdfs.length)   cardFileViewerBody.appendChild(renderPdfsSection(pdfs));

  cardFileViewerModal.classList.remove('hidden');
}

// A standalone "Open" link (icon + label). The href is filled in once the file's
// blob URL resolves.
function makeOpenLink() {
  const a = document.createElement('a');
  a.target = '_blank';
  a.rel = 'noopener';
  a.className = 'file-download-link';
  a.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
      <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
    </svg>Open`;
  return a;
}

function wrapSection(label, rowEl) {
  const section = document.createElement('div');
  section.className = 'file-viewer-section';
  const lbl = document.createElement('div');
  lbl.className = 'file-viewer-section-label';
  lbl.textContent = label;
  section.appendChild(lbl);
  section.appendChild(rowEl);
  return section;
}

function renderOthersSection(files) {
  const row = document.createElement('div');
  row.className = 'file-viewer-row';
  files.forEach(file => {
    const item = document.createElement('div');
    item.className = 'file-viewer-other-item';
    item.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <span class="file-viewer-other-name">${file.file_name}</span>
    `;
    const open = makeOpenLink();
    item.appendChild(open);
    row.appendChild(item);
    fileObjectUrl(file).then(url => { open.href = url; }).catch(err => console.error(err));
  });
  return wrapSection('Files', row);
}

function renderImagesSection(files) {
  const row = document.createElement('div');
  row.className = 'file-viewer-row';
  files.forEach(file => {
    const item = document.createElement('div');
    item.className = 'file-viewer-image-item';
    const img = document.createElement('img');
    img.alt = file.file_name;
    img.className = 'file-viewer-image-thumb';
    item.appendChild(img);
    const open = document.createElement('a');
    open.target = '_blank';
    open.rel = 'noopener';
    open.className = 'file-viewer-image-open';
    open.title = file.file_name;
    open.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
        <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
      </svg>`;
    item.appendChild(open);
    row.appendChild(item);
    fileObjectUrl(file).then(url => { img.src = url; open.href = url; }).catch(err => console.error(err));
  });
  return wrapSection('Images', row);
}

function renderPdfsSection(files) {
  const row = document.createElement('div');
  row.className = 'file-viewer-row';
  files.forEach(file => {
    const item = document.createElement('div');
    item.className = 'file-viewer-pdf-item';
    const nameWrap = document.createElement('div');
    nameWrap.className = 'file-viewer-pdf-name';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = file.file_name;
    const open = makeOpenLink();
    nameWrap.appendChild(nameSpan);
    nameWrap.appendChild(open);
    item.appendChild(nameWrap);
    const iframe = document.createElement('iframe');
    iframe.className = 'file-viewer-pdf-iframe';
    iframe.title = file.file_name;
    item.appendChild(iframe);
    row.appendChild(item);
    fileObjectUrl(file).then(url => { iframe.src = url; open.href = url; }).catch(err => console.error(err));
  });
  return wrapSection('PDFs', row);
}

// Delegation — catch clicks on any .card-attachment-btn
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.card-attachment-btn');
  if (btn) openCardFileViewer(btn.dataset.cardId);
});
