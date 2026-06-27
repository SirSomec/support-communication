import { useState } from "react";

export function useComposerState({
  initialComposeMode = "reply",
  initialDraft = "",
  initialTranscriptMode = "all"
} = {}) {
  const [composeMode, setComposeMode] = useState(initialComposeMode);
  const [draft, setDraft] = useState(initialDraft);
  const [transcriptMode, setTranscriptMode] = useState(initialTranscriptMode);

  return {
    composeMode,
    draft,
    setComposeMode,
    setDraft,
    setTranscriptMode,
    transcriptMode
  };
}
