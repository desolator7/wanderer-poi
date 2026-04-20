import { Poi, type PoiFilter } from "$lib/models/poi";
import type { PoiAttribute } from "$lib/models/poi_attribute";
import { APIError } from "$lib/util/api_util";
import { buildPoiFilter } from "$lib/util/poi_util";
import { get } from "svelte/store";
import { currentUser } from "./user_store";

export async function pois_index(
    filter?: PoiFilter,
    page: number = 1,
    perPage: number = -1,
    currentUserId?: string,
    f: (url: RequestInfo | URL, config?: RequestInit) => Promise<Response> = fetch,
) {
    const user = get(currentUser);
    const filterText = buildPoiFilter(filter, currentUserId ?? user?.id);
    const params = new URLSearchParams({
        page: page.toString(),
        perPage: perPage.toString(),
        sort: "+name",
        expand: "category",
    });

    if (filterText.length) {
        params.set("filter", filterText);
    }

    const r = await f(`/api/v1/poi?${params.toString()}`, { method: "GET" });

    if (!r.ok) {
        const response = await r.json();
        throw new APIError(r.status, response.message, response.detail);
    }

    return await r.json();
}

export async function pois_show(
    id: string,
    f: (url: RequestInfo | URL, config?: RequestInit) => Promise<Response> = fetch,
) {
    const r = await f(`/api/v1/poi/${id}?expand=category`, {
        method: "GET",
    });

    if (!r.ok) {
        const response = await r.json();
        throw new APIError(r.status, response.message, response.detail);
    }

    return (await r.json()) as Poi;
}

export async function pois_create(poi: Poi) {
    const user = get(currentUser);
    if (!user) {
        throw Error("Unauthenticated");
    }

    poi.author = user.id;

    const r = await fetch("/api/v1/poi", {
        method: "PUT",
        body: JSON.stringify(poi),
    });

    if (!r.ok) {
        const response = await r.json();
        throw new APIError(r.status, response.message, response.detail);
    }

    return (await r.json()) as Poi;
}

export async function pois_update(poi: Poi) {
    const r = await fetch(`/api/v1/poi/${poi.id}`, {
        method: "POST",
        body: JSON.stringify(poi),
    });

    if (!r.ok) {
        const response = await r.json();
        throw new APIError(r.status, response.message, response.detail);
    }

    return (await r.json()) as Poi;
}

export async function pois_delete(poi: Poi) {
    const r = await fetch(`/api/v1/poi/${poi.id}`, {
        method: "DELETE",
    });

    if (!r.ok) {
        const response = await r.json();
        throw new APIError(r.status, response.message, response.detail);
    }

    return await r.json();
}

export async function pois_import(
    file: File,
    options: {
        category: string;
        isPublic: boolean;
    },
) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("category", options.category);
    formData.append("public", options.isPublic ? "true" : "false");

    const r = await fetch("/api/v1/poi/import", {
        method: "PUT",
        body: formData,
    });

    if (!r.ok) {
        const response = await r.json();
        throw new APIError(r.status, response.message, response.detail);
    }

    return (await r.json()) as Poi[];
}

export function getPoiAttributesForSave(
    attributeDefinitions: PoiAttribute[],
    values: Record<string, unknown>,
) {
    const result: Record<string, string | boolean | null> = {};

    for (const definition of attributeDefinitions) {
        const value = values[definition.key];
        if (value === undefined) {
            result[definition.key] = null;
            continue;
        }

        if (definition.type === "boolean") {
            result[definition.key] = Boolean(value);
        } else if (definition.type === "date") {
            result[definition.key] = value ? String(value) : null;
        } else {
            const normalized = String(value).trim();
            result[definition.key] = normalized.length ? normalized : null;
        }
    }

    return result;
}
