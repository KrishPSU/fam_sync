const socket = io({ autoConnect: false }); // connect only once we have a JWT


const today_btn = document.getElementById('today-button');
const ping_btn = document.getElementById('ping-button');
const family_btn = document.getElementById('family-button');
const ai_btn = document.getElementById('ai-button');

const aiWindow = document.querySelector('.ai-assistant-window');
const closeAiBtn = document.getElementById('close-ai-btn');

ai_btn.addEventListener('click', () => {
  aiWindow.classList.remove('hidden');
  if (window.innerWidth <= 600) document.body.classList.add('ai-open');
});

closeAiBtn.addEventListener('click', () => {
  aiWindow.classList.add('hidden');
  document.body.classList.remove('ai-open');
});

let me;            // current user's UUID
let myDisplayName; // current user's Google display name

window.addEventListener('load', async () => {
  const session = await getSession();
  if (!session) {
    window.location.href = '/signin';
    return;
  }

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

  // Keep the socket's token fresh when supabase-js rotates it (~hourly).
  _supabase.auth.onAuthStateChange((event, newSession) => {
    if (event === 'TOKEN_REFRESHED' && newSession) {
      socket.auth = { token: newSession.access_token };
      socket.disconnect().connect();
    }
  });

  requestTodayData();
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
  ['event-privacy-row', 'task-privacy-row', 'card-privacy-row', 'edit-privacy-row'].forEach(id => {
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
  socket.emit('request-data-for-person');
}



function addEventToList(event, event_id, time, isPrivate) {
  const li_elem = document.createElement('li');
  li_elem.classList.add("event-item");
  li_elem.innerHTML = `
    <span><strong>${time}</strong> — ${event}</span>
    <button class="delete-task-and-event-btn">✕</button>
  `;
  li_elem.id = event_id;
  my_events_list.appendChild(li_elem);
}


function addTaskToList(task, task_id, isComplete, isPrivate) {
  const completedClass = isComplete ? ' completed' : '';
  const checkedAttr = isComplete ? ' checked' : '';
  const innerHtml = `
    <div class="task-item">
      <div class="task${completedClass}" id="${task_id}">
        <div class="round">
          <input type="checkbox" id="cb-${task_id}"${checkedAttr} />
          <label for="cb-${task_id}"></label>
        </div>
        <span class="task-text">${task}</span>
      </div>
      <button class="delete-task-and-event-btn">✕</button>
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
      addEventToList(event.title, event.id, event.time, event.is_private);
    });
  }

  if (tasks.length > 0) {
    tasks.forEach((task) => {
      addTaskToList(task.title, task.id, task.complete, task.is_private);
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
