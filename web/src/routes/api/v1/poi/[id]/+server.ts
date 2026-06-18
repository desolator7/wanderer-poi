import { PoiUpdateSchema } from "$lib/models/api/poi_schema";
import type { Poi } from "$lib/models/poi";
import {
    applyPrivateAttributesForUser,
    getPoiAttributeDefinitions,
    splitAttributeUpdates,
} from "$lib/server/poi_attributes";
import { Collection, handleError, remove } from "$lib/util/api_util";
import { json, type RequestEvent } from "@sveltejs/kit";

export async function GET(event: RequestEvent) {
    try {
        const id = event.params.id!;
        const searchParams = Object.fromEntries(event.url.searchParams);
        const r = await event.locals.pb.collection("pois").getOne<Poi>(id, searchParams);
        const definitions = await getPoiAttributeDefinitions(event.locals.pb, r.category);
        return json(applyPrivateAttributesForUser(r, definitions, event.locals.user?.id));
    } catch (e: any) {
        return handleError(e);
    }
}

export async function POST(event: RequestEvent) {
    try {
        const id = event.params.id!;
        const existing = await event.locals.pb.collection("pois").getOne<Poi>(id);
        const data = await event.request.json();
        const safeData = PoiUpdateSchema.parse(data);

        const categoryId = safeData.category ?? existing.category;
        const definitions = await getPoiAttributeDefinitions(event.locals.pb, categoryId);
        const userId = event.locals.user?.id;
        const isAdmin = event.locals.pb.authStore.isSuperuser;
        const split = splitAttributeUpdates(
            existing,
            definitions,
            safeData.attributes,
            userId,
            isAdmin,
        );

        const r = await event.locals.pb.collection("pois").update<Poi>(id, {
            ...safeData,
            attributes: split.attributes,
            private_attributes: split.private_attributes,
        });
        return json(applyPrivateAttributesForUser(r, definitions, userId));
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
