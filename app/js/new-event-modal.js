const new_event_button = document.querySelector('#new-event-btn');
const close_new_event_modal_button = document.querySelector('#close-event-modal-btn');



new_event_button.addEventListener('click', () => {
  open_new_event_modal();
});
close_new_event_modal_button.addEventListener('click', () => {
  close_new_event_modal();
});



function open_new_event_modal() {
  document.getElementById('eventModal').classList.remove('hidden');
}

function close_new_event_modal() {
  document.getElementById('eventModal').classList.add('hidden');
}

function formatTimeWithAMPM(time24) {
  const [hour, minute] = time24.split(':').map(Number);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minute.toString().padStart(2, '0')} ${ampm}`;
}

document.getElementById('eventForm').addEventListener('submit', function(e) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(this));
  const formattedTime = formatTimeWithAMPM(data.time);
  // const type = data.isTask ? "Task" : "Event";

  // alert(`Event added:\n${data.title} at ${formattedTime}`);
  console.log(`Event added:\n${data.title} at ${formattedTime}`);
  // createClientEvent(data.title, formattedTime);
  socket.emit('new-event', data.title, formattedTime, me);
  close_new_event_modal();
  this.reset();
});


socket.on('event-created-successfully', (event, eventId, time) => {
  addEventToList(event, eventId, time);
});


// function createClientEvent(event, time) {
//   const li_elem = document.createElement('li');
//   li_elem.classList.add("event");
//   li_elem.innerHTML = `<strong>${time}</strong> — ${event}`;
//   my_events_list.appendChild(li_elem);
// }
