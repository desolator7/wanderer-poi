import { PoiCategory } from "$lib/models/poi_category";
import { APIError } from "$lib/util/api_util";
import { get } from "svelte/store";
import { currentUser } from "./user_store";

export async function poi_categories_index(
    f: (url: RequestInfo | URL, config?: RequestInit) => Promise<Response> = fetch,
) {
    const r = await f(
        `/api/v1/poi-category?${new URLSearchParams({
            perPage: "-1",
            sort: "+name",
        })}`,
        { method: "GET" },
    );

    if (!r.ok) {
        const response = await r.json();
        throw new APIError(r.status, response.message, response.detail);
    }

    return (await r.json()).items as PoiCategory[];
}

export async function poi_categories_create(category: PoiCategory) {
    const user = get(currentUser);
    if (!user) {
        throw Error("Unauthenticated");
    }

    category.author = user.id;

    const r = await fetch("/api/v1/poi-category", {
        method: "PUT",
        body: JSON.stringify(category),
    });

    if (!r.ok) {
        const response = await r.json();
        throw new APIError(r.status, response.message, response.detail);
    }

    return (await r.json()) as PoiCategory;
}

export async function poi_categories_update(category: PoiCategory) {
    const r = await fetch(`/api/v1/poi-category/${category.id}`, {
        method: "POST",
        body: JSON.stringify(category),
    });

    if (!r.ok) {
        const response = await r.json();
        throw new APIError(r.status, response.message, response.detail);
    }

    return (await r.json()) as PoiCategory;
}

export async function poi_categories_delete(category: PoiCategory) {
    const r = await fetch(`/api/v1/poi-category/${category.id}`, {
        method: "DELETE",
    });

    if (!r.ok) {
        const response = await r.json();
        throw new APIError(r.status, response.message, response.detail);
    }

    return await r.json();
}
