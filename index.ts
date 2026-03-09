import { amikoPlugin } from "./src/channel.js";
import { setAmikoRuntime } from "./src/runtime.js";

export default {
  id: "amiko",
  name: "Amiko",
  description: "Connect OpenClaw bot to Amiko platform (direct and group chat via polling API)",

  configSchema: {},

  register(api: { runtime: any; registerChannel: (params: { plugin: any }) => void }) {
    setAmikoRuntime(api.runtime);
    api.registerChannel({ plugin: amikoPlugin });
  },
};

// Named exports for programmatic use
export { amikoPlugin } from "./src/channel.js";
export { setAmikoRuntime, getAmikoRuntime } from "./src/runtime.js";
export type { ResolvedAmikoAccount, AmikoConfig, AmikoAccountConfig } from "./src/types.js";
