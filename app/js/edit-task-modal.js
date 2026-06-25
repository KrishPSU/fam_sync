const close_edit_task_modal_button = document.querySelector('#close-edit-task-modal-btn');
const edit_task_form = document.getElementById('editTaskForm');
let currentTaskBeingEditedId;

close_edit_task_modal_button.addEventListener('click', () => {
  close_edit_task_modal();
});


function openEditTaskModal(currentTitle, isPrivate, deleteAtDayEnd) {
  document.getElementById('edit-task-title').value = currentTitle;
  document.getElementById('edit-task-delete-toggle').checked = !!deleteAtDayEnd;
  document.getElementById('edit-task-privacy-toggle').checked = !!isPrivate;
  document.getElementById('editTaskModal').classList.remove('hidden');
}

function close_edit_task_modal() {
  document.getElementById('editTaskModal').classList.add('hidden');
}


// Handle the Edit / Delete options inside a task's 3-dot menu. Scoped to
// .task-item so it ignores the identical button classes used by cards/events.
document.addEventListener('click', function (e) {
  const item = e.target.closest('.task-item');
  if (!item) return;

  if (e.target.classList.contains('edit-btn')) {
    currentTaskBeingEditedId = item.querySelector('.task').id;
    const title = item.querySelector('.task-text').innerText;
    const isPrivate = item.dataset.isPrivate === 'true';
    const deleteAtDayEnd = item.dataset.deleteAtDayEnd === 'true';
    openEditTaskModal(title, isPrivate, deleteAtDayEnd);
  }

  if (e.target.classList.contains('delete-btn')) {
    const taskId = item.querySelector('.task').id;
    openDeleteConfirm(() => {
      socket.emit('delete-task', taskId);
      item.remove();
    }, 'task');
  }
});


edit_task_form.addEventListener('submit', function (e) {
  e.preventDefault();
  const title = document.getElementById('edit-task-title').value;
  const isPrivate = document.getElementById('edit-task-privacy-toggle').checked;
  const deleteAtDayEnd = document.getElementById('edit-task-delete-toggle').checked;

  const taskElem = document.getElementById(currentTaskBeingEditedId);
  if (taskElem) {
    const item = taskElem.closest('.task-item');
    taskElem.querySelector('.task-text').innerText = title;
    item.dataset.isPrivate = isPrivate;
    item.dataset.deleteAtDayEnd = deleteAtDayEnd;
  }

  socket.emit('update-task', currentTaskBeingEditedId, title, isPrivate, deleteAtDayEnd);
  close_edit_task_modal();
  this.reset();
});
