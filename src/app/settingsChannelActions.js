export async function submitSettingsChannelStatusToggle({ enabled, reason, type } = {}, service) {
  const channelType = String(type ?? "").trim();
  if (!channelType) {
    return {
      ok: false,
      message: "Channel type is required."
    };
  }

  if (typeof enabled !== "boolean") {
    return {
      ok: false,
      message: "Channel enabled state is required."
    };
  }

  const response = await service.updateChannelTypeStatus({
    enabled,
    reason,
    type: channelType
  });

  if (response.status !== "ok") {
    return {
      ok: false,
      message: response.error?.message ?? "Не удалось изменить статус канала."
    };
  }

  const channel = response.data?.channel;
  if (!channel || channel.enabled !== enabled) {
    return {
      ok: false,
      message: "Backend did not return confirmed channel state."
    };
  }

  const auditEvents = Array.isArray(response.data?.auditEvents) ? response.data.auditEvents : [];
  const auditEvent = auditEvents.find((event) => event?.id && event.immutable === true);
  if (!auditEvent) {
    return {
      ok: false,
      message: "Backend response does not include immutable audit evidence."
    };
  }

  return {
    auditId: auditEvent.id,
    channel,
    connections: Array.isArray(response.data?.connections) ? response.data.connections : [],
    ok: true
  };
}
