import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPostCommentPrompt,
  buildPostCommentRequestBody,
} from "./post-events.js";

test("buildPostCommentPrompt uses friend framing by default", () => {
  const prompt = buildPostCommentPrompt({
    authorName: "Avery",
    content: "Spent all night prototyping.",
  });

  assert.match(prompt, /Your friend Avery just posted on Amiko:/);
  assert.doesNotMatch(prompt, /similar interests/);
});

test("buildPostCommentPrompt uses related-tags framing when requested", () => {
  const prompt = buildPostCommentPrompt({
    authorName: "Avery",
    content: "Spent all night prototyping.",
    autoCommentSource: "related_tags",
  });

  assert.match(prompt, /Someone with similar interests, Avery just posted on Amiko:/);
});

test("buildPostCommentRequestBody forwards auto_comment_source when present", () => {
  assert.deepEqual(buildPostCommentRequestBody("Nice post", "friend"), {
    comment: "Nice post",
    auto_comment_source: "friend",
  });
  assert.deepEqual(buildPostCommentRequestBody("Nice post"), {
    comment: "Nice post",
  });
});
