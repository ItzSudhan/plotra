'use server';

import {
  blockFeedback,
  pageFeedback,
  type ActionResponse,
  type BlockFeedback,
  type PageFeedback,
} from '@/components/feedback/schema';

// Where a reader's feedback goes. It is always written to the server log, and
// is also posted to FEEDBACK_WEBHOOK_URL when that is set. The body carries
// both `content` and `text`, so a Discord or a Slack webhook takes it as is.

async function deliver(lines: string[]) {
  const message = lines.join('\n');
  console.log(`[docs feedback]\n${message}`);

  const webhook = process.env.FEEDBACK_WEBHOOK_URL;
  if (!webhook) return;

  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: message, text: message }),
  });
  if (!response.ok) console.error(`[docs feedback] the webhook answered ${response.status}`);
}

export async function onPageFeedbackAction(feedback: PageFeedback): Promise<ActionResponse> {
  feedback = pageFeedback.parse(feedback);
  const url = new URL(feedback.url);

  await deliver([`${feedback.opinion === 'good' ? '👍' : '👎'} ${url.pathname}`, feedback.message]);
  return {};
}

export async function onBlockFeedbackAction(feedback: BlockFeedback): Promise<ActionResponse> {
  feedback = blockFeedback.parse(feedback);
  const url = new URL(feedback.url);
  url.hash = feedback.blockId;

  await deliver([`💬 ${url.pathname}${url.hash}`, `> ${feedback.blockBody}`, feedback.message]);
  return {};
}
