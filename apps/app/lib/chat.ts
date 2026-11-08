// Chat beside the page (beat-the-competitors.md step 8). Pure, shared by the panel and the inspector.

/** The notice a chat refreshes on, announced through presence: the project's chat, or a note's. */
export const chatNotice = (nodeId: string | null) => `chat:${nodeId ?? "project"}`;
