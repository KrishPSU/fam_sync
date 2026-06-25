// Reusable "are you sure?" confirmation for destructive actions (task/event
// delete). Call openDeleteConfirm(onConfirm, label); the action only runs if
// the user presses Delete.
const confirmDeleteModal = document.getElementById('confirmDeleteModal');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
let _pendingDeleteAction = null;

function openDeleteConfirm(onConfirm, label) {
  _pendingDeleteAction = typeof onConfirm === 'function' ? onConfirm : null;
  document.getElementById('confirm-delete-title').textContent =
    label ? `Delete this ${label}?` : 'Delete this?';
  confirmDeleteModal.classList.remove('hidden');
}

function closeDeleteConfirm() {
  confirmDeleteModal.classList.add('hidden');
  _pendingDeleteAction = null;
}

confirmDeleteBtn.addEventListener('click', () => {
  const action = _pendingDeleteAction;
  closeDeleteConfirm();
  if (action) action();
});

cancelDeleteBtn.addEventListener('click', closeDeleteConfirm);

// Close when clicking the backdrop.
confirmDeleteModal.addEventListener('click', (e) => {
  if (e.target === confirmDeleteModal) closeDeleteConfirm();
});
