const new_card_button = document.querySelector('.new-card-button');
const close_new_card_modal_button = document.querySelector('#close-card-modal-btn');
const card_form = document.getElementById('cardForm');
const delete_card_at_end_of_day_toggle = card_form.querySelector('input[name="deleteAtEnd"]');


new_card_button.addEventListener('click', () => {
  open_new_card_modal();
});
close_new_card_modal_button.addEventListener('click', () => {
  close_new_card_modal();
});



function open_new_card_modal() {
  document.getElementById('cardModal').classList.remove('hidden');
}

function close_new_card_modal() {
  document.getElementById('cardModal').classList.add('hidden');
}


card_form.addEventListener('submit', function(e) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(this));
  let title = data.title;
  let description = document.getElementById('card-description').value;

  console.log(`Card added:\n${title} | \n${description}`);
  // addCardToList(title, description);
  socket.emit('new-card', title, description, me, delete_card_at_end_of_day_toggle.checked);
  close_new_card_modal();
  this.reset();
});


delete_card_at_end_of_day_toggle.addEventListener('click', () => {
  if (delete_card_at_end_of_day_toggle.checked) {
    card_form.querySelector('.label').innerText = "Delete at end of day (server will delete it)";
  } else {
    card_form.querySelector('.label').innerText = "Stay until self delete (only you can delete it)";
  }
});
