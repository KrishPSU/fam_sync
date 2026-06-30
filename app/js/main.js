const socket = io({ autoConnect: false }); // connect only once we have a JWT


const today_btn = document.getElementById('today-button');
const ping_btn = document.getElementById('ping-button');
const family_btn = document.getElementById('family-button');
const ai_btn = document.getElementById('ai-button');

const aiWindow = document.querySelector('.ai-assistant-window');
const closeAiBtn = document.getElementById('close-ai-btn');

ai_btn.addEventListener('click', () => {
  if (aiWindow.classList.contains('hidden')) {
    aiWindow.classList.remove('hidden');
    if (window.innerWidth <= 600) document.body.classList.add('ai-open');
  } else {
    aiWindow.classList.add('hidden');
    document.body.classList.remove('ai-open');
  }
});

closeAiBtn.addEventListener('click', () => {
  aiWindow.classList.add('hidden');
  document.body.classList.remove('ai-open');
});

let me;            // current user's UUID
let myDisplayName; // current user's Google display name
let appStarted = false;

// Bring the app online once we have a confirmed session. Idempotent: the auth
// listener below can fire more than once (initial load, sign-in, restore).
function startApp(session) {
  if (appStarted) return;
  appStarted = true;

  me = session.user.id;
  myDisplayName = session.user.user_metadata?.full_name || session.user.email;

  // Account avatar — Google photo, falling back to the first initial.
  const avatarUrl = session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || '';
  const avatarImg = document.getElementById('user-avatar-img');
  const avatarFallback = document.getElementById('user-avatar-fallback');
  function showInitialFallback() {
    avatarImg.classList.add('hidden');
    avatarFallback.textContent = (myDisplayName || '?').charAt(0).toUpperCase();
    avatarFallback.classList.remove('hidden');
  }
  if (avatarUrl) {
    avatarImg.onerror = showInitialFallback;
    avatarImg.src = avatarUrl;
    avatarImg.classList.remove('hidden');
    avatarFallback.classList.add('hidden');
  } else {
    showInitialFallback();
  }

  // Authenticate the socket handshake with the access token, then connect.
  socket.auth = { token: session.access_token };
  socket.connect();

  requestTodayData();

  // On every launch: if notifications are already granted, silently refresh the
  // saved push subscription (iOS quietly invalidates them, which is the usual
  // reason pings stop arriving); if this is a first-time user, show a one-time
  // prompt inviting them to turn notifications on.
  if (typeof initPushOnLaunch === 'function') initPushOnLaunch();
}

window.addEventListener('load', () => {
  // Single source of truth for auth state. We deliberately do NOT redirect on a
  // one-shot getSession() === null: on a cold PWA launch or a network blip (e.g.
  // right after the server restarts) supabase-js can momentarily lack a session
  // before it restores/refreshes it from storage — that race is what bounced the
  // app to /signin and straight back (the sign-out/sign-in flicker). Gating on
  // the auth events fixes it: INITIAL_SESSION fires once the client has settled,
  // and SIGNED_OUT only fires on a real sign-out or a truly-expired refresh token.
  _supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'INITIAL_SESSION') {
      if (session) startApp(session);
      else window.location.href = '/signin';
    } else if (event === 'SIGNED_IN') {
      if (session) startApp(session);
    } else if (event === 'TOKEN_REFRESHED') {
      if (session) {
        socket.auth = { token: session.access_token };
        if (socket.connected) socket.disconnect();
        socket.connect();
      }
    } else if (event === 'SIGNED_OUT') {
      window.location.href = '/signin';
    }
  });

  // Safety net: if the auth event never arrives (older supabase-js, etc.), boot
  // from the stored session anyway. Never redirects here — that would risk
  // re-introducing the flicker; the INITIAL_SESSION path already handles "no
  // session" once the client has settled.
  setTimeout(async () => {
    if (!appStarted) {
      const session = await getSession();
      if (session) startApp(session);
    }
  }, 2500);
});

// When the server comes back after a restart, socket.io auto-reconnects using
// the token we last set. If that token lapsed while the server was down the
// handshake is rejected and the client would otherwise keep retrying with the
// dead token forever; refresh it so the next retry succeeds (no re-login, no
// page reload). getSession() returns a refreshed token when the old one expired.
socket.on('connect_error', async () => {
  const session = await getSession();
  if (session) socket.auth = { token: session.access_token };
});

// Account dropdown: toggle on avatar click, close when clicking elsewhere.
const userAvatarBtn = document.getElementById('user-avatar-btn');
const userDropdown = document.getElementById('user-dropdown');

userAvatarBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  userDropdown.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
  if (!userDropdown.classList.contains('hidden') &&
      !userDropdown.contains(e.target) &&
      !userAvatarBtn.contains(e.target)) {
    userDropdown.classList.add('hidden');
  }
});

