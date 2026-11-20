import { createDatabaseClient, createSiteContext, errorResponse, requireUser as platformRequireUser } from "./_qoder/backend.mjs";
import { createCloudAgentsClient } from "./qca/cloud-agents.mjs";
import { createCoordinator } from "./qca/coordinator.ts";
import { ensureBindings, type QcaBindings } from "./qca/resources.ts";
import { resolveOwnerId } from "./identity.ts";
import { application } from "./routes.ts";

// Trusted server-only configuration for the Qoder CN production region.
const QCA_ORIGIN = "https://api.qoder.com.cn";
const APPLICATION_SCOPE = "workerrights-cn-prod";

const db = createDatabaseClient();
const client = createCloudAgentsClient({ origin: QCA_ORIGIN });
const coordinator = createCoordinator(db);

let bindingsPromise: Promise<QcaBindings> | null = null;
const qca = {
  client,
  coordinator,
  ensureBindings: (): Promise<QcaBindings> => {
    if (!bindingsPromise) {
      bindingsPromise = ensureBindings(client, coordinator, APPLICATION_SCOPE).catch((error) => {
        bindingsPromise = null;
        throw error;
      });
    }
    return bindingsPromise;
  },
};

const handle = application({
  db,
  requireUser: (context) => ({
    user_id: resolveOwnerId(context.request, () => platformRequireUser(context) as { user_id?: string; id?: string }),
  }),
  qca,
});

Deno.serve(async (request: Request): Promise<Response> => {
  let context;
  try {
    context = createSiteContext(request);
    return await handle(context);
  } catch (error) {
    return errorResponse(error, context?.requestId);
  }
});