import { useEffect, useState } from "react";
import { roleAccessProfiles } from "./access.js";

export function useAppNavigation({
  initialSection = "dialogs",
  initialRoleMode = "Администратор",
  isOutboundOpen,
  setOutboundOpen,
  setToast
}) {
  const [section, setSection] = useState(initialSection);
  const [roleMode, setRoleMode] = useState(initialRoleMode);
  const access = roleAccessProfiles[roleMode];
  const canAccessSection = access.sections.includes(section);

  useEffect(() => {
    if (!canAccessSection) {
      setSection("dialogs");
      setToast(`${roleMode}: ${access.reason}`);
    }
  }, [access.reason, canAccessSection, roleMode, section, setToast]);

  useEffect(() => {
    if (!access.canOutbound && isOutboundOpen) {
      setOutboundOpen(false);
    }
  }, [access.canOutbound, isOutboundOpen, setOutboundOpen]);

  function handleRoleModeChange(nextRole) {
    setRoleMode(nextRole);
    setToast(`Режим прав: ${nextRole}`);
  }

  function handleSectionSelect(nextSection) {
    if (!access.sections.includes(nextSection)) {
      setToast(`${roleMode}: ${access.reason}`);
      return;
    }

    setSection(nextSection);
  }

  function handleBackToDialogs() {
    setSection("dialogs");
  }

  function handleOutboundRequest() {
    if (!access.canOutbound) {
      setToast(access.reason);
      return;
    }

    setOutboundOpen(true);
  }

  return {
    access,
    section,
    roleMode,
    handleRoleModeChange,
    handleSectionSelect,
    handleBackToDialogs,
    handleOutboundRequest
  };
}
