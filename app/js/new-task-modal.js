const new_task_button = document.querySelector('#new-task-btn');
const close_new_task_modal_button = document.querySelector('#close-task-modal-btn');



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


document.getElementById('taskForm').addEventListener('submit', function(e) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(this));

  console.log(`Task added:\n${data.title}`);
  createClientTask(data.title);
  socket.emit('new-task', data.title, me);
  close_new_task_modal();
  this.reset();
});


function createClientTask(task) {
  const label_elem = document.createElement('label');
  label_elem.classList.add("task-item");
  label_elem.innerHTML = `<input type="checkbox"> ${task}`;
  my_tasks_list.appendChild(label_elem);
}
