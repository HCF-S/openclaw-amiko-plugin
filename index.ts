import { amikoPlugin } from "./src/channel.js";
import { setAmikoRuntime, setAmikoRegisterHttpRoute } from "./src/runtime.js";

export default {
  id: "amiko",
  name: "Amiko",
  description: "Connect OpenClaw bot to Amiko platform (direct and group chat via webhook)",

  configSchema: {},

  register(api: { runtime: any; registerChannel: (params: { plugin: any }) => void; registerHttpRoute: (opts: any) => void }) {
    setAmikoRuntime(api.runtime);
    setAmikoRegisterHttpRoute(api.registerHttpRoute.bind(api));
    api.registerChannel({ plugin: amikoPlugin });
  },
};

// Named exports for programmatic use
export { amikoPlugin } from "./src/channel.js";
export { setAmikoRuntime, getAmikoRuntime } from "./src/runtime.js";
export type { ResolvedAmikoAccount, AmikoConfig, AmikoAccountConfig } from "./src/types.js";
