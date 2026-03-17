export type GroupPolicy = "disabled" | "allowlist" | "open";

export type GroupAccessParams = {
  senderId: string;
  groupId: string;
  policy: GroupPolicy;
  allowFrom: string[];
  requireMention: boolean;
  mentionFound: boolean;
};

export type GroupAccessResult = {
  allowed: boolean;
  reason: string;
};

export function isAmikoSenderAllowed(senderId: string, allowFrom: string[]): boolean {
  if (allowFrom.length === 0) return false;
  const normalized = senderId.trim();
  return allowFrom.some((e) => e.trim() === normalized);
}

export function evaluateAmikoGroupAccess(params: GroupAccessParams): GroupAccessResult {
  const { senderId, policy, allowFrom, requireMention, mentionFound } = params;

  if (policy === "disabled") {
    return { allowed: false, reason: "group_policy_disabled" };
  }

  if (requireMention && !mentionFound) {
    return { allowed: false, reason: "mention_required" };
  }

  if (policy === "allowlist") {
    const allowed = isAmikoSenderAllowed(senderId, allowFrom);
    return { allowed, reason: allowed ? "allowlist_match" : "sender_not_in_allowlist" };
  }

  // policy === "open"
  return { allowed: true, reason: "open_policy" };
}
