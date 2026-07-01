

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

  // Task/event menus reuse .edit-btn/.delete-btn but live INSIDE the Tasks/Events
  // section (which is itself a .card). Let their own handlers deal with them so we
  // don't delete/edit the whole section card.
  if (e.target.closest('.task-item, .event-item')) return;

  // Handle Edit
  if (e.target.classList.contains('edit-btn')) {
    const card = e.target.closest('.card');
    if (!card) return; // task/event menus reuse these classes — handled elsewhere
    console.log("Editing card:", card);
    currentCardBeingEditedId = card.id;
    let cardTitleElem = card.querySelector('.card-top h2');
    let cardContentElem = card.querySelector('.card-content p');
    const isPrivate = card.dataset.isPrivate === 'true';
    const deleteAtDayEnd = card.dataset.deleteAtDayEnd === 'true';
    openEditCardModal(cardTitleElem.innerText, cardContentElem.innerText, isPrivate, deleteAtDayEnd);
  }

  // Handle Delete
  if (e.target.classList.contains('delete-btn')) {
    const card = e.target.closest('.card');
    if (!card) return; // task/event menus reuse these classes — handled elsewhere
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




function editCard(cardId, title, description, isPrivate, deleteAtDayEnd) {
  let card = document.getElementById(cardId);
  let cardTitleElem = card.querySelector('.card-top h2');
  let cardContentElem = card.querySelector('.card-content p');

  cardTitleElem.innerText = title;
  cardContentElem.innerText = description;
  card.dataset.isPrivate = isPrivate;
  card.dataset.deleteAtDayEnd = deleteAtDayEnd;

  const dateElem = card.querySelector('.card-date');
  if (dateElem) dateElem.textContent = formatCardDate(new Date().toISOString());

  const topLeft = card.querySelector('.card-top-left');
  if (topLeft) {
    let existingPill = topLeft.querySelector('.public-pill');
    if (!isPrivate) {
      if (!existingPill) {
        const pill = document.createElement('span');
        pill.className = 'public-pill';
        pill.textContent = 'Family';
        topLeft.insertBefore(pill, topLeft.firstChild);
      }
    } else {
      if (existingPill) existingPill.remove();
    }
  }
}


socket.on('update-cards', (title, description, ownerId, ownerName, cardId, isPrivate, deleteAtDayEnd, createdAt) => {
  addCardToList(title, description, ownerId, ownerName, cardId, [], isPrivate, deleteAtDayEnd, true, createdAt);
});


socket.on('card-deletion', (cardId) => {
  document.getElementById(cardId).remove();
});


// Files are uploaded/removed after a card is first broadcast, so a card someone
// else made can arrive without (or later change) its files pill. This keeps the
// stored files and the pill in sync — adding it when files land, and removing it
// when the owner deletes the last one.
socket.on('card-files-updated', (cardId, files) => {
  cardFilesMap[cardId] = files || [];
  updateCardFilesPill(cardId, files);
});


socket.on('card-edit-complete', (cardId, title, description, ownerName, isPrivate, deleteAtDayEnd) => {
  const card = document.getElementById(cardId);
  if (!card) return;
  const header = card.querySelector('h2');
  const content = card.querySelector('p');

  header.innerText = `${title} - ${ownerName || ''}`;
  content.innerHTML = description;
  if (isPrivate !== undefined) card.dataset.isPrivate = isPrivate;
  if (deleteAtDayEnd !== undefined) card.dataset.deleteAtDayEnd = deleteAtDayEnd;

  const dateElem = card.querySelector('.card-date');
  if (dateElem) dateElem.textContent = formatCardDate(new Date().toISOString());
});
