/**
 * Removes BOOTSTRAP.md from amiko webhook sessions (direct, group, post).
 * Only amiko:conversation (or amiko:main) sessions keep BOOTSTRAP.md.
 *
 * Session key formats:
 *   agent:{agentId}:amiko:conversation:{id}  → keep BOOTSTRAP.md
 *   agent:{agentId}:amiko:main:{id}          → keep BOOTSTRAP.md (future)
 *   agent:{agentId}:amiko:direct:{id}        → remove
 *   agent:{agentId}:amiko:group:{id}         → remove
 *   agent:{agentId}:amiko:post:{id}          → remove
 *   agent:{agentId}:amiko:inbox              → remove
 *
 * Non-amiko sessions are left untouched.
 */

const AMIKO_SESSION_RE = /:amiko:/;
const AMIKO_KEEP_BOOTSTRAP_RE = /:amiko:(?:conversation|main)/;

export default async function bootstrapChannelFilter(event) {
  if (event.type !== "agent" || event.action !== "bootstrap") return;

  const { sessionKey, bootstrapFiles } = event.context;
  if (!sessionKey || !Array.isArray(bootstrapFiles)) return;

  // Only touch amiko sessions; leave everything else as-is
  if (!AMIKO_SESSION_RE.test(sessionKey)) return;

  // conversation / main sessions keep BOOTSTRAP.md
  if (AMIKO_KEEP_BOOTSTRAP_RE.test(sessionKey)) return;

  // All other amiko sessions: remove BOOTSTRAP.md
  event.context.bootstrapFiles = bootstrapFiles.filter(
    (f) => f.name !== "BOOTSTRAP.md",
  );
}
