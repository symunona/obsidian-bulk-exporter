import { getAPI } from "obsidian-dataview";
import { error } from "./log";

/**
 * `obsidian-dataview`'s shipped `.d.ts` files reference each other through
 * bare, non-relative specifiers (e.g. `"data-index/index"`) that only
 * resolve under a bundler-style module resolution. Under this project's
 * `"moduleResolution": "node"` they don't resolve, so every type re-exported
 * from the package (including `DataviewApi` itself) collapses to an
 * unchecked type. This is a minimal, honest description of the surface this
 * plugin actually calls (`DataviewApi.query`, see obsidian-dataview's
 * `lib/api/plugin-api.d.ts` / `lib/api/result.d.ts`).
 */
export interface DataviewQueryResult {
    type: string;
    values: unknown[];
}

export interface DataviewQuerySuccess {
    successful: true;
    value: DataviewQueryResult;
}

export interface DataviewQueryFailure {
    successful: false;
    error: string;
}

export interface DataviewLikeApi {
    query(source: string): Promise<DataviewQuerySuccess | DataviewQueryFailure>;
}

export function isDataviewAvailable(): boolean {
    return !!getAPI();
}

export function getDataViewApi(): DataviewLikeApi {
    const dataViewApi = getAPI() as DataviewLikeApi | undefined
    if (!dataViewApi) {
        error('DataView is not loaded yet!')
        throw new Error('Dataview is not loaded yet!')
    }
    return dataViewApi;
}
