import { PoiCreateSchema } from "$lib/models/api/poi_schema";
import type { Poi } from "$lib/models/poi";
import type { PoiAttribute } from "$lib/models/poi_attribute";
import {
    applyPrivateAttributesForUser,
    getPoiAttributeDefinitions,
    splitAttributeUpdates,
} from "$lib/server/poi_attributes";
import { Collection, handleError, list } from "$lib/util/api_util";
import { json, type RequestEvent } from "@sveltejs/kit";

export async function GET(event: RequestEvent) {
    try {
        const r = await list<Poi>(event, Collection.pois);
        const userId = event.locals.user?.id;
        const definitionsByCategory = new Map<string, PoiAttribute[]>();

        const items = await Promise.all(
            r.items.map(async (poi) => {
                if (!definitionsByCategory.has(poi.category)) {
                    const defs = await getPoiAttributeDefinitions(event.locals.pb, poi.category);
                    definitionsByCategory.set(poi.category, defs);
                }

                return applyPrivateAttributesForUser(
                    poi,
                    definitionsByCategory.get(poi.category) ?? [],
                    userId,
                );
            }),
        );

        return json({ ...r, items });
    } catch (e: any) {
        return handleError(e);
    }
}

export async function PUT(event: RequestEvent) {
    try {
        const data = await event.request.json();
        const safeData = PoiCreateSchema.parse(data);
        const definitions = await getPoiAttributeDefinitions(event.locals.pb, safeData.category);
        const userId = event.locals.user?.id;
        const isAdmin = event.locals.pb.authStore.isSuperuser;

        const split = splitAttributeUpdates(
            { ...safeData, private_attributes: safeData.private_attributes ?? {} } as Poi,
            definitions,
            safeData.attributes,
            userId,
            isAdmin,
        );

        const r = await event.locals.pb.collection("pois").create<Poi>(
            {
                ...safeData,
                attributes: split.attributes,
                private_attributes: split.private_attributes,
            },
            { requestKey: null },
        );

        return json(applyPrivateAttributesForUser(r, definitions, userId));
    } catch (e: any) {
        return handleError(e);
    }
}
