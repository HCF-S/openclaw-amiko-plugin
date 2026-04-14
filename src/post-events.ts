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

  return `IMPORTANT: You MUST reply in the same language as the original post. If the post is in English, reply in English. If the post is in Chinese, reply in Chinese.\n\n${postLeadIn}\n\n"${params.content}"\n\nWrite a short, genuine comment in your own voice. Be natural, personal, and engaged — react to what they shared, ask a question, or express your thoughts. Keep it brief.\n\nOnly respond with <empty-response/> if the post contains offensive, harmful, or inappropriate content that you should not engage with.\n\nIMPORTANT: Reply by returning your comment text directly. Do NOT use the message tool or send action — your text output will be posted as a comment automatically.`;
}

export function buildPostCommentRequestBody(
  text: string,
  autoCommentSource?: AutoCommentSource,
) {
  return autoCommentSource
    ? { comment: text, auto_comment_source: autoCommentSource }
    : { comment: text };
}
