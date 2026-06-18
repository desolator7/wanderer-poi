import { PoiAttribute } from "$lib/models/poi_attribute";
import { APIError } from "$lib/util/api_util";
import { get } from "svelte/store";
import { currentUser } from "./user_store";

export async function poi_attributes_index(
    categoryId?: string,
    f: (url: RequestInfo | URL, config?: RequestInit) => Promise<Response> = fetch,
) {
    const params = new URLSearchParams({
        perPage: "-1",
        sort: "+name",
        expand: "category",
    });

    if (categoryId) {
        params.set("filter", `category="${categoryId}"`);
    }

    const r = await f(`/api/v1/poi-attribute?${params.toString()}`, {
        method: "GET",
    });

    if (!r.ok) {
        const response = await r.json();
        throw new APIError(r.status, response.message, response.detail);
    }

    return (await r.json()).items as PoiAttribute[];
}

export async function poi_attributes_create(attribute: PoiAttribute) {
    const user = get(currentUser);
    if (!user) {
        throw Error("Unauthenticated");
    }

    attribute.author = user.id;

    const r = await fetch("/api/v1/poi-attribute", {
        method: "PUT",
        body: JSON.stringify(attribute),
    });

    if (!r.ok) {
        const response = await r.json();
        throw new APIError(r.status, response.message, response.detail);
    }

    return (await r.json()) as PoiAttribute;
}

export async function poi_attributes_update(attribute: PoiAttribute) {
    const r = await fetch(`/api/v1/poi-attribute/${attribute.id}`, {
        method: "POST",
        body: JSON.stringify(attribute),
    });

    if (!r.ok) {
        const response = await r.json();
        throw new APIError(r.status, response.message, response.detail);
    }

    return (await r.json()) as PoiAttribute;
}

export async function poi_attributes_delete(attribute: PoiAttribute) {
    const r = await fetch(`/api/v1/poi-attribute/${attribute.id}`, {
        method: "DELETE",
    });

    if (!r.ok) {
        const response = await r.json();
        throw new APIError(r.status, response.message, response.detail);
    }

    return await r.json();
}
