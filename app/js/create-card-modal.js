const new_card_button = document.querySelector('.new-card-button');
const close_new_card_modal_button = document.querySelector('#close-card-modal-btn');
const card_form = document.getElementById('cardForm');
const delete_card_at_end_of_day_toggle = card_form.querySelector('input[name="deleteAtEnd"]');
const card_file_input = document.getElementById('card-file-input');
const attach_file_btn = document.getElementById('attach-file-btn');
const attached_file_name = document.getElementById('attached-file-name');

let pendingFilesUpload = [];


new_card_button.addEventListener('click', () => {
  open_new_card_modal();
});
close_new_card_modal_button.addEventListener('click', () => {
  close_new_card_modal();
});

attach_file_btn.addEventListener('click', () => {
  card_file_input.click();
});

card_file_input.addEventListener('change', function() {
  if (this.files && this.files.length > 0) {
    pendingFilesUpload = Array.from(this.files);
    attached_file_name.textContent = this.files.length === 1
      ? this.files[0].name
      : `${this.files.length} files selected`;
  } else {
    pendingFilesUpload = [];
    attached_file_name.textContent = '';
  }
});


function open_new_card_modal() {
  document.getElementById('cardModal').classList.remove('hidden');
}

function close_new_card_modal() {
  document.getElementById('cardModal').classList.add('hidden');
}


card_form.addEventListener('submit', function(e) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(this));
  let title = data.title;
  let description = document.getElementById('card-description').value;

  socket.emit('new-card', title, description, delete_card_at_end_of_day_toggle.checked);
  close_new_card_modal();
  this.reset();
  attached_file_name.textContent = '';
  // pendingFilesUpload stays set — cleared after upload in card-created handler
});


socket.on('card-created', async (cardId) => {
  if (pendingFilesUpload.length === 0) return;

  const filesToUpload = pendingFilesUpload;
  pendingFilesUpload = [];

  const uploadedFiles = [];

  await Promise.all(filesToUpload.map(async (file) => {
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
        const data = await res.json();
        uploadedFiles.push({ card_id: cardId, file_name: data.fileName, file_url: data.url });
      } else {
        console.error('File upload failed:', await res.text());
      }
    } catch (err) {
      console.error('File upload error:', err);
    }
  }));

  if (uploadedFiles.length === 0) return;

  cardFilesMap[cardId] = uploadedFiles;

  const card = document.getElementById(cardId);
  if (!card) return;

  let btn = card.querySelector('.card-attachment-btn');
  if (!btn) {
    btn = document.createElement('button');
    btn.className = 'card-attachment-btn';
    card.querySelector('.card-content').appendChild(btn);
  }
  btn.dataset.cardId = cardId;
  btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
    ${uploadedFiles.length} file${uploadedFiles.length !== 1 ? 's' : ''}`;
});
