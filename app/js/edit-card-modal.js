const close_edit_card_modal_button = document.querySelector('#close-edit-card-modal-btn');
const edit_card_form = document.getElementById('editCardForm');
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


edit_card_form.addEventListener('submit', function(e) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(this));
  let title = data.title;
  let description = document.getElementById('edit-desc').value;

  console.log(`Card edited:\n${title} | \n${description}`);
  editCard(currentCardBeingEditedId, title, description);
  socket.emit('edit-card', currentCardBeingEditedId, title, description);
  close_edit_card_modal();
  this.reset();
});
