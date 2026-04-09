self.addEventListener("install", (event) => {
  console.log("[sw] instalado");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("[sw] activado");
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {
    title: "Clínica CEMO",
    body: "Tienes una nueva actualización en tu ticket.",
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    url: self.location.origin,
  };

  try {
    if (event.data) {
      const incoming = event.data.json();

      data = {
        ...data,
        ...incoming,
      };
    }
  } catch (error) {
    console.warn("[sw] push sin JSON válido:", error);
  }

  const title = data.title || "Clínica CEMO";
  const options = {
    body: data.body || "Tienes una nueva actualización en tu ticket.",
    icon: data.icon || "./icons/icon-192.png",
    badge: data.badge || "./icons/icon-192.png",
    data: {
      url: data.url || self.location.origin,
    },
    tag: data.tag || "clinica-cemo-ticket",
    renotify: true,
    requireInteraction: false,
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl =
    event.notification?.data?.url || self.location.origin;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) {
            client.navigate(targetUrl);
          }
          return;
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});