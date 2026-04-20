import { PoiCreateSchema } from "$lib/models/api/poi_schema";
import type { Poi } from "$lib/models/poi";
import { Collection, create, handleError, list } from "$lib/util/api_util";
import { json, type RequestEvent } from "@sveltejs/kit";

export async function GET(event: RequestEvent) {
    try {
        const r = await list<Poi>(event, Collection.pois);
        return json(r);
    } catch (e: any) {
        return handleError(e);
    }
}

export async function PUT(event: RequestEvent) {
    try {
        const r = await create<Poi>(event, PoiCreateSchema, Collection.pois);
        return json(r);
    } catch (e: any) {
        return handleError(e);
    }
}
