const close_edit_card_modal_button = document.querySelector('#close-edit-card-modal-btn');
const edit_card_form = document.getElementById('editCardForm');
const edit_card_files_list = document.getElementById('edit-card-files-list');
const edit_card_file_input = document.getElementById('edit-card-file-input');
const edit_attach_file_btn = document.getElementById('edit-attach-file-btn');
let currentCardBeingEditedId;

// Attachment staging — reset every time the modal opens. Changes are only
// applied on Save; Cancel/close discards them.
let editOriginalFiles = []; // snapshot of the card's files when the modal opened
let editKeptFiles = [];     // existing files the user has NOT removed
let editNewFiles = [];      // freshly picked File objects, not yet uploaded

close_edit_card_modal_button.addEventListener('click', () => {
  close_edit_card_modal();
});



function openEditCardModal(currentTitle, currentDesc, isPrivate, deleteAtDayEnd) {
  document.getElementById('edit-title').value = currentTitle;
  document.getElementById('edit-desc').value = currentDesc;
  document.getElementById('edit-delete-toggle').checked = !!deleteAtDayEnd;
  document.getElementById('edit-privacy-toggle').checked = !!isPrivate;

  editOriginalFiles = (cardFilesMap[currentCardBeingEditedId] || []).slice();
  editKeptFiles = editOriginalFiles.slice();
  editNewFiles = [];
  renderEditFilesList();

  document.getElementById('editCardModal').classList.remove('hidden');
}

function close_edit_card_modal() {
  document.getElementById('editCardModal').classList.add('hidden');
}


// Draw the staged attachment list: kept existing files + newly picked ones,
// each with a ✕ that stages its removal.
function renderEditFilesList() {
  edit_card_files_list.innerHTML = '';

  editKeptFiles.forEach((file) => {
    const row = document.createElement('div');
    row.className = 'edit-file-row';
    row.innerHTML = `
      <span class="edit-file-name">${file.file_name}</span>
      <button type="button" class="edit-file-remove-btn" data-kind="existing" data-id="${file.id}" aria-label="Remove">✕</button>
    `;
    edit_card_files_list.appendChild(row);
  });

  editNewFiles.forEach((file, index) => {
    const row = document.createElement('div');
    row.className = 'edit-file-row';
    row.innerHTML = `
      <span class="edit-file-name">${file.name}</span>
      <span class="edit-file-new-tag">new</span>
      <button type="button" class="edit-file-remove-btn" data-kind="new" data-index="${index}" aria-label="Remove">✕</button>
    `;
    edit_card_files_list.appendChild(row);
  });
}


edit_attach_file_btn.addEventListener('click', () => {
  edit_card_file_input.click();
});

edit_card_file_input.addEventListener('change', function() {
  if (this.files && this.files.length > 0) {
    editNewFiles.push(...Array.from(this.files));
    renderEditFilesList();
  }
  this.value = ''; // allow re-picking the same file
});

// ✕ on a staged file removes it from the corresponding list (nothing is sent to
// the server until Save).
edit_card_files_list.addEventListener('click', (e) => {
  const btn = e.target.closest('.edit-file-remove-btn');
  if (!btn) return;
  if (btn.dataset.kind === 'existing') {
    editKeptFiles = editKeptFiles.filter(f => String(f.id) !== btn.dataset.id);
  } else {
    editNewFiles.splice(Number(btn.dataset.index), 1);
  }
  renderEditFilesList();
});


edit_card_form.addEventListener('submit', function(e) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(this));
  let title = data.title;
  let description = document.getElementById('edit-desc').value;
  const isPrivate = document.getElementById('edit-privacy-toggle').checked;
  const deleteAtDayEnd = document.getElementById('edit-delete-toggle').checked;

  editCard(currentCardBeingEditedId, title, description, isPrivate, deleteAtDayEnd);
  socket.emit('edit-card', currentCardBeingEditedId, title, description, isPrivate, deleteAtDayEnd);

  applyStagedFileChanges(currentCardBeingEditedId, editOriginalFiles.slice(), editKeptFiles.slice(), editNewFiles.slice());

  close_edit_card_modal();
  this.reset();
  editOriginalFiles = [];
  editKeptFiles = [];
  editNewFiles = [];
  edit_card_files_list.innerHTML = '';
});


// Apply the file diff staged in the Edit modal: delete removed files, upload new
// ones, then reconcile cardFilesMap + the card's pill. Uploads run in the
// background with the same loading buffer as the create flow.
async function applyStagedFileChanges(cardId, original, kept, newFiles) {
  // Deletions: existing files that are no longer kept.
  const removed = original.filter(f => f.id && !kept.some(k => k.id === f.id));
  removed.forEach(f => socket.emit('delete-card-file', f.id));

  cardFilesMap[cardId] = kept;

  if (newFiles.length === 0) {
    updateCardFilesPill(cardId, kept);
    return;
  }

  // Show the uploading buffer while new files go up.
  const card = document.getElementById(cardId);
  let loadingBtn = null;
  if (card) {
    const content = card.querySelector('.card-content');
    const existingPill = content.querySelector('.card-attachment-btn');
    if (existingPill) existingPill.remove();
    loadingBtn = document.createElement('button');
    loadingBtn.className = 'card-attachment-btn card-attachment-loading';
    loadingBtn.disabled = true;
    loadingBtn.innerHTML = `<div class="attachment-spinner"></div>Uploading…`;
    content.appendChild(loadingBtn);
  }

  const uploaded = [];
  await Promise.all(newFiles.map(async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('cardId', cardId);
    try {
      const token = await getToken();
      const res = await fetch('/api/upload-card-file', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      if (res.ok) {
        const d = await res.json();
        uploaded.push({ id: d.id, card_id: cardId, file_name: d.fileName });
      } else {
        console.error('File upload failed:', await res.text());
      }
    } catch (err) {
      console.error('File upload error:', err);
    }
  }));

  if (loadingBtn) loadingBtn.remove();

  const finalFiles = kept.concat(uploaded);
  cardFilesMap[cardId] = finalFiles;
  updateCardFilesPill(cardId, finalFiles);

  if (uploaded.length > 0) socket.emit('card-files-attached', cardId);
}
