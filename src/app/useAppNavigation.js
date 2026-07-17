import { useEffect, useState } from "react";
import { buildAccessProfile, buildAccessProfileForRoleMode, constrainPermissionsForRoleMode } from "./access.js";

export function useAppNavigation({
  initialSection = "dialogs",
  initialRoleMode = "Администратор",
  isOutboundOpen,
  permissionModel = null,
  sessionPermissions = null,
  setOutboundOpen,
  setToast,
  useSessionPermissions = false
}) {
  const [section, setSection] = useState(initialSection);
  const [roleMode, setRoleMode] = useState(initialRoleMode);
  const access = resolveNavigationAccess({
    permissionModel,
    roleMode,
    sessionPermissions,
    useSessionPermissions
  });
  const canAccessSection = access.sections.includes(section);

  useEffect(() => {
    if (!canAccessSection) {
      setSection(selectFallbackSection(access.sections));
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
    setSection(selectFallbackSection(access.sections));
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

export function selectFallbackSection(sections = []) {
  return sections.includes("dialogs") ? "dialogs" : sections[0] ?? "";
}

export function resolveNavigationAccess({
  permissionModel = null,
  roleMode = "Администратор",
  sessionPermissions = null,
  useSessionPermissions = false
} = {}) {
  if (useSessionPermissions) {
    return buildAccessProfile(
      constrainPermissionsForRoleMode(sessionPermissions ?? [], roleMode, permissionModel),
      permissionModel
    );
  }

  return buildAccessProfileForRoleMode(roleMode, permissionModel);
}
