import { PoiCategoryCreateSchema } from "$lib/models/api/poi_category_schema";
import type { PoiCategory } from "$lib/models/poi_category";
import { Collection, create, handleError, list } from "$lib/util/api_util";
import { json, type RequestEvent } from "@sveltejs/kit";

export async function GET(event: RequestEvent) {
    try {
        const r = await list<PoiCategory>(event, Collection.poi_categories);
        return json(r);
    } catch (e: any) {
        return handleError(e);
    }
}

export async function PUT(event: RequestEvent) {
    try {
        const r = await create<PoiCategory>(
            event,
            PoiCategoryCreateSchema,
            Collection.poi_categories,
        );
        return json(r);
    } catch (e: any) {
        return handleError(e);
    }
}
