self.addEventListener("push", (event) => {
  const payload = readPushPayload(event);
  event.waitUntil(
    self.registration.showNotification(payload.title || "Support Communication", {
      body: payload.body || "New notification",
      data: {
        url: payload.url || "/#/app"
      },
      tag: payload.tag || "support-communication-notification"
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/#/app";
  event.waitUntil(focusOrOpenClient(targetUrl));
});

function readPushPayload(event) {
  if (!event.data) {
    return {};
  }

  try {
    return event.data.json();
  } catch {
    return {
      body: event.data.text()
    };
  }
}

async function focusOrOpenClient(targetUrl) {
  const windows = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
  for (const client of windows) {
    if ("focus" in client) {
      await client.focus();
      if ("navigate" in client) {
        await client.navigate(targetUrl);
      }
      return;
    }
  }

  await self.clients.openWindow(targetUrl);
}
