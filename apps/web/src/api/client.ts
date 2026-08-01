export const IS_DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

import * as realClient from './real-client';
import * as demoClient from './demo-client';
import { trackMutations } from './save-tracking';

const client = IS_DEMO_MODE ? demoClient : realClient;

export const authApi = client.authApi;
export const usersApi = client.usersApi;
export const sharesApi = client.sharesApi;
// Content mutations report to saveStatusStore (top-bar save indicator).
// New mutation methods on these namespaces must be added to the allowlists.
export const pagesApi = trackMutations(client.pagesApi, ['create', 'update', 'delete', 'updateOrder']);
export const blocksApi = trackMutations(client.blocksApi, ['create', 'update', 'delete', 'reorder']);
export const databaseApi = trackMutations(client.databaseApi, [
  'updateSchema',
  'updateProperties',
  'updateKanbanCardOrder',
]);
export const filesApi = trackMutations(client.filesApi, ['upload']);
export const searchApi = client.searchApi;
export const importApi = client.importApi;
export const realtimeApi = client.realtimeApi;
export const mcpApi = client.mcpApi;

export type { SearchResult, ShareWithUser, GetRowsOptions, GetRowsResult, RealtimeTokenResponse, McpAccessWithTitle } from './real-client';
