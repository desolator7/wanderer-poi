import { PoiAttributeUpdateSchema } from "$lib/models/api/poi_attribute_schema";
import type { PoiAttribute } from "$lib/models/poi_attribute";
import { Collection, handleError, remove, show, update } from "$lib/util/api_util";
import { json, type RequestEvent } from "@sveltejs/kit";

export async function GET(event: RequestEvent) {
    try {
        const r = await show<PoiAttribute>(event, Collection.poi_attributes);
        return json(r);
    } catch (e: any) {
        return handleError(e);
    }
}

export async function POST(event: RequestEvent) {
    try {
        const r = await update<PoiAttribute>(
            event,
            PoiAttributeUpdateSchema,
            Collection.poi_attributes,
        );
        return json(r);
    } catch (e: any) {
        return handleError(e);
    }
}

export async function DELETE(event: RequestEvent) {
    try {
        const r = await remove(event, Collection.poi_attributes);
        return json(r);
    } catch (e: any) {
        return handleError(e);
    }
}
