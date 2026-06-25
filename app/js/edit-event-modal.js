const close_edit_event_modal_button = document.querySelector('#close-edit-event-modal-btn');
const edit_event_form = document.getElementById('editEventForm');
let currentEventBeingEditedId;

close_edit_event_modal_button.addEventListener('click', () => {
  close_edit_event_modal();
});


// "3:00 PM" -> "15:00" for the <input type="time"> field.
function parseTimeTo24h(timeStr) {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec((timeStr || '').trim());
  if (!match) return '';
  let hour = parseInt(match[1], 10);
  const minute = match[2];
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && hour !== 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  return `${hour.toString().padStart(2, '0')}:${minute}`;
}


function openEditEventModal(currentTitle, currentTime, isPrivate, deleteAtDayEnd, currentEndTime) {
  document.getElementById('edit-event-title').value = currentTitle;
  document.getElementById('edit-event-time').value = parseTimeTo24h(currentTime);
  document.getElementById('edit-event-time-end').value = parseTimeTo24h(currentEndTime);
  document.getElementById('edit-event-delete-toggle').checked = !!deleteAtDayEnd;
  document.getElementById('edit-event-privacy-toggle').checked = !!isPrivate;
  document.getElementById('editEventModal').classList.remove('hidden');
}

function close_edit_event_modal() {
  document.getElementById('editEventModal').classList.add('hidden');
}


// Handle the Edit / Delete options inside an event's 3-dot menu. Scoped to
// .event-item so it ignores the identical button classes used by cards/tasks.
document.addEventListener('click', function (e) {
  const item = e.target.closest('.event-item');
  if (!item) return;

  if (e.target.classList.contains('edit-btn')) {
    currentEventBeingEditedId = item.id;
    const title = item.dataset.title;
    const time = item.dataset.time;
    const endTime = item.dataset.endTime;
    const isPrivate = item.dataset.isPrivate === 'true';
    const deleteAtDayEnd = item.dataset.deleteAtDayEnd === 'true';
    openEditEventModal(title, time, isPrivate, deleteAtDayEnd, endTime);
  }

  if (e.target.classList.contains('delete-btn')) {
    socket.emit('delete-event', item.id);
    item.remove();
  }
});


edit_event_form.addEventListener('submit', function (e) {
  e.preventDefault();
  const title = document.getElementById('edit-event-title').value;
  const formattedTime = formatTimeWithAMPM(document.getElementById('edit-event-time').value);
  const endVal = document.getElementById('edit-event-time-end').value;
  const formattedEnd = endVal ? formatTimeWithAMPM(endVal) : '';
  const isPrivate = document.getElementById('edit-event-privacy-toggle').checked;
  const deleteAtDayEnd = document.getElementById('edit-event-delete-toggle').checked;

  const item = document.getElementById(currentEventBeingEditedId);
  if (item) {
    const span = item.querySelector('span');
    if (span) span.innerHTML = `<strong>${formatEventTimeLabel(formattedTime, formattedEnd)}</strong> — ${title}`;
    item.dataset.title = title;
    item.dataset.time = formattedTime;
    item.dataset.endTime = formattedEnd;
    item.dataset.isPrivate = isPrivate;
    item.dataset.deleteAtDayEnd = deleteAtDayEnd;
  }

  socket.emit('update-event', currentEventBeingEditedId, title, formattedTime, isPrivate, deleteAtDayEnd, formattedEnd);
  close_edit_event_modal();
  this.reset();
});
