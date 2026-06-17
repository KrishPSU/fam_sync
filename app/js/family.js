const family_events_and_tasks_wrapper = document.querySelector('.family-events-and-tasks');
const family_events_wrapper = document.querySelector('.family-events');
const family_tasks_wrapper = document.querySelector('.family-tasks');

let family_events;
let family_tasks;
let my_family;

socket.on('family-events', (events, family) => {
  renderEvents(events, family);
  family_events = events;
  my_family = family;
});


socket.on('family-tasks', (tasks, family) => {
  renderTasks(tasks, family);
  family_tasks = tasks;
  my_family = family;
});


socket.on('family-events-and-tasks', (events, tasks, family) => {
  renderAll(events, tasks, family);
  family_events = events;
  family_tasks = tasks;
  my_family = family;
});




function renderEvents(events, family) {
  family_events_and_tasks_wrapper.style.display = "none";
  family_tasks_wrapper.style.display = "none";
  family_events_wrapper.style.display = "block";

  family_events_wrapper.innerHTML = "";

  let groupedEvents = groupedItemsByPerson(events);

  family.forEach((profile) => {
    if (profile.id === me) return;
    if (!groupedEvents[profile.id]) return;
    let events_for_person = groupedEvents[profile.id];
    let events_text = "";

    const sortedEventsForPerson = sortEventsForPerson(events_for_person);

    sortedEventsForPerson.forEach((event) => {
      // console.log(event);
      events_text += `<li>${event.time} — ${event.title}</li>`;
    });

    family_events_wrapper.innerHTML += `
      <div class="family-member">
        <h2>${profile.display_name}</h2>
        <ul>
          ${events_text}
        </ul>
      </div>
    `;
  });
  if (family_events_wrapper.innerHTML == "") {
    family_events_wrapper.innerHTML = '<p class="empty_family_item">No events 🗓️</p>';
  }
}




function renderTasks(tasks, family) {
  family_events_and_tasks_wrapper.style.display = "none";
  family_tasks_wrapper.style.display = "block";
  family_events_wrapper.style.display = "none";

  family_tasks_wrapper.innerHTML = "";

  let groupedTasks = groupedItemsByPerson(tasks);

  // console.log(groupedTasks);

  family.forEach((profile) => {
    if (profile.id === me) return;
    if (!groupedTasks[profile.id]) return;
    let tasks_for_person = groupedTasks[profile.id];
    let tasks_text = "";

    tasks_for_person.forEach((task) => {

      if (task.complete) {
        tasks_text += `<label class="task completed">— ${task.title}</label><br>`;
      } else {
        tasks_text += `<label class="task">— ${task.title}</label><br>`;
      }
    });

    family_tasks_wrapper.innerHTML += `
      <div class="family-member">
        <h2>${profile.display_name}</h2>
        <ul>
          ${tasks_text}
        </ul>
      </div>
    `;
  });
  if (family_tasks_wrapper.innerHTML == "") {
    family_tasks_wrapper.innerHTML = '<p class="empty_family_item">No tasks 📋</p>';
  }
}




function renderAll(events, tasks, family) {
  family_events_and_tasks_wrapper.style.display = "block";
  family_tasks_wrapper.style.display = "none";
  family_events_wrapper.style.display = "none";

  family_events_and_tasks_wrapper.innerHTML = "";

  let groupedEvents = groupedItemsByPerson(events);
  let groupedTasks = groupedItemsByPerson(tasks);

  family.forEach((profile) => {
    if (profile.id === me) return;
    let events_text = "";
    let tasks_text = "";
    if (!groupedEvents[profile.id]) {
      events_text = "<i>No events</i>";
    } else {
      let events_for_person = groupedEvents[profile.id];

      const sortedEventsForPerson = sortEventsForPerson(events_for_person);

      sortedEventsForPerson.forEach((event) => {
        // console.log(event);
        events_text += `<li>${event.time} — ${event.title}</li>`;
      });
    }



    if (!groupedTasks[profile.id]) {
      tasks_text = "<i>No tasks</i>";
    } else {
      let tasks_for_person = groupedTasks[profile.id];

      tasks_for_person.forEach((task) => {

        if (task.complete) {
          tasks_text += `<label class="task completed">— ${task.title}</label>`;
        } else {
          tasks_text += `<label class="task">— ${task.title}</label>`;
        }
      });
    }




    family_events_and_tasks_wrapper.innerHTML += `
      <div class="family-member">
        <h2>${profile.display_name}</h2>
        <ul>
          ${events_text}
        </ul>
        ${tasks_text}
      </div>
    `;
  });
  if (family_events_and_tasks_wrapper.innerHTML === "") {
    family_events_and_tasks_wrapper.innerHTML = '<p class="empty_family_item">Empty 🌿</p>';
  }
}





function groupedItemsByPerson(items) {
  return items.reduce((acc, item) => {
    const key = item.user_id;            // group by owner UUID
    if (!acc[key]) {
      acc[key] = []; // start new array for this user if not seen yet
    }
    acc[key].push(item);
    return acc;
  }, {});
}



function uppercaseFirstLetter(str) {
  return String(str).charAt(0).toUpperCase() + String(str).slice(1);
}



function convertTo24Hour(timeStr) {
  const [time, modifier] = timeStr.split(" ");
  let [hours, minutes] = time.split(":").map(Number);

  if (modifier === "PM" && hours !== 12) {
    hours += 12;
  }
  if (modifier === "AM" && hours === 12) {
    hours = 0;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
}


function sortEventsForPerson(events_for_person) {
  events_for_person.sort((a, b) => {
    const timeA = new Date(`1970-01-01T${convertTo24Hour(a.time)}`);
    const timeB = new Date(`1970-01-01T${convertTo24Hour(b.time)}`);
    return timeA - timeB;
  });

  return events_for_person;
}






