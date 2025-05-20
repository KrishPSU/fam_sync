const options = { weekday: 'long', month: 'long', day: 'numeric' };
const today = new Date();
const formattedDate = today.toLocaleDateString('en-US', options);
document.getElementById('dateDisplay').textContent = formattedDate;
