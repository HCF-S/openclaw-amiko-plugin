import { z } from "zod";

const amikoAccountSchema = z.object({
  name: z.string().optional(),
  enabled: z.boolean().optional(),
  token: z.string().optional(),
  apiBaseUrl: z.string().url().optional(),
  dmPolicy: z.enum(["allowlist", "open", "disabled"]).optional(),
  allowFrom: z.array(z.string()).optional(),
  groupPolicy: z.enum(["disabled", "allowlist", "open"]).optional(),
  groupAllowFrom: z.array(z.string()).optional(),
  webhookPath: z.string().optional(),
  webhookSecret: z.string().optional(),
});

export const AmikoConfigSchema = amikoAccountSchema.extend({
  accounts: z.record(z.string(), amikoAccountSchema).optional(),
  defaultAccount: z.string().optional(),
});

export type AmikoConfigInput = z.input<typeof AmikoConfigSchema>;
export type AmikoConfigOutput = z.output<typeof AmikoConfigSchema>;
