import { poi_attributes_index } from "$lib/stores/poi_attribute_store";
import { poi_categories_index } from "$lib/stores/poi_category_store";
import { pois_index } from "$lib/stores/poi_store";
import type { Load } from "@sveltejs/kit";

export const load: Load = async ({ fetch }) => {
    const [categories, attributeDefinitions, poiResult] = await Promise.all([
        poi_categories_index(fetch),
        poi_attributes_index(undefined, fetch),
        pois_index(undefined, 1, -1, undefined, fetch),
    ]);

    return {
        categories,
        attributeDefinitions,
        pois: poiResult.items,
    };
};
