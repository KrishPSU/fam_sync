const socket = io();


const today_btn = document.getElementById('today-button');
const ping_btn = document.getElementById('ping-button');
const family_btn = document.getElementById('family-button');

let me;
window.addEventListener('load', () => {
  me = window.location.pathname.split('/').join('');
  // register();
  socket.emit('request-data-for-person', me);
});


const my_events_list = document.getElementById('my-events');
const my_tasks_list = document.getElementById('my-tasks');
const my_cards_list = document.getElementById('my-cards');



function addEventToList(event, event_id, time) {
  const li_elem = document.createElement('li');
  li_elem.classList.add("event-item");
  li_elem.innerHTML = `
    <span><strong>${time}</strong> — ${event}</span>
    <button class="delete-task-and-event-btn">✕</button>
  `;
  li_elem.id = event_id;
  my_events_list.appendChild(li_elem);
}


function addTaskToList(task, task_id, isComplete) {
  let innerHtml;
  if (isComplete) {
    innerHtml = `
      <div class="task-item">
        <label class="task completed" id="${task_id}">
          <input type="checkbox" checked />
          <span>${task}</span>
        </label>
        <button class="delete-task-and-event-btn">✕</button>
      </div>
    `;
  } else {
    innerHtml = `
      <div class="task-item">
        <label class="task" id="${task_id}">
          <input type="checkbox" />
          <span>${task}</span>
        </label>
        <button class="delete-task-and-event-btn">✕</button>
      </div>
    `;
  }
  my_tasks_list.innerHTML += innerHtml;
}


function addCardToList(title, description, cardOwner, cardId) {
  const section_elem = document.createElement('section');
  let innerHtml;

  if (cardOwner == me) {
    innerHtml = `
      <section class="card" id=${cardId}>
        <div class="card-top">
          <h2>${title}</h2>
          <button class="dots-button">⋯</button>
          <div class="dots-menu hidden">
            <button class="edit-btn">Edit</button>
            <button class="delete-btn">Delete</button>
          </div>
        </div>
        <div class="card-content">
          <p>${description}</p>
        </div>
      </section>
    `;
  } else {
    innerHtml = `
      <section class="card" id=${cardId}>
        <h2>${title} - ${uppercaseFirstLetter(cardOwner)}</h2>
        <p>${description}</p>
      </section>
    `;
  }

  section_elem.innerHTML = innerHtml;
  my_cards_list.appendChild(section_elem);
}


socket.on('data-for-person', (events, tasks, cards) => {

  // console.log(events, tasks, cards);

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
      addEventToList(event.title, event.id, event.time);
    });
  }
  
  if (tasks.length > 0) {
    // console.log(tasks);
    tasks.forEach((task) => {
      addTaskToList(task.title, task.id, task.complete);
    });
  }

  if (cards.length > 0) {
    cards.forEach((card) => {
      addCardToList(card.title, card.description, card.person, card.id);
    });
  }
});




let current_active_btn = today_btn;

today_btn.addEventListener('click', () => {
  socket.emit('request-data-for-person', me);
  current_active_btn.classList.remove('active');
  today_btn.classList.add('active');
  current_active_btn = today_btn;
  show(today_wrapper);
  hide(ping_wrapper);
  hide(family_wrapper);
});

ping_btn.addEventListener('click', async() => {
  // register();

  const permission = await Notification.requestPermission();
  // console.log("Permission result:", permission);

  if (permission === 'granted') {
    const reg = await navigator.serviceWorker.register('/sw.js');
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array('BN6FDGyUdl1Or_EP1uWm-Wyt6L5Up2wvnBm6iFZKwgRV-Qd3g69KPQSMqVawOc_LSrvPi_4Ivhmrm4DJOMQHoLs')
    });

    socket.emit('save-subscription', me, sub);
  }

  current_active_btn.classList.remove('active');
  ping_btn.classList.add('active');
  current_active_btn = ping_btn;
  document.getElementById('title').value = "";
  document.getElementById('message').value = "";
  hide(today_wrapper);
  hide(noti_sent);
  hide(ping_error);
  // show(ping_form);
  show(ping_wrapper);
  hide(family_wrapper);
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
