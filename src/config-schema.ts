import { z } from "zod";

const amikoAccountSchema = z.object({
  name: z.string().optional(),
  enabled: z.boolean().optional(),
  twinId: z.string().optional(),
  token: z.string().optional(),
  platformApiBaseUrl: z.string().url().optional(),
  chatApiBaseUrl: z.string().url().optional(),
  apiBaseUrl: z.string().url().optional(),
  webhookPath: z.string().optional(),
  webhookSecret: z.string().optional(),
});

export const AmikoConfigSchema = amikoAccountSchema.extend({
  accounts: z.record(z.string(), amikoAccountSchema).optional(),
  defaultAccount: z.string().optional(),
});

export type AmikoConfigInput = z.input<typeof AmikoConfigSchema>;
export type AmikoConfigOutput = z.output<typeof AmikoConfigSchema>;
