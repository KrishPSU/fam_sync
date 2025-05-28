document.addEventListener('click', function (e) {
  if (e.target.classList.contains('delete-task-and-event-btn')) {
    const item = e.target.closest('.task-item, .event-item');
    console.log(item);
    if (item.classList.contains('event-item')) {
      socket.emit('delete-event', item.id);
    } else if (item.classList.contains('task-item')) {
      socket.emit('delete-task', item.querySelector('.task').id);
    }
    item.remove(); // Or call a function to delete from database
  }
});
