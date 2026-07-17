self.addEventListener("push", (event) => {
  const payload = readPushPayload(event);
  const targetUrl = normalizeTargetUrl(payload.url);
  event.waitUntil(
    self.registration.showNotification(payload.title || "Support Communication", {
      body: payload.body || "New notification",
      data: {
        url: targetUrl
      },
      tag: payload.tag || "support-communication-notification"
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = normalizeTargetUrl(event.notification.data?.url);
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

function normalizeTargetUrl(value) {
  try {
    const target = new URL(typeof value === "string" && value.trim() ? value : "/#/app", self.location.origin);
    if (target.origin !== self.location.origin) {
      return "/#/app";
    }
    return `${target.pathname}${target.search}${target.hash}` || "/#/app";
  } catch {
    return "/#/app";
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
