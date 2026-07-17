import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../public/browser-push-service-worker.js", import.meta.url), "utf8");

function loadWorker() {
  const listeners = new Map();
  const opened = [];
  const shown = [];
  const self = {
    addEventListener(name, listener) {
      listeners.set(name, listener);
    },
    clients: {
      async matchAll() {
        return [];
      },
      async openWindow(url) {
        opened.push(url);
      }
    },
    location: { origin: "https://support.example" },
    registration: {
      async showNotification(title, options) {
        shown.push({ options, title });
      }
    }
  };
  vm.runInNewContext(source, { self, URL });
  return { listeners, opened, shown };
}

async function dispatch(listener, event) {
  let pending;
  listener({
    ...event,
    waitUntil(value) {
      pending = value;
    }
  });
  await pending;
}

describe("browser push service worker navigation", () => {
  it("replaces cross-origin push links with the application fallback", async () => {
    const worker = loadWorker();
    await dispatch(worker.listeners.get("push"), {
      data: { json: () => ({ title: "Alert", url: "https://phishing.example/login" }) }
    });

    assert.equal(worker.shown[0].options.data.url, "/#/app");
  });

  it("opens only normalized same-origin paths from notification clicks", async () => {
    const worker = loadWorker();
    await dispatch(worker.listeners.get("notificationclick"), {
      notification: {
        close() {},
        data: { url: "https://support.example/#/app/dialogs?id=42" }
      }
    });

    assert.deepEqual(worker.opened, ["/#/app/dialogs?id=42"]);
  });
});
