"use client";

import { AgentPanel } from "./agent-panel";

/** The agent as a view in a pane (plan.md 2.11): the same chat as the sidebar's, with room to read. */
export function AgentView() {
  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col">
      <AgentPanel />
    </div>
  );
}
