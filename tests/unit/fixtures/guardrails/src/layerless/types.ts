// Беслойная фикстура (прообраз src/user/types.ts). Импорт типовой намеренно:
// прогоном подтверждено, что patterns noRestrictedImports ловят и import type.
import type { SharedShape } from "../somewhere.js";

export type LayerlessPayload = SharedShape;