// Sign out: drop the socket, clear the Supabase session, return to sign-in.
document.getElementById('signout-btn').addEventListener('click', async () => {
  socket.disconnect();
  await _supabase.auth.signOut();
  window.location.href = '/signin';
});

function setPrivacyTogglesVisible(visible) {
  ['event-privacy-row', 'task-privacy-row', 'card-privacy-row', 'edit-privacy-row', 'edit-task-privacy-row', 'edit-event-privacy-row'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !visible);
  });
}

socket.on('in-family', () => {
  setPrivacyTogglesVisible(true);
});

// Shown when the signed-in user hasn't been added to a family yet.
socket.on('no-family', () => {
  const banner = document.getElementById('no-family-banner');
  if (banner) banner.style.display = 'block';
  setPrivacyTogglesVisible(false);
});


const my_events_list = document.getElementById('my-events');
const my_tasks_list = document.getElementById('my-tasks');
const my_cards_list = document.getElementById('my-cards');

const cardFilesMap = {};

const LOADER_HTML = '<div class="loader-wrap"><div class="loader"></div></div>';

function requestTodayData() {
  my_events_list.innerHTML = LOADER_HTML;
  my_tasks_list.innerHTML = LOADER_HTML;
  // Send the client's local time-of-day so the server can drop events that
  // have already passed (the server has no reliable notion of the family's tz).
  const now = new Date();
  socket.emit('request-data-for-person', now.getHours() * 60 + now.getMinutes());
}



// "10:00 PM to 11:00 PM" when there's an end time, else just "10:00 PM".
function formatEventTimeLabel(start, end) {
  return end ? `${start} to ${end}` : start;
}

// Inline edit (pencil in a gray box) + delete (✕ on a red box) controls for
// task/event rows. The edit-btn / delete-btn classes drive the existing
// edit/delete click handlers. Imported (synced) events get them too — their
// edits/deletes are persisted server-side so they survive the calendar re-sync.
const ITEM_ACTIONS_HTML =
  `<div class="item-actions">
     <button class="edit-btn" title="Edit" aria-label="Edit"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>
     <button class="delete-btn" title="Delete" aria-label="Delete">✕</button>
   </div>`;

// "Family" pill markup for the user's own non-private tasks/events, so they can
// see at a glance that their family can see the item. Empty when private.
function visibilityPillHTML(isPrivate) {
  return isPrivate ? '' : '<span class="public-pill">Family</span>';
}

// Add or remove the "Family" pill inside `container` to match `isPrivate`,
// inserting it before `beforeEl` when added. Called when a task/event's privacy
// is toggled from its edit modal.
function syncVisibilityPill(container, beforeEl, isPrivate) {
  const existing = container.querySelector('.public-pill');
  if (isPrivate) {
    if (existing) existing.remove();
  } else if (!existing) {
    const pill = document.createElement('span');
    pill.className = 'public-pill';
    pill.textContent = 'Family';
    container.insertBefore(pill, beforeEl);
  }
}

function addEventToList(event, event_id, time, isPrivate, isExternal, deleteAtDayEnd = false, endTime = '') {
  const li_elem = document.createElement('li');
  li_elem.classList.add("event-item");
  li_elem.innerHTML = `
    <div class="event-main">
      ${visibilityPillHTML(isPrivate)}
      <span class="event-text"><strong>${formatEventTimeLabel(time, endTime)}</strong> — ${event}</span>
    </div>
    ${ITEM_ACTIONS_HTML}
  `;
  li_elem.id = event_id;
  li_elem.dataset.isPrivate = isPrivate;
  li_elem.dataset.deleteAtDayEnd = deleteAtDayEnd;
  li_elem.dataset.title = event;
  li_elem.dataset.time = time;
  li_elem.dataset.endTime = endTime || '';
  my_events_list.appendChild(li_elem);
}


function addTaskToList(task, task_id, isComplete, isPrivate, deleteAtDayEnd = false) {
  const completedClass = isComplete ? ' completed' : '';
  const checkedAttr = isComplete ? ' checked' : '';
  const innerHtml = `
    <div class="task-item" data-is-private="${isPrivate}" data-delete-at-day-end="${deleteAtDayEnd}">
      <div class="task${completedClass}" id="${task_id}">
        <div class="round">
          <input type="checkbox" id="cb-${task_id}"${checkedAttr} />
          <label for="cb-${task_id}"></label>
        </div>
        ${visibilityPillHTML(isPrivate)}
        <span class="task-text">${task}</span>
      </div>
      ${ITEM_ACTIONS_HTML}
    </div>
  `;
  my_tasks_list.innerHTML += innerHtml;
}


