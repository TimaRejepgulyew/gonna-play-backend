// Негативная пара к repolayer.repository.ts: тот же по форме импорт контроллера,
// но из контроллера (B6) — послойный запрет тут не действует.
import { listCtlItems } from "./ctllayer.peer.controller.js";

export const handleCtlItems = listCtlItems;
