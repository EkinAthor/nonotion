export const IS_DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

import * as realClient from './real-client';
import * as demoClient from './demo-client';

const client = IS_DEMO_MODE ? demoClient : realClient;

export const authApi = client.authApi;
export const usersApi = client.usersApi;
export const sharesApi = client.sharesApi;
export const pagesApi = client.pagesApi;
export const blocksApi = client.blocksApi;
export const databaseApi = client.databaseApi;
export const filesApi = client.filesApi;
export const searchApi = client.searchApi;
export const importApi = client.importApi;
export const realtimeApi = client.realtimeApi;

export type { SearchResult, ShareWithUser, GetRowsOptions, GetRowsResult, RealtimeTokenResponse } from './real-client';
