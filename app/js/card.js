my_cards_list.addEventListener('click', function (e) {
  if (e.target.classList.contains('dots-button')) {
    let card = e.target.closest('.card');
    console.log("Clicked 3-dots on card:", card);
    // Show menu or trigger logic here
  }
});



document.addEventListener('click', function (e) {
  // Close all open menus by default
  const allMenus = document.querySelectorAll('.dots-menu');
  allMenus.forEach(menu => menu.classList.add('hidden'));

  // Handle 3-dot button click
  if (e.target.classList.contains('dots-button')) {
    const menu = e.target.nextElementSibling;
    if (menu && menu.classList.contains('dots-menu')) {
      menu.classList.toggle('hidden');
    }
    e.stopPropagation(); // prevent the menu from closing
    return;
  }

  // Handle Edit
  if (e.target.classList.contains('edit-btn')) {
    const card = e.target.closest('.card');
    console.log("Editing card:", card);
    // TODO: Open edit modal or inline edit
    currentCardBeingEditedId = card.id;
    let cardTitleElem = card.querySelector('.card-top h2');
    let cardContentElem = card.querySelector('.card-content p');
    openEditCardModal(cardTitleElem.innerText, cardContentElem.innerText);
  }

  // Handle Delete
  if (e.target.classList.contains('delete-btn')) {
    const card = e.target.closest('.card');
    console.log("Deleting card:", card);
    socket.emit('delete-card', card.id);
    card.remove(); // or call a delete function
  }
});


document.querySelectorAll('.dots-menu').forEach(menu => {
  menu.addEventListener('click', e => {
    e.stopPropagation(); // don’t bubble up to the document click
  });
});




function editCard(cardId, title, description) {
  let card = document.getElementById(cardId);
  let cardTitleElem = card.querySelector('.card-top h2');
  let cardContentElem = card.querySelector('.card-content p');

  cardTitleElem.innerText = title;
  cardContentElem.innerText = description;
}
