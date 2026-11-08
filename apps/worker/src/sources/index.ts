import type { SearchAdapter, Source } from '../core/types.ts';
import { accesstradeSources } from './accesstrade/index.ts';
import { beSearchAdapter, beSources } from './be/index.ts';
import { tikiSearchAdapter, tikiSources } from './tiki/index.ts';

export const SOURCES: Source[] = [...tikiSources, ...beSources, ...accesstradeSources];

export const SEARCH_ADAPTERS: SearchAdapter[] = [tikiSearchAdapter, beSearchAdapter];
