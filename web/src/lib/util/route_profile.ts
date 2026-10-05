import type { Category } from "$lib/models/category";
import type { Subcategory } from "$lib/models/subcategory";

export type RouteProfile = "pedestrian" | "bicycle" | "mountainbike" | "ebike";

function categoryKey(name?: string) {
    return name?.toLowerCase().normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ?? "";
}

export function supportsHikingDifficulty(category?: Category) {
    return ["hiking", "wandern"].includes(categoryKey(category?.name));
}

export function routeProfileForCategory(category?: Category, subcategory?: Subcategory): RouteProfile | null {
    const key = categoryKey(category?.name);
    if (["hiking", "wandern", "walking", "spazieren"].includes(key)) return "pedestrian";
    if (["e-bike", "ebike", "pedelec"].includes(key)) return "ebike";
    if (["mountain-biking", "mountainbike", "mountain-bike", "mtb"].includes(key)) return "mountainbike";
    if (!["biking", "cycling", "radfahren", "fahrrad"].includes(key)) return null;

    if (subcategory && subcategory.category === category?.id) {
        const subkey = categoryKey(subcategory.name);
        if (["mtb", "mountainbike", "mountain-bike"].includes(subkey)) return "mountainbike";
        if (["e-bike", "ebike", "pedelec"].includes(subkey)) return "ebike";
    }
    return "bicycle";
}
