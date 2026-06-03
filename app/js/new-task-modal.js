const new_task_button = document.querySelector('#new-task-btn');
const close_new_task_modal_button = document.querySelector('#close-task-modal-btn');
const task_form = document.getElementById('taskForm');
const delete_task_at_end_of_day_toggle = task_form.querySelector('input[name="deleteAtEnd"]');



new_task_button.addEventListener('click', () => {
  open_new_task_modal();
});
close_new_task_modal_button.addEventListener('click', () => {
  close_new_task_modal();
});



function open_new_task_modal() {
  document.getElementById('taskModal').classList.remove('hidden');
}

function close_new_task_modal() {
  document.getElementById('taskModal').classList.add('hidden');
}


task_form.addEventListener('submit', function(e) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(this));

  console.log(`Task added:\n${data.title}`);
  // createClientTask(data.title);
  socket.emit('new-task', data.title, me, delete_task_at_end_of_day_toggle.checked);
  close_new_task_modal();
  this.reset();
});



delete_task_at_end_of_day_toggle.addEventListener('click', () => {
  if (delete_task_at_end_of_day_toggle.checked) {
    task_form.querySelector('.label').innerText = "Delete at end of day (server will delete it)";
  } else {
    task_form.querySelector('.label').innerText = "Stay until self delete (only you can delete it)";
  }
});
