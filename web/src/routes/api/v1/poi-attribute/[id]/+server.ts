import { PoiAttributeUpdateSchema } from "$lib/models/api/poi_attribute_schema";
import type { PoiAttribute } from "$lib/models/poi_attribute";
import { Collection, handleError, remove, show } from "$lib/util/api_util";
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
        const r = await show<PoiAttribute>(event, Collection.poi_attributes);
        return json(r);
    } catch (e: any) {
        return handleError(e);
    }
}

export async function POST(event: RequestEvent) {
    try {
        const id = event.params.id!;
        const existing = await event.locals.pb
            .collection("poi_attributes")
            .getOne<PoiAttribute>(id);
        const data = await event.request.json();
        const safeData = PoiAttributeUpdateSchema.parse(data);
        const nextType = safeData.type ?? existing.type;

        if (nextType !== "boolean") {
            safeData.primary = false;
        }

        const nextStorage = safeData.value_storage ?? existing.value_storage ?? "public";
        if (nextStorage === "private") {
            safeData.public_write_access = "all";
        }

        const r = await event.locals.pb
            .collection("poi_attributes")
            .update<PoiAttribute>(id, safeData);
        await clearOtherPrimaryAttributes(event, r);
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
