const new_card_button = document.querySelector('.new-card-button');
const close_new_card_modal_button = document.querySelector('#close-card-modal-btn');
const card_form = document.getElementById('cardForm');
const delete_card_at_end_of_day_toggle = card_form.querySelector('input[name="deleteAtEnd"]');
const card_privacy_toggle = document.getElementById('card-privacy-toggle');
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
    // Keep the raw File references and let the actual read happen during the
    // upload's fetch. (Do NOT eagerly read the bytes here — on iOS an
    // iCloud-optimized photo isn't on-device yet, and forcing a read at
    // selection time stalls/fails, leaving nothing to upload.)
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

  socket.emit('new-card', title, description, delete_card_at_end_of_day_toggle.checked, card_privacy_toggle.checked);
  close_new_card_modal();
  this.reset();
  attached_file_name.textContent = '';
  // pendingFilesUpload stays set — cleared after upload in card-created handler
});


socket.on('card-created', async (cardId) => {
  if (pendingFilesUpload.length === 0) return;

  const filesToUpload = pendingFilesUpload;
  pendingFilesUpload = [];

  // Show a loading pill immediately while files upload
  const card = document.getElementById(cardId);
  let loadingBtn = null;
  if (card) {
    loadingBtn = document.createElement('button');
    loadingBtn.className = 'card-attachment-btn card-attachment-loading';
    loadingBtn.disabled = true;
    loadingBtn.innerHTML = `<div class="attachment-spinner"></div>Uploading…`;
    card.querySelector('.card-content').appendChild(loadingBtn);
  }

  // The loading pill must come off whatever happens below — one left behind is
  // indistinguishable from a real attachment on the card.
  let uploaded, errors;
  try {
    ({ uploaded, errors } = await uploadCardFiles(filesToUpload, cardId));
  } finally {
    if (loadingBtn) loadingBtn.remove();
  }

  reportUploadErrors(errors);

  if (uploaded.length === 0) return;

  cardFilesMap[cardId] = uploaded;

  updateCardFilesPill(cardId, uploaded);

  // The family already rendered this card (from the new-card broadcast) before
  // these files existed. Tell the server so it can push the files to them and
  // they can show the pill too.
  socket.emit('card-files-attached', cardId);
});
