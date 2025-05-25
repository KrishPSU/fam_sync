

my_tasks_list.addEventListener('click', function (e) {
  if (e.target.matches('input[type="checkbox"]')) {

    const task = e.target.closest('.task');
    let isComplete = false;

    if (e.target.checked) {
      task.classList.add('checked');
      isComplete = true;
    } else {
      task.classList.remove('checked');
    }

    // console.log(`Task Clicked:\nid: ${task.id}\ntext: ${task.innerText.trim()}\ncomplete: ${isComplete}`);
    socket.emit('task-crossed', task.id, isComplete);
  }
});
