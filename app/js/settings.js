const settingsModal = document.getElementById('settingsModal');
const openSettingsBtn = document.getElementById('open-settings-btn');

openSettingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  userDropdown.classList.add('hidden');
  openSettingsModal();
});

document.getElementById('close-settings-modal-btn').addEventListener('click', closeSettingsModal);
settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) closeSettingsModal();
});

function openSettingsModal() {
  document.getElementById('settings-dark-mode').checked = document.body.classList.contains('dark-mode');
  refreshPushToggle();
  socket.emit('get-external-calendars');
  settingsModal.classList.remove('hidden');
}

function closeSettingsModal() {
  settingsModal.classList.add('hidden');
}

async function refreshPushToggle() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    document.getElementById('settings-push-toggle').disabled = true;
    return;
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  document.getElementById('settings-push-toggle').checked = !!sub;
}

// Populate the modal when the server sends persisted settings.
socket.on('user-settings', (settings) => {
  // Account section
  const avatarImg = document.getElementById('settings-avatar-img');
  const avatarFallback = document.getElementById('settings-avatar-fallback');
  document.getElementById('settings-display-name').textContent = myDisplayName || '';
  document.getElementById('settings-email').textContent = settings.email || '';

  if (settings.avatar_url) {
    avatarImg.src = settings.avatar_url;
    avatarImg.onerror = () => {
      avatarImg.classList.add('hidden');
      avatarFallback.textContent = (myDisplayName || '?').charAt(0).toUpperCase();
      avatarFallback.classList.remove('hidden');
    };
    avatarImg.classList.remove('hidden');
    avatarFallback.classList.add('hidden');
  } else {
    avatarImg.classList.add('hidden');
    avatarFallback.textContent = (myDisplayName || '?').charAt(0).toUpperCase();
    avatarFallback.classList.remove('hidden');
  }

  // Item defaults
  document.getElementById('settings-default-private').checked = !!settings.default_is_private;
  document.getElementById('settings-default-delete').checked = !!settings.default_delete_at_day_end;

  // Landing tab
  document.getElementById('settings-landing-tab').value = settings.default_landing_tab || 'today';

  // Weather ZIP
  if (settings.weather_zip) {
    document.getElementById('settings-weather-zip').value = settings.weather_zip;
  }

  // Seed item-creation modal defaults
  const eventDeleteToggle = document.getElementById('eventForm') && document.getElementById('eventForm').querySelector('input[name="deleteAtEnd"]');
  const taskDeleteToggle  = document.getElementById('taskForm')  && document.getElementById('taskForm').querySelector('input[name="deleteAtEnd"]');
  const cardDeleteToggle  = document.getElementById('cardForm')  && document.getElementById('cardForm').querySelector('input[name="deleteAtEnd"]');
  if (eventDeleteToggle) eventDeleteToggle.checked = !!settings.default_delete_at_day_end;
  if (taskDeleteToggle)  taskDeleteToggle.checked  = !!settings.default_delete_at_day_end;
  if (cardDeleteToggle)  cardDeleteToggle.checked  = !!settings.default_delete_at_day_end;

  const eventPrivacyToggle = document.getElementById('event-privacy-toggle');
  const taskPrivacyToggle  = document.getElementById('task-privacy-toggle');
  const cardPrivacyToggle  = document.getElementById('card-privacy-toggle');
  if (eventPrivacyToggle) eventPrivacyToggle.checked = !!settings.default_is_private;
  if (taskPrivacyToggle)  taskPrivacyToggle.checked  = !!settings.default_is_private;
  if (cardPrivacyToggle)  cardPrivacyToggle.checked  = !!settings.default_is_private;

  // Kick off weather (only on first load)
  if (!window._weatherInitialised) {
    window._weatherInitialised = true;
    if (window.initWeather) window.initWeather(settings.weather_zip || null);
  }

  // Apply saved landing tab once, on the first settings receipt after page load
  if (!window._settingsApplied) {
    window._settingsApplied = true;
    const tab = settings.default_landing_tab || 'today';
    if (tab === 'ping' && ping_btn) ping_btn.click();
    else if (tab === 'family' && family_btn) family_btn.click();
    // 'today' is the default — no click needed
  }
});

// Push notification toggle
document.getElementById('settings-push-toggle').addEventListener('change', async (e) => {
  const hint = document.getElementById('settings-push-hint');
  hint.classList.add('hidden');

  if (e.target.checked) {
    const ok = await ensurePushSubscribed();
    if (!ok) {
      e.target.checked = false;
      hint.textContent = Notification.permission === 'denied'
        ? 'Notifications are blocked. Enable them in your browser/device settings.'
        : 'Could not enable notifications.';
      hint.classList.remove('hidden');
    }
  } else {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        socket.emit('delete-push-subscription', endpoint);
      }
    }
  }
});

// Item defaults — save on toggle change
['settings-default-private', 'settings-default-delete'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => {
    socket.emit('save-user-settings', {
      default_is_private: document.getElementById('settings-default-private').checked,
      default_delete_at_day_end: document.getElementById('settings-default-delete').checked,
    });
  });
});

