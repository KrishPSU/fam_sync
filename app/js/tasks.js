

my_tasks_list.addEventListener('change', function (e) {
  if (e.target.matches('input[type="checkbox"]')) {
    const task = e.target.closest('.task');
    const isComplete = e.target.checked;
    task.classList.toggle('completed', isComplete);
    socket.emit('task-crossed', task.id, isComplete);
  }
});


socket.on('task-created-successfully', (task, taskId, isPrivate) => {
  addTaskToList(task, taskId, false, isPrivate);
});
