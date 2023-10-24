import { DataviewApi, getAPI } from "obsidian-dataview";
import { error } from "./log";

export function getDataViewApi() : DataviewApi{
    const dataViewApi = getAPI()
    if (!dataViewApi) {
        error('DataView is not loaded yet!')
        throw new Error('Dataview is not loaded yet!')
    }
    return dataViewApi;
}