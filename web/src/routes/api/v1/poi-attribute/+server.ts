import { PoiAttributeCreateSchema } from "$lib/models/api/poi_attribute_schema";
import type { PoiAttribute } from "$lib/models/poi_attribute";
import { Collection, handleError, list } from "$lib/util/api_util";
import { json, type RequestEvent } from "@sveltejs/kit";

async function clearOtherPrimaryAttributes(
    event: RequestEvent,
    attribute: PoiAttribute,
) {
    if (!attribute.primary || attribute.type !== "boolean") {
        return;
    }

    const others = await event.locals.pb
        .collection("poi_attributes")
        .getFullList<PoiAttribute>({
            filter: `category="${attribute.category}" && id!="${attribute.id}" && primary=true`,
        });

    for (const other of others) {
        await event.locals.pb
            .collection("poi_attributes")
            .update(other.id!, { primary: false }, { requestKey: null });
    }
}

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
        const data = await event.request.json();
        const safeData = PoiAttributeCreateSchema.parse(data);
        if (safeData.type !== "boolean") {
            safeData.primary = false;
        }
        if (safeData.value_storage === "private") {
            safeData.public_write_access = "all";
        }

        const r = await event.locals.pb
            .collection("poi_attributes")
            .create<PoiAttribute>(safeData, { requestKey: null });
        await clearOtherPrimaryAttributes(event, r);
        return json(r);
    } catch (e: any) {
        return handleError(e);
    }
}