function addCardToList(title, description, cardOwnerId, ownerName, cardId, files = [], isPrivate = false, deleteAtDayEnd = false, insertAtTop = false) {
  if (files.length > 0) cardFilesMap[cardId] = files;

  const attachmentBtn = files.length > 0
    ? `<button class="card-attachment-btn" data-card-id="${cardId}">
         <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
         ${files.length} file${files.length !== 1 ? 's' : ''}
       </button>`
    : '';

  const pill = (cardOwnerId == me && !isPrivate) ? '<span class="public-pill">Family</span>' : '';
  const section_elem = document.createElement('section');
  let innerHtml;

  if (cardOwnerId == me) {
    innerHtml = `
      <section class="card" id="${cardId}" data-is-private="${isPrivate}" data-delete-at-day-end="${deleteAtDayEnd}">
        <div class="card-top">
          <div class="card-top-left">
            ${pill}
            <h2>${title}</h2>
          </div>
          <button class="dots-button">⋯</button>
          <div class="dots-menu hidden">
            <button class="edit-btn">Edit</button>
            <button class="delete-btn">Delete</button>
          </div>
        </div>
        <div class="card-content">
          <p>${description}</p>
          ${attachmentBtn}
        </div>
      </section>
    `;
  } else {
    innerHtml = `
      <section class="card" id="${cardId}">
        <h2>${title} - ${ownerName || ''}</h2>
        <div class="card-content">
          <p>${description}</p>
          ${attachmentBtn}
        </div>
      </section>
    `;
  }

  section_elem.innerHTML = innerHtml;
  if (insertAtTop) {
    const tasksSection = document.getElementById('tasks');
    const anchor = tasksSection ? tasksSection.nextSibling : null;
    my_cards_list.insertBefore(section_elem, anchor);
  } else {
    my_cards_list.appendChild(section_elem);
  }
}


socket.on('data-for-person', (events, tasks, cards, cardFiles) => {

  my_events_list.innerHTML = "";
  my_tasks_list.innerHTML = "";
  const allCards = my_cards_list.querySelectorAll('.card');
  allCards.forEach((card) => {
    if (card.id != "tasks" && card.id != "events") {
      card.remove();
    }
  });

  if (events.length > 0) {
    sortedEvents = sortEventsForPerson(events);
    sortedEvents.forEach((event) => {
      addEventToList(event.title, event.id, event.time, event.is_private, !!event.external_id, event.delete_at_day_end, event.end_time);
    });
  }

  if (tasks.length > 0) {
    tasks.forEach((task) => {
      addTaskToList(task.title, task.id, task.complete, task.is_private, task.delete_at_day_end);
    });
  }

  if (cards.length > 0) {
    const filesForCard = {};
    if (cardFiles && cardFiles.length > 0) {
      cardFiles.forEach(f => {
        if (!filesForCard[f.card_id]) filesForCard[f.card_id] = [];
        filesForCard[f.card_id].push(f);
      });
    }
    cards.forEach((card) => {
      addCardToList(card.title, card.description, card.user_id, card.owner?.display_name, card.id, filesForCard[card.id] || [], card.is_private, card.delete_at_day_end);
    });
  }
});




let current_active_btn = today_btn;

today_btn.addEventListener('click', () => {
  requestTodayData();
  current_active_btn.classList.remove('active');
  today_btn.classList.add('active');
  current_active_btn = today_btn;
  show(today_wrapper);
  hide(ping_wrapper);
  hide(family_wrapper);
});

ping_btn.addEventListener('click', () => {
  current_active_btn.classList.remove('active');
  ping_btn.classList.add('active');
  current_active_btn = ping_btn;
  hide(today_wrapper);
  show(ping_wrapper);
  hide(family_wrapper);
  // Opt the user into push the first time they open Ping (idempotent thereafter).
  if (typeof ensurePushSubscribed === 'function') ensurePushSubscribed();
});

family_btn.addEventListener('click', () => {
  current_active_btn.classList.remove('active');
  family_btn.classList.add('active');
  current_active_btn = family_btn;
  hide(today_wrapper);
  hide(ping_wrapper);
  show(family_wrapper);
});




socket.on('test', (data) => {
  alert(data);
}); 

socket.on('client-print', (data) => {
  console.log(data);
});

// Dark mode toggle logic
const darkModeToggle = document.getElementById('darkModeToggle');

function setDarkMode(enabled) {
  if (enabled) {
    document.body.classList.add('dark-mode');
    localStorage.setItem('darkMode', 'true');
    if (darkModeToggle) darkModeToggle.checked = true;
  } else {
    document.body.classList.remove('dark-mode');
    localStorage.setItem('darkMode', 'false');
    if (darkModeToggle) darkModeToggle.checked = false;
  }
  // Force re-apply active class to current page button for correct style
  if (typeof current_active_btn !== 'undefined' && current_active_btn) {
    // Remove and re-add to trigger CSS
    current_active_btn.classList.remove('active');
    void current_active_btn.offsetWidth; // force reflow
    current_active_btn.classList.add('active');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const darkPref = localStorage.getItem('darkMode');
  setDarkMode(darkPref === 'true');
  if (darkModeToggle) {
    darkModeToggle.checked = document.body.classList.contains('dark-mode');
    darkModeToggle.addEventListener('change', (e) => {
      setDarkMode(e.target.checked);
    });
  }
});
