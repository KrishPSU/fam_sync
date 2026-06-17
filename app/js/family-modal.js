const manage_family_btn = document.getElementById('manage-family-btn');
const family_modal = document.getElementById('familyModal');
const family_in_view = document.getElementById('family-in-view');
const family_out_view = document.getElementById('family-out-view');
const family_name_display = document.getElementById('family-name-display');
const invite_code_display = document.getElementById('invite-code-display');
const family_members_list = document.getElementById('family-members-list');
const copy_code_btn = document.getElementById('copy-code-btn');
const create_family_form = document.getElementById('createFamilyForm');
const join_family_form = document.getElementById('joinFamilyForm');
const family_modal_error = document.getElementById('family-modal-error');
const leave_family_btn = document.getElementById('leave-family-btn');


function openFamilyModal() {
  family_modal_error.classList.add('hidden');
  family_modal.classList.remove('hidden');
  socket.emit('request-family-info'); // server replies family-info or no-family
}

function closeFamilyModal() {
  family_modal.classList.add('hidden');
}

manage_family_btn.addEventListener('click', openFamilyModal);
document.getElementById('close-family-modal-btn').addEventListener('click', closeFamilyModal);
document.getElementById('close-family-modal-btn-2').addEventListener('click', closeFamilyModal);


function renderInFamily(info) {
  family_out_view.classList.add('hidden');
  family_in_view.classList.remove('hidden');
  family_name_display.textContent = info.name;
  invite_code_display.textContent = info.invite_code;
  family_members_list.innerHTML = '';
  (info.members || []).forEach((m) => {
    const li = document.createElement('li');
    li.textContent = m.display_name + (m.id === me ? ' (you)' : '');
    family_members_list.appendChild(li);
  });
}

function renderNoFamily() {
  family_in_view.classList.add('hidden');
  family_out_view.classList.remove('hidden');
}


socket.on('family-info', renderInFamily);
socket.on('no-family', renderNoFamily); // also handled in main.js (shows the banner)

socket.on('family-joined', (info) => {
  const banner = document.getElementById('no-family-banner');
  if (banner) banner.style.display = 'none';
  renderInFamily(info);
  // Now that we belong to a family, (re)load the user + family data.
  socket.emit('request-data-for-person');
  socket.emit('request-family-events-and-tasks');
});

socket.on('family-error', (msg) => {
  family_modal_error.textContent = msg;
  family_modal_error.classList.remove('hidden');
});

socket.on('left-family', () => {
  const banner = document.getElementById('no-family-banner');
  if (banner) banner.style.display = 'block';
  renderNoFamily();
  // Today + family views are now empty (no family) — refresh them.
  socket.emit('request-data-for-person');
  socket.emit('request-family-events-and-tasks');
});


leave_family_btn.addEventListener('click', () => {
  if (!confirm('Leave this family? You will no longer see its events, tasks, or files.')) return;
  socket.emit('leave-family');
});


create_family_form.addEventListener('submit', (e) => {
  e.preventDefault();
  family_modal_error.classList.add('hidden');
  socket.emit('create-family', document.getElementById('create-family-name').value);
});

join_family_form.addEventListener('submit', (e) => {
  e.preventDefault();
  family_modal_error.classList.add('hidden');
  socket.emit('join-family', document.getElementById('join-family-code').value);
});


copy_code_btn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(invite_code_display.textContent);
    const original = copy_code_btn.textContent;
    copy_code_btn.textContent = 'Copied!';
    setTimeout(() => { copy_code_btn.textContent = original; }, 1500);
  } catch (err) {
    console.error('Copy failed', err);
  }
});
