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


function addEventToList(event, time) {
  const li_elem = document.createElement('li');
  li_elem.classList.add("event");
  li_elem.innerHTML = `<strong>${time}</strong> — ${event}`;
  my_events_list.appendChild(li_elem);
}


function addTaskToList(task, task_id, isComplete) {
  const label_elem = document.createElement('label');
  label_elem.classList.add("task");
  let innerHtml;
  if (isComplete) {
    label_elem.classList.add("checked");
    innerHtml = `<input type="checkbox" checked> ${task}`;
  } else {
    innerHtml = `<input type="checkbox"> ${task}`;
  }
  label_elem.id = task_id;
  label_elem.innerHTML = innerHtml;
  my_tasks_list.appendChild(label_elem);
}


function addCardToList(title, description) {
  const section_elem = document.createElement('section');
  section_elem.innerHTML = `
    <section class="card">
      <h2>${title}</h2>
      <p>${description}</p>
    </section>`;
  my_cards_list.appendChild(section_elem);
}



socket.on('data-for-person', (events, tasks, cards) => {

  console.log(events, tasks, cards);

  if (events.length > 0) {
    sortedEvents = sortEventsForPerson(events);
    sortedEvents.forEach((event) => {
      addEventToList(event.title, event.time);
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
      addCardToList(card.title, card.description);
    });
  }
});




let current_active_btn = today_btn;

today_btn.addEventListener('click', () => {
  today_btn.classList.add('active');
  current_active_btn.classList.remove('active');
  current_active_btn = today_btn;
  show(today_wrapper);
  hide(ping_wrapper);
  hide(family_wrapper);
});

ping_btn.addEventListener('click', async() => {
  // register();

  const permission = await Notification.requestPermission();
  console.log("Permission result:", permission);

  if (permission === 'granted') {
    const reg = await navigator.serviceWorker.register('/sw.js');
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array('BN6FDGyUdl1Or_EP1uWm-Wyt6L5Up2wvnBm6iFZKwgRV-Qd3g69KPQSMqVawOc_LSrvPi_4Ivhmrm4DJOMQHoLs')
    });

    socket.emit('save-subscription', me, sub);
  }

  ping_btn.classList.add('active');
  current_active_btn.classList.remove('active');
  current_active_btn = ping_btn;
  document.getElementById('title').value = "";
  document.getElementById('message').value = "";
  hide(today_wrapper);
  hide(noti_sent);
  hide(ping_error);
  show(ping_form);
  show(ping_wrapper);
  hide(family_wrapper);
});

family_btn.addEventListener('click', () => {
  family_btn.classList.add('active');
  current_active_btn.classList.remove('active');
  current_active_btn = family_btn;
  hide(today_wrapper);
  hide(ping_wrapper);
  show(family_wrapper);
});




socket.on('test', (data) => {
  alert(data);
}); 
