import { PoiUpdateSchema } from "$lib/models/api/poi_schema";
import type { Poi } from "$lib/models/poi";
import { Collection, handleError, remove, show, update } from "$lib/util/api_util";
import { json, type RequestEvent } from "@sveltejs/kit";

export async function GET(event: RequestEvent) {
    try {
        const r = await show<Poi>(event, Collection.pois);
        return json(r);
    } catch (e: any) {
        return handleError(e);
    }
}

export async function POST(event: RequestEvent) {
    try {
        const r = await update<Poi>(event, PoiUpdateSchema, Collection.pois);
        return json(r);
    } catch (e: any) {
        return handleError(e);
    }
}

export async function DELETE(event: RequestEvent) {
    try {
        const r = await remove(event, Collection.pois);
        return json(r);
    } catch (e: any) {
        return handleError(e);
    }
}
