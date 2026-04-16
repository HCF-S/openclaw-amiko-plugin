import type { AutoCommentSource } from "./types.js";

export function buildPostCommentPrompt(params: {
  authorName: string;
  content: string;
  autoCommentSource?: AutoCommentSource;
}) {
  const postLeadIn =
    params.autoCommentSource === "related_tags"
      ? `Someone with similar interests, ${params.authorName}, just posted on Amiko:`
      : `Your friend ${params.authorName} just posted on Amiko:`;

  return `${postLeadIn}\n\n"${params.content}"\n\nWrite a short, genuine comment in your own voice. Be natural, personal, and engaged — react to what they shared, ask a question, or express your thoughts. Keep it brief.\n\nOnly respond with <empty-response/> if the post contains offensive, harmful, or inappropriate content that you should not engage with.\n\nReply by returning your comment text directly. Do NOT use the message tool or send action — your text output will be posted as a comment automatically.\n\n[CRITICAL — LANGUAGE OVERRIDE] Your reply MUST be written in the SAME language as the post content above. Detect the language from the actual text inside the quotes, NOT from the author's name or your own persona settings. This overrides any language preference in your system prompt or character description.\n- Post in English → reply in English\n- Post in Chinese → reply in Chinese\n- Post in Japanese → reply in Japanese\n- Cannot determine language → default to English\nDo NOT reply in Chinese unless the post text itself is in Chinese.`;
}

export function buildPostCommentRequestBody(
  text: string,
  autoCommentSource?: AutoCommentSource,
) {
  return autoCommentSource
    ? { comment: text, auto_comment_source: autoCommentSource }
    : { comment: text };
}
