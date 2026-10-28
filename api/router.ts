import { authRouter } from "./auth-router";
import { createRouter, publicQuery } from "./middleware";
import { coreRouter } from "./routers/core";
import { hrRouter, hrRouter2 } from "./routers/hr";
import { formsRouter } from "./routers/forms";
import { portalRouter } from "./routers/portal";
import { trainingRegisterRouter } from "./routers/training-register";
import { rotaRouter } from "./routers/rota";
import { attendanceRouter } from "./routers/attendance";
import { cqcRouter } from "./routers/cqc";
import { crmRouter } from "./routers/crm";
import { websiteRouter } from "./routers/website";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  core: coreRouter,
  hr: hrRouter,
  hr2: hrRouter2,
  forms: formsRouter,
  portal: portalRouter,
  trainingRegister: trainingRegisterRouter,
  rota: rotaRouter,
  attendance: attendanceRouter,
  cqc: cqcRouter,
  crm: crmRouter,
  website: websiteRouter,
});

export type AppRouter = typeof appRouter;
