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
  addTaskToList(data.title);
  close_new_task_modal();
  this.reset();
});