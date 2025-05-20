

const today_wrapper = document.querySelector('.today');
const ping_wrapper = document.querySelector('.ping');
const family_wrapper = document.querySelector('.family');


const events_tab = document.getElementById('events_tab');
const tasks_tab = document.getElementById('tasks_tab');
const all_tab = document.getElementById('all_tab');




function hide(elem) {
  if (elem == today_wrapper) {
    new_card_button.style.display = "none";
  }
  elem.style.display = "none";
}


function show(elem) {
  if (elem == today_wrapper) {
    new_card_button.style.display = "flex";
  }
  if (elem == family_wrapper) {
    socket.emit('request-family-events-and-tasks');
  }
  if (elem == ping_wrapper) {
    socket.emit('request-family-members');
  }
  elem.style.display = "block";
}



let current_selected_tab = all_tab;

events_tab.addEventListener('click', () => {
  socket.emit('request-family-events');
  events_tab.classList.add('selected');
  current_selected_tab.classList.remove('selected');
  current_selected_tab = events_tab;
  renderEvents(family_events, my_family);
});

tasks_tab.addEventListener('click', () => {
  socket.emit('request-family-tasks');
  tasks_tab.classList.add('selected');
  current_selected_tab.classList.remove('selected');
  current_selected_tab = tasks_tab;
});

all_tab.addEventListener('click', () => {
  socket.emit('request-family-events-and-tasks');
  all_tab.classList.add('selected');
  current_selected_tab.classList.remove('selected');
  current_selected_tab = all_tab;
});
