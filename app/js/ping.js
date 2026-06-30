

// Prefer the key the server hands us via /env.js (guaranteed to match the key
// the server signs pushes with); fall back to the baked-in key so nothing
// breaks if PUBLIC_VAPID_KEY isn't set in the environment.
const VAPID_PUBLIC_KEY = (window.__ENV && window.__ENV.PUBLIC_VAPID_KEY)
  || 'BN6FDGyUdl1Or_EP1uWm-Wyt6L5Up2wvnBm6iFZKwgRV-Qd3g69KPQSMqVawOc_LSrvPi_4Ivhmrm4DJOMQHoLs';

const members_dropdown = document.getElementById('member');
const ping_form = document.getElementById('pingForm');
const noti_sent = document.querySelector('.sent-box');
const sent_box_detail = document.getElementById('sent-box-detail');
const ping_error = document.getElementById('ping-error');
const send_another_btn = document.getElementById('send-another-btn');


socket.on('family-members', (family_members) => {
  // Build the dropdown in one pass, then assign once.
  const otherMembers = family_members.filter((member) => member.id !== me);
  const options = ['<option value="">-- Choose --</option>'];
  // "Everyone" only makes sense when there's actually someone else to ping.
  if (otherMembers.length > 0) {
    options.push('<option value="all">Everyone</option>');
  }
  otherMembers.forEach((member) => {
    options.push(`<option value="${member.id}">${member.display_name}</option>`);
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

// ---- First-launch notification prompt -----------------------------------
// Shown once on launch to invite the user to enable push, instead of waiting
// for them to open the Ping tab. The actual permission request still happens on
// the "Enable" tap (iOS requires a user gesture). Dismissals are remembered so
// we don't nag — the missed-ping nudge still covers them if a ping later fails.
const PUSH_PROMPT_DISMISSED_KEY = 'famsync-push-prompt-dismissed';
const push_prompt_banner = document.getElementById('push-prompt-banner');

function hidePushPrompt() {
  if (push_prompt_banner) push_prompt_banner.classList.add('hidden');
}

// Called once per launch (from main.js, after sign-in). Refreshes an existing
// subscription, or invites a first-time user to enable notifications.
function initPushOnLaunch() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    ensurePushSubscribed(); // heal a possibly iOS-invalidated subscription
    return;
  }
  if (Notification.permission !== 'default') return; // 'denied' — can't prompt

  if (localStorage.getItem(PUSH_PROMPT_DISMISSED_KEY)) return;
  // Don't stack on top of the (more specific) missed-ping nudge if it's up.
  const miss = document.getElementById('push-miss-banner');
  if (miss && !miss.classList.contains('hidden')) return;
  if (push_prompt_banner) push_prompt_banner.classList.remove('hidden');
}

if (push_prompt_banner) {
  document.getElementById('push-prompt-enable').addEventListener('click', async () => {
    await ensurePushSubscribed();
    hidePushPrompt();
    // Remember the decision either way so the first-launch prompt won't reappear;
    // if it didn't take, a missed ping will re-nudge later.
    localStorage.setItem(PUSH_PROMPT_DISMISSED_KEY, '1');
  });
  document.getElementById('push-prompt-close').addEventListener('click', () => {
    hidePushPrompt();
    localStorage.setItem(PUSH_PROMPT_DISMISSED_KEY, '1');
  });
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
  hidePushPrompt(); // the generic first-launch prompt defers to this one
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
