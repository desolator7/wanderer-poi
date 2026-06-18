import { PoiCategoryUpdateSchema } from "$lib/models/api/poi_category_schema";
import type { PoiCategory } from "$lib/models/poi_category";
import { Collection, handleError, remove, show, update } from "$lib/util/api_util";
import { json, type RequestEvent } from "@sveltejs/kit";

export async function GET(event: RequestEvent) {
    try {
        const r = await show<PoiCategory>(event, Collection.poi_categories);
        return json(r);
    } catch (e: any) {
        return handleError(e);
    }
}

export async function POST(event: RequestEvent) {
    try {
        const r = await update<PoiCategory>(
            event,
            PoiCategoryUpdateSchema,
            Collection.poi_categories,
        );
        return json(r);
    } catch (e: any) {
        return handleError(e);
    }
}

export async function DELETE(event: RequestEvent) {
    try {
        const r = await remove(event, Collection.poi_categories);
        return json(r);
    } catch (e: any) {
        return handleError(e);
    }
}
