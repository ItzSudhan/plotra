"use client";

import { useState } from "react";
import { ChangelogTab } from "@/components/editorial/changelog-tab";
import { useQuestionnaires, useReviews } from "@/components/editorial/data";
import { InboxTab } from "@/components/editorial/inbox-tab";
import { QuestionnairesTab } from "@/components/editorial/questionnaires-tab";
import { ReadersTab } from "@/components/editorial/readers-tab";
import { RulesTab } from "@/components/editorial/rules-tab";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { Segmented, Toolbar } from "./view-ui";
import { isLocalMode } from "@/lib/local-mode";

// Reviews (plan.md 2.8 "Review, editorial & approval"): what's waiting for
// approval, who has to approve what, the project's beta readers and their
// questionnaires, and what changed since each release.

type Tab = "inbox" | "rules" | "readers" | "questionnaires" | "changelog";

export function ReviewsView() {
  const { user } = useWorkspace();
  const [tab, setTab] = useState<Tab>("inbox");
  const { data: reviews } = useReviews();
  const { data: questionnaires } = useQuestionnaires();

  const waiting = Object.values(reviews?.nodes ?? {}).filter((n) => n.approvals.some((a) => a.reviewerId === user.id && a.status === "pending")).length;
  const toAnswer = (questionnaires ?? []).filter((q) => q.canAnswer && !q.myAnswers).length;
  const count = (label: string, n: number) => (n ? `${label} · ${n}` : label);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <Toolbar>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "inbox", label: count("Inbox", waiting) },
            { value: "rules", label: "Rules" },
            // Beta readers are people the project is shared with: nobody, in local mode.
            ...(isLocalMode ? [] : [{ value: "readers" as const, label: "Beta readers" }]),
            { value: "questionnaires", label: count("Questionnaires", toAnswer) },
            { value: "changelog", label: "Changelog" },
          ]}
        />
      </Toolbar>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "inbox" ? (
          <InboxTab />
        ) : tab === "rules" ? (
          <RulesTab />
        ) : tab === "readers" ? (
          <ReadersTab />
        ) : tab === "questionnaires" ? (
          <QuestionnairesTab />
        ) : (
          <ChangelogTab />
        )}
      </div>
    </div>
  );
}
