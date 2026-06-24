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
const family_single_line = document.getElementById('family-single-line');
const family_switcher = document.getElementById('family-switcher');
const family_switch_select = document.getElementById('family-switch-select');
const add_family_toggle_btn = document.getElementById('add-family-toggle-btn');
const family_info_section = document.getElementById('family-info-section');
const add_family_section = document.getElementById('add-family-section');


function openFamilyModal() {
  family_modal_error.classList.add('hidden');
  family_in_view.classList.add('hidden');
  family_out_view.classList.add('hidden');
  showFamilyInfo(); // always reset to family-info state on open
  document.getElementById('family-modal-loader').classList.remove('hidden');
  family_modal.classList.remove('hidden');
  socket.emit('request-family-info'); // server replies family-info or no-family
}

function closeFamilyModal() {
  family_modal.classList.add('hidden');
}

manage_family_btn.addEventListener('click', openFamilyModal);
document.getElementById('banner-join-btn').addEventListener('click', openFamilyModal);
document.getElementById('banner-close-btn').addEventListener('click', () => {
  document.getElementById('no-family-banner').style.display = 'none';
});
document.getElementById('close-family-modal-btn').addEventListener('click', closeFamilyModal);
document.getElementById('close-family-modal-btn-2').addEventListener('click', closeFamilyModal);


function renderInFamily(info) {
  document.getElementById('family-modal-loader').classList.add('hidden');
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
  renderFamilySwitcher(info);
}

// Show a dropdown to switch families only when the user belongs to more than
// one; otherwise just show the plain "You're in <family>" line.
function renderFamilySwitcher(info) {
  const families = info.families || [];
  if (families.length > 1) {
    family_single_line.classList.add('hidden');
    family_switcher.classList.remove('hidden');
    // Build options with the DOM API so family names (user input) can't inject markup.
    family_switch_select.innerHTML = '';
    families.forEach((f) => family_switch_select.add(new Option(f.name, f.id)));
    family_switch_select.value = info.active_family_id || info.id;
  } else {
    family_switcher.classList.add('hidden');
    family_single_line.classList.remove('hidden');
  }
}

function showFamilyInfo() {
  family_info_section.classList.remove('hidden');
  add_family_section.classList.add('hidden');
  add_family_toggle_btn.textContent = 'Join or create another family';
  document.getElementById('add-join-family-code').value = '';
  document.getElementById('add-create-family-name').value = '';
  family_modal_error.classList.add('hidden');
}

function showAddFamily() {
  family_info_section.classList.add('hidden');
  add_family_section.classList.remove('hidden');
  add_family_toggle_btn.textContent = '← Back to family';
}

add_family_toggle_btn.addEventListener('click', () => {
  if (add_family_section.classList.contains('hidden')) {
    showAddFamily();
  } else {
    showFamilyInfo();
  }
});

// Refetch every view's data so it reflects the newly active family.
function refreshAllForActiveFamily() {
  requestTodayData();
  socket.emit('request-family-events-and-tasks');
  socket.emit('request-family-members');
  socket.emit('get-messages');
}

function renderNoFamily() {
  document.getElementById('family-modal-loader').classList.add('hidden');
  family_in_view.classList.add('hidden');
  family_out_view.classList.remove('hidden');
}


socket.on('family-info', renderInFamily);
socket.on('no-family', renderNoFamily); // also handled in main.js (shows the banner)

socket.on('family-joined', (info) => {
  const banner = document.getElementById('no-family-banner');
  if (banner) banner.style.display = 'none';
  renderInFamily(info);
  setPrivacyTogglesVisible(true);
  showFamilyInfo(); // return to family info view after joining
  document.getElementById('create-family-name').value = '';
  document.getElementById('join-family-code').value = '';
  refreshAllForActiveFamily();
});

// Active family changed (via the dropdown, or auto-fallback after leaving one).
socket.on('family-switched', (info) => {
  const banner = document.getElementById('no-family-banner');
  if (banner) banner.style.display = 'none';
  renderInFamily(info);
  setPrivacyTogglesVisible(true);
  refreshAllForActiveFamily();
});

family_switch_select.addEventListener('change', () => {
  family_modal_error.classList.add('hidden');
  socket.emit('switch-family', family_switch_select.value);
});

socket.on('family-error', (msg) => {
  family_modal_error.textContent = msg;
  family_modal_error.classList.remove('hidden');
});

socket.on('left-family', () => {
  const banner = document.getElementById('no-family-banner');
  if (banner) banner.style.display = 'block';
  renderNoFamily();
  setPrivacyTogglesVisible(false);
  // Today + family views are now empty (no family) — refresh them. Also clear
  // the ping recipient dropdown (server returns [] when you're family-less).
  requestTodayData();
  socket.emit('request-family-events-and-tasks');
  socket.emit('request-family-members');
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


// "Join or create another family" forms, shown while already in a family.
document.getElementById('addJoinFamilyForm').addEventListener('submit', (e) => {
  e.preventDefault();
  family_modal_error.classList.add('hidden');
  socket.emit('join-family', document.getElementById('add-join-family-code').value);
});

document.getElementById('addCreateFamilyForm').addEventListener('submit', (e) => {
  e.preventDefault();
  family_modal_error.classList.add('hidden');
  socket.emit('create-family', document.getElementById('add-create-family-name').value);
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
