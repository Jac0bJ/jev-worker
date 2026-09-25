import type { Preset } from "../types";
import * as formSpam from "./form-spam";
import * as commentModeration from "./comment-moderation";
import * as leadQuality from "./lead-quality";
import * as supportRoute from "./support-route";
export const presets: Record<string, Preset> = Object.assign(
  Object.create(null) as Record<string, Preset>,
  {
    "form-spam": { name: "form-spam", ...formSpam },
    "comment-moderation": { name: "comment-moderation", ...commentModeration },
    "lead-quality": { name: "lead-quality", ...leadQuality },
    "support-route": { name: "support-route", ...supportRoute },
  },
);
