// Public entry point for search. Consumers import the configured singleton
// `searchProvider` (typed as the interface) so they depend ONLY on the
// `SearchProvider` contract — the Algolia impl is a swappable detail.

import { algoliaProvider } from './algoliaProvider';
import { SearchProvider } from './SearchProvider';

export const searchProvider: SearchProvider = algoliaProvider;

export type { SearchOptions, SearchProvider, SearchResult } from './SearchProvider';
