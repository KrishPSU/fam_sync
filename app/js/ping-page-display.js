const create_new_ping_toggle = document.getElementById('create-toggle');
const messages_toggle = document.getElementById('messages-toggle');

const messages_section = document.getElementById('messages-section');

const sentTab = document.getElementById('sent_tab');
const receivedTab = document.getElementById('received_tab');

const sent_messages_wrapper = document.getElementById('sent_messages_wrapper');
const received_messages_wrapper = document.getElementById('received_messages_wrapper');

const no_sent_messagesEl = document.getElementById('no-sent-messages');
const no_received_messagesEl = document.getElementById('no-received-messages');




create_new_ping_toggle.addEventListener('change', () => {
  ping_form.style.display = 'block';
  messages_section.style.display = 'none';
});

messages_toggle.addEventListener('change', () => {
  ping_form.style.display = 'none';
  messages_section.style.display = 'block';
  socket.emit('get-messages');
});




socket.on('messages-retrieved', (messagesData) =>{
  // console.log(messagesData);

  let sentMessages = 0;
  let receivedMessages = 0;

  sent_messages_wrapper.innerHTML = `
    <div class="no-messages" id="no-sent-messages">
      <p>No messages yet 📭</p>
    </div>
  `;
  received_messages_wrapper.innerHTML = `
    <div class="no-messages" id="no-received-messages">
      <p>No messages yet 📭</p>
    </div>
  `;

  for (let i=0; i<messagesData.length; i++) {
    let sender = messagesData[i].from;
    let recepient = messagesData[i].to;
    let title = messagesData[i].title;
    let messageText = messagesData[i].message;
    let time = formatTo12Hour(messagesData[i].created_at);
    if (sender == me) {
      const message = `
        <div class="message">
          <div class="message-header">
            <strong class="message-title">${title}</strong>
            <span class="message-timestamp">${time}</span>
          </div>
          <p class="message-from">To: ${uppercaseFirstLetter(recepient)}</p>
          <p class="message-body">${messageText}</p>
        </div>
      `;
      sent_messages_wrapper.innerHTML += message;
      sentMessages++;
    } else if (recepient == me) {
      const message = `
        <div class="message">
          <div class="message-header">
            <strong class="message-title">${title}</strong>
            <span class="message-timestamp">${time}</span>
          </div>
          <p class="message-from">From: ${uppercaseFirstLetter(sender)}</p>
          <p class="message-body">${messageText}</p>
        </div>
      `;
      received_messages_wrapper.innerHTML += message;
      receivedMessages++;
    }
  }

  if (sentMessages == 0) {
    no_sent_messagesEl.style.display = "block";
  } else {
    no_sent_messagesEl.style.display = "none";
  }

  if (receivedMessages == 0) {
    no_received_messagesEl.style.display = "block";
  } else {
    no_received_messagesEl.style.display = "none";
  }
});

function formatTo12Hour(timeStr) {
  const date = new Date(timeStr);

  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');

  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12; // Convert to 12-hour format, with 12 instead of 0

  return `${hours}:${minutes} ${ampm}`;
}





sentTab.addEventListener('click', () => {
  sentTab.classList.add('selected');
  receivedTab.classList.remove('selected');
  // Show sent messages, hide received
  sent_messages_wrapper.style.display = "block";
  received_messages_wrapper.style.display = "none";
});

receivedTab.addEventListener('click', () => {
  receivedTab.classList.add('selected');
  sentTab.classList.remove('selected');
  // Show received messages, hide sent
  sent_messages_wrapper.style.display = "none";
  received_messages_wrapper.style.display = "block";
});


