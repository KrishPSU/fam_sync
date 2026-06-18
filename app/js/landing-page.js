const select = document.getElementById('platformSelect');
const allSteps = document.querySelectorAll('.platform-steps');

select.addEventListener('change', function () {
  allSteps.forEach(el => el.classList.add('hidden'));
  if (this.value) {
    document.getElementById('steps-' + this.value).classList.remove('hidden');
  }
});
