import { PoiAttributeCreateSchema } from "$lib/models/api/poi_attribute_schema";
import type { PoiAttribute } from "$lib/models/poi_attribute";
import { Collection, create, handleError, list } from "$lib/util/api_util";
import { json, type RequestEvent } from "@sveltejs/kit";

export async function GET(event: RequestEvent) {
    try {
        const r = await list<PoiAttribute>(event, Collection.poi_attributes);
        return json(r);
    } catch (e: any) {
        return handleError(e);
    }
}

export async function PUT(event: RequestEvent) {
    try {
        const r = await create<PoiAttribute>(
            event,
            PoiAttributeCreateSchema,
            Collection.poi_attributes,
        );
        return json(r);
    } catch (e: any) {
        return handleError(e);
    }
}
