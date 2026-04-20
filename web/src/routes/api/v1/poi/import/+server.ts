import type { Poi } from "$lib/models/poi";
import { poi_attributes_index } from "$lib/stores/poi_attribute_store";
import { parsePoisFromKmlFile } from "$lib/util/poi_util";
import { ClientResponseError } from "pocketbase";
import { handleError } from "$lib/util/api_util";
import { json, type RequestEvent } from "@sveltejs/kit";

export async function PUT(event: RequestEvent) {
    try {
        if (!event.locals.user?.id) {
            throw new ClientResponseError({
                status: 401,
                response: { message: "Unauthorized" },
            });
        }

        const data = await event.request.formData();
        const file = data.get("file");
        const category = data.get("category")?.toString();

        if (!(file instanceof Blob) || !category?.length) {
            throw new ClientResponseError({
                status: 400,
                response: { message: "Missing import data" },
            });
        }

        const definitions = await poi_attributes_index(category, event.fetch);
        const pois = await parsePoisFromKmlFile(file, {
            category,
            isPublic: data.get("public") === "true",
            author: event.locals.user.id,
            icon: data.get("icon")?.toString(),
            attributeDefinitions: definitions,
        });

        const createdPois: Poi[] = [];
        for (const poi of pois) {
            const createdPoi = await event.locals.pb.collection("pois").create<Poi>(
                poi,
                { requestKey: null },
            );
            createdPois.push(createdPoi);
        }

        return json(createdPois);
    } catch (e: any) {
        return handleError(e);
    }
}