// Dark mode — mirrors the header toggle
document.getElementById('settings-dark-mode').addEventListener('change', (e) => {
  setDarkMode(e.target.checked);
  // setDarkMode already syncs the header toggle (darkModeToggle)
});

// Landing tab — save on change
document.getElementById('settings-landing-tab').addEventListener('change', (e) => {
  socket.emit('save-user-settings', { default_landing_tab: e.target.value });
});

// Weather ZIP — save and reload weather on button click
document.getElementById('settings-zip-save-btn').addEventListener('click', () => {
  const zip = document.getElementById('settings-weather-zip').value.trim();
  if (zip && !/^\d{5}$/.test(zip)) {
    alert('Please enter a valid 5-digit US ZIP code.');
    return;
  }
  socket.emit('save-user-settings', { weather_zip: zip || null });
  if (window.initWeather) window.initWeather(zip || null);
});

// Sign out from settings modal
document.getElementById('settings-signout-btn').addEventListener('click', async () => {
  socket.disconnect();
  await _supabase.auth.signOut();
  window.location.href = '/signin';
});


// ---- External Calendars ----

function formatSyncTime(isoString) {
  if (!isoString) return 'never synced';
  const d = new Date(isoString);
  return `Last synced ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function renderExternalCalendars(calendars) {
  const list = document.getElementById('ext-cal-list');
  list.innerHTML = '';
  if (!calendars || calendars.length === 0) return;

  calendars.forEach(cal => {
    const li = document.createElement('li');
    li.className = 'ext-cal-item';
    li.innerHTML = `
      <div class="ext-cal-item-header">
        <div class="ext-cal-item-info">
          <span class="ext-cal-item-name">${cal.name}</span>
          <span class="ext-cal-item-synced">${formatSyncTime(cal.last_synced_at)}</span>
        </div>
        <button class="ext-cal-remove-btn" data-id="${cal.id}" title="Remove calendar">✕</button>
      </div>
      <div class="ext-cal-defaults">
        <div class="ext-cal-default-row">
          <span class="ext-cal-default-label">Private by default</span>
          <label class="switch settings-switch">
            <input type="checkbox" class="ext-cal-private-toggle" ${cal.default_is_private ? 'checked' : ''} />
            <span class="slider"></span>
          </label>
        </div>
        <div class="ext-cal-default-row">
          <span class="ext-cal-default-label">Auto-delete at 12 AM</span>
          <label class="switch settings-switch">
            <input type="checkbox" class="ext-cal-delete-toggle" ${cal.default_delete_at_day_end ? 'checked' : ''} />
            <span class="slider"></span>
          </label>
        </div>
      </div>
    `;
    li.querySelector('.ext-cal-remove-btn').addEventListener('click', () => {
      socket.emit('remove-external-calendar', cal.id);
    });

    const privateToggle = li.querySelector('.ext-cal-private-toggle');
    const deleteToggle = li.querySelector('.ext-cal-delete-toggle');
    const saveDefaults = () => {
      socket.emit('update-calendar-defaults', cal.id, privateToggle.checked, deleteToggle.checked);
    };
    privateToggle.addEventListener('change', saveDefaults);
    deleteToggle.addEventListener('change', saveDefaults);

    list.appendChild(li);
  });
}

socket.on('external-calendars-list', renderExternalCalendars);

socket.on('external-calendar-added', () => {
  document.getElementById('ext-cal-name').value = '';
  document.getElementById('ext-cal-url').value = '';
  const btn = document.getElementById('ext-cal-add-btn');
  btn.disabled = false;
  btn.textContent = 'Connect';
  const status = document.getElementById('ext-cal-status');
  status.textContent = 'Calendar connected!';
  status.classList.add('ext-cal-success');
  status.classList.remove('hidden');
  setTimeout(() => status.classList.add('hidden'), 3000);
});

socket.on('external-calendar-error', (msg) => {
  const errEl = document.getElementById('ext-cal-error');
  const btn = document.getElementById('ext-cal-add-btn');
  btn.disabled = false;
  btn.textContent = 'Connect';
  errEl.textContent = msg;
  errEl.classList.remove('hidden');
});

document.getElementById('ext-cal-add-btn').addEventListener('click', () => {
  const name = document.getElementById('ext-cal-name').value.trim();
  const url = document.getElementById('ext-cal-url').value.trim();
  const errEl = document.getElementById('ext-cal-error');
  errEl.classList.add('hidden');

  if (!name) { errEl.textContent = 'Please enter a calendar name.'; errEl.classList.remove('hidden'); return; }
  if (!url)  { errEl.textContent = 'Please paste the ICS URL.'; errEl.classList.remove('hidden'); return; }

  const btn = document.getElementById('ext-cal-add-btn');
  btn.disabled = true;
  btn.textContent = 'Connecting…';
  socket.emit('add-external-calendar', name, url);
});
