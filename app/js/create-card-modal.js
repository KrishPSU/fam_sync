const new_card_button = document.querySelector('.new-card-button');
const close_new_card_modal_button = document.querySelector('#close-card-modal-btn');


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


document.getElementById('cardForm').addEventListener('submit', function(e) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(this));

  console.log(`Card added:\n${data.title} | \n${data.description}`);
  addCardToList(data.title, data.description);
  close_new_card_modal();
  this.reset();
});
