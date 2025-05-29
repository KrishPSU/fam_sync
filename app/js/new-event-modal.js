const new_event_button = document.querySelector('#new-event-btn');
const close_new_event_modal_button = document.querySelector('#close-event-modal-btn');
const event_form = document.getElementById('eventForm');
const delete_event_at_end_of_day_toggle = event_form.querySelector('input[name="deleteAtEnd"]');


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

event_form.addEventListener('submit', function(e) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(this));
  const formattedTime = formatTimeWithAMPM(data.time);
  // const type = data.isTask ? "Task" : "Event";

  // alert(`Event added:\n${data.title} at ${formattedTime}`);
  console.log(`Event added:\n${data.title} at ${formattedTime}`);
  // createClientEvent(data.title, formattedTime);
  socket.emit('new-event', data.title, formattedTime, me, delete_event_at_end_of_day_toggle.checked);
  close_new_event_modal();
  this.reset();
});


socket.on('event-created-successfully', (event, eventId, time) => {
  addEventToList(event, eventId, time);
});


delete_event_at_end_of_day_toggle.addEventListener('click', () => {
  if (delete_event_at_end_of_day_toggle.checked) {
    event_form.querySelector('.label').innerText = "Delete at end of day (server will delete it)";
  } else {
    event_form.querySelector('.label').innerText = "Stay until self delete (only you can delete it)";
  }
});
