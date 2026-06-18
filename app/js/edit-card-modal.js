const close_edit_card_modal_button = document.querySelector('#close-edit-card-modal-btn');
const edit_card_form = document.getElementById('editCardForm');
let currentCardBeingEditedId;

close_edit_card_modal_button.addEventListener('click', () => {
  close_edit_card_modal();
});



function openEditCardModal(currentTitle, currentDesc, isPrivate, deleteAtDayEnd) {
  document.getElementById('edit-title').value = currentTitle;
  document.getElementById('edit-desc').value = currentDesc;
  document.getElementById('edit-delete-toggle').checked = !!deleteAtDayEnd;
  document.getElementById('edit-privacy-toggle').checked = !!isPrivate;
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
  const isPrivate = document.getElementById('edit-privacy-toggle').checked;
  const deleteAtDayEnd = document.getElementById('edit-delete-toggle').checked;

  editCard(currentCardBeingEditedId, title, description, isPrivate, deleteAtDayEnd);
  socket.emit('edit-card', currentCardBeingEditedId, title, description, isPrivate, deleteAtDayEnd);
  close_edit_card_modal();
  this.reset();
});
