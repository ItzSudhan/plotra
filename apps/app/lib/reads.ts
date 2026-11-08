import "server-only";
import { searchProject } from "./agent/search";
import { getBinder } from "./binder-actions";
import { listChat } from "./chat-actions";
import { getChangelog, getQuestionnaireResults, getReviewState, listQuestionnaires, listReaders } from "./editorial-actions";
import { getProjectStrings, listStrings } from "./interactive-actions";
import {
  getLayout,
  getNodeLinks,
  getNodePreview,
  getProjectLinks,
  getUnlinkedMentions,
  listLayouts,
} from "./knowledge-actions";
import { getActivity, getUserPrefs, listNotifications } from "./notify-actions";
import { getProjectConfig, listWorldCandidates } from "./project-actions";
import { getWritingStats } from "./stats-actions";
import { getTranslationUnits, listGlossary } from "./l10n-actions";
import { getBreakdown, getRecordingSheet, getShotLists } from "./production-actions";
import { getPublishSummary } from "./publish-actions";
import { listAttachments } from "./research-actions";
import { getStory, getTimelineEvents } from "./story-actions";
import { getSharedWorld, getWorldLinks, getWorld, listRetcons } from "./world-actions";
import { getManuscript, getOpenCommentCounts, getVersionContent, listComments, listPeople, listVersions } from "./workflow-actions";

/**
 * Read-only server functions the client may call through POST /api/read
 * (lib/read.ts). Each checks access itself, like any server action. They're
 * served by a route handler because Next runs a client's server actions one at
 * a time: a polled read would hold up the next edit, and vice versa.
 */
export const reads = {
  getBinder,
  getLayout,
  getNodeLinks,
  getNodePreview,
  getProjectLinks,
  getUnlinkedMentions,
  listLayouts,
  getStory,
  getTimelineEvents,
  listComments,
  listChat,
  listPeople,
  listVersions,
  getVersionContent,
  getManuscript,
  getOpenCommentCounts,
  getProjectConfig,
  listWorldCandidates,
  getWorld,
  getSharedWorld,
  getWorldLinks,
  listRetcons,
  getPublishSummary,
  getBreakdown,
  getRecordingSheet,
  getShotLists,
  getTranslationUnits,
  listGlossary,
  getReviewState,
  listReaders,
  listQuestionnaires,
  getQuestionnaireResults,
  getChangelog,
  listStrings,
  getProjectStrings,
  listAttachments,
  searchProject,
  listNotifications,
  getActivity,
  getUserPrefs,
  getWritingStats,
};

export type Reads = typeof reads;
