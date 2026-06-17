

const VAPID_PUBLIC_KEY = 'BN6FDGyUdl1Or_EP1uWm-Wyt6L5Up2wvnBm6iFZKwgRV-Qd3g69KPQSMqVawOc_LSrvPi_4Ivhmrm4DJOMQHoLs';

const members_dropdown = document.getElementById('member');
const ping_form = document.getElementById('pingForm');
const noti_sent = document.querySelector('.sent-box');
const sent_box_detail = document.getElementById('sent-box-detail');
const ping_error = document.getElementById('ping-error');
const send_another_btn = document.getElementById('send-another-btn');


socket.on('family-members', (family_members) => {
  // Build the dropdown in one pass, then assign once. "Everyone" lets you ping
  // the whole family at once (server fans out to each member's devices).
  const options = ['<option value="">-- Choose --</option>', '<option value="all">Everyone</option>'];
  family_members.forEach((member) => {
    if (member.id !== me) {
      options.push(`<option value="${member.id}">${member.display_name}</option>`);
    }
  });
  members_dropdown.innerHTML = options.join('');
});


// Subscribe this device to web push and save it server-side. Idempotent: safe
// to call on every Ping-tab open. Returns true once a subscription is saved.
let pushSubscribeInFlight = false;
async function ensurePushSubscribed() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  if (Notification.permission === 'denied') return false;
  if (pushSubscribeInFlight) return false;

  pushSubscribeInFlight = true;
  try {
    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      if (permission === 'denied') {
        alert("You’ve previously blocked notifications. To fix this, please go to iPhone Settings > Safari > Advanced > Website Data, search 'famsyncapp.com', and delete it. Then re-add the app from Safari.");
      }
      return false;
    }

    const reg = await navigator.serviceWorker.register('/sw.js');
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }
    socket.emit('save-subscription', sub.toJSON());
    return true;
  } catch (err) {
    console.error('Push subscribe failed:', err);
    return false;
  } finally {
    pushSubscribeInFlight = false;
  }
}

document.getElementById('ping-submit-btn').addEventListener('click', (e) => {
  e.preventDefault();
  const to = document.getElementById('member').value;
  const title = document.getElementById('title').value;
  const message = document.getElementById('message').value;

  if (to == "" || title.trim() == "" || message.trim() == "") return;

  socket.emit('pingUser', to, title, message);
});

// Helper
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}


// Delivered as a push notification.
socket.on('registered-and-sent', (to) => {
  if (sent_box_detail) sent_box_detail.innerText = `Your message was delivered to ${to}.`;
  hide(ping_form);
  hide(ping_error);
  show(noti_sent);
});

// Saved, but the recipient hasn't enabled notifications — they'll still see it
// in their Messages tab, and they get an in-app nudge next time they open the app.
socket.on('ping-sent-no-push', (to) => {
  if (sent_box_detail) sent_box_detail.innerText = `${uppercaseFirstLetter(to)} hasn’t enabled notifications, so it won’t pop up for them — but they’ll see it in their Messages.`;
  hide(ping_form);
  hide(ping_error);
  show(noti_sent);
});

// Couldn't send at all (e.g. recipient isn't in your family).
socket.on('ping-failed', (to) => {
  ping_error.querySelector('span').innerText = uppercaseFirstLetter(to);
  show(ping_error);
});


send_another_btn.addEventListener('click', () => {
  document.getElementById('title').value = "";
  document.getElementById('message').value = "";
  hide(noti_sent);
  hide(ping_error);
  show(ping_form);
  show(ping_wrapper);
});




// ---- Recipient-side "you missed a ping" banner --------------------------
// Shown (top-center, persistent) when a ping couldn't reach this user as a push
// notification — either fired live by the server, or on app load for pings that
// piled up while notifications were off. Stays until the user dismisses it.

const push_miss_banner = document.getElementById('push-miss-banner');
const push_miss_text = push_miss_banner ? push_miss_banner.querySelector('.push-miss-text') : null;

function showPushMissBanner({ count = 1, from } = {}) {
  if (!push_miss_banner) return;
  push_miss_text.innerText = from
    ? `${uppercaseFirstLetter(from)} pinged you, but notifications are off so it didn’t pop up. Enable them so you don’t miss the next one.`
    : `You have ${count} ping${count > 1 ? 's' : ''} that didn’t pop up because notifications are off. Enable them so you don’t miss any.`;
  push_miss_banner.classList.remove('hidden');
}

socket.on('push-miss-nudge', showPushMissBanner);

if (push_miss_banner) {
  document.getElementById('push-miss-close').addEventListener('click', () => {
    push_miss_banner.classList.add('hidden');
    socket.emit('ack-push-miss');
  });

  document.getElementById('push-miss-enable').addEventListener('click', async () => {
    const ok = await ensurePushSubscribed();
    if (ok) {
      push_miss_banner.classList.add('hidden');
      socket.emit('ack-push-miss');
    }
  });
}
