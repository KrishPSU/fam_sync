

const members_dropdown = document.getElementById('member');
const ping_form = document.getElementById('pingForm');
const noti_sent = document.querySelector('.sent-box');
const ping_error = document.getElementById('ping-error');
const send_another_btn = document.getElementById('send-another-btn');


socket.on('family-members', (family_members) => {
  members_dropdown.innerHTML += `<option value="">-- Choose --</option>`;
  members_dropdown.innerHTML += `<option value="all">All</option>`;
  family_members.forEach((member) => {
    if (member != me) {
      members_dropdown.innerHTML += `<option value="${member}">${uppercaseFirstLetter(member)}</option>`;
    }
  });
});




// Register with the server
async function register() {
  console.log(me);
  // alert("Registering, " + me);
  socket.emit('register', me);

  const permission = await Notification.requestPermission();
  // alert(permission);
  // console.log(permission);
  if (permission === 'denied') {
    alert("You’ve previously blocked notifications. To fix this, please go to iPhone Settings > Safari > Advanced > Website Data, search 'famsyncapp.com', and delete it. Then re-add the app from Safari.");
  }
  const reg = await navigator.serviceWorker.register('/sw.js');
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array('BN6FDGyUdl1Or_EP1uWm-Wyt6L5Up2wvnBm6iFZKwgRV-Qd3g69KPQSMqVawOc_LSrvPi_4Ivhmrm4DJOMQHoLs')
  });

  socket.emit('save-subscription', me, sub);
};

document.getElementById('ping-submit-btn').addEventListener('click', (e) => {
  e.preventDefault();
  const to = document.getElementById('member').value;
  const title = document.getElementById('title').value;
  const message = document.getElementById('message').value;

  if (to == "" || title.trim() == "" || message.trim() == "") return;

  console.log("pinging..");
  socket.emit('pingUser', to, uppercaseFirstLetter(me), title, message);
});

// Helper
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}




socket.on('registered-and-sent', (to) => {
  console.log(`Noti sent to ${to} successfully!`);
  hide(ping_form);
  show(noti_sent);
});

socket.on('not-registered-for-notis', (to) => {
  ping_error.querySelector('span').innerText = uppercaseFirstLetter(to);
  show(ping_error);
  console.log(`${to} is not yet registed to recieve notis.`);
});



send_another_btn.addEventListener('click', () => {
  document.getElementById('title').value = "";
  document.getElementById('message').value = "";
  hide(noti_sent);
  hide(ping_error);
  show(ping_form);
  show(ping_wrapper);
});
