const fileInfoModal = document.getElementById('fileInfoModal');
const closeFileModalBtn = document.getElementById('close-file-modal-btn');

document.querySelector('.files-content').addEventListener('click', (e) => {
  const infoBtn = e.target.closest('.file-info-btn');
  if (!infoBtn) return;

  const block = infoBtn.closest('.file-block');
  document.getElementById('file-modal-name').textContent = block.querySelector('.file-block-name').textContent;
  document.getElementById('file-modal-meta').textContent = block.querySelector('.file-block-meta').textContent;
  fileInfoModal.classList.remove('hidden');
});

closeFileModalBtn.addEventListener('click', () => {
  fileInfoModal.classList.add('hidden');
});

fileInfoModal.addEventListener('click', (e) => {
  if (e.target === fileInfoModal) fileInfoModal.classList.add('hidden');
});
