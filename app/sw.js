self.addEventListener('push', function(event) {
  const data = event.data.json();
  const options = {
    body: data.body,
    icon: 'famsync-icon.png' // Optional
  };
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});
