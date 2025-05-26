const close_edit_card_modal_button = document.querySelector('#close-edit-card-modal-btn');
let currentCardBeingEditedId;

close_edit_card_modal_button.addEventListener('click', () => {
  close_edit_card_modal();
});



function openEditCardModal(currentTitle, currentDesc) {
  document.getElementById('edit-title').value = currentTitle;
  document.getElementById('edit-desc').value = currentDesc;
  document.getElementById('editCardModal').classList.remove('hidden');
}

function close_edit_card_modal() {
  document.getElementById('editCardModal').classList.add('hidden');
}


document.getElementById('editCardForm').addEventListener('submit', function(e) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(this));

  console.log(`Card edited:\n${data.title} | \n${data.description}`);
  editCard(currentCardBeingEditedId, data.title, data.description);
  socket.emit('edit-card', currentCardBeingEditedId, data.title, data.description);
  close_edit_card_modal();
  this.reset();
});
