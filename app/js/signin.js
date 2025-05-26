
const submit_person_btn = document.querySelector('.btn-continue');
const name_dropdown = document.getElementById('name');


window.addEventListener('load', () => {
  const person = localStorage.getItem("person");
  if (person !== null) {
    window.location.href = `/${person}`
  }
});


submit_person_btn.addEventListener('click', () => {
  if (name_dropdown.value == "") return;
  console.log(name_dropdown.value);
  window.location.href = `/${name_dropdown.value}`;
});
