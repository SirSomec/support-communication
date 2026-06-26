import { useCallback, useState } from "react";

export function useAppTransientState({ initialToast = "" } = {}) {
  const [isOutboundOpen, setOutboundOpen] = useState(false);
  const [toast, setToast] = useState(initialToast);

  const handleToastClose = useCallback(() => {
    setToast("");
  }, []);

  return {
    handleToastClose,
    isOutboundOpen,
    setOutboundOpen,
    setToast,
    toast
  };
}
