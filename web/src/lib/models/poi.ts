import type * as M from "maplibre-gl";
import type { PoiAttributeValue } from "./poi_attribute";
import type { PoiCategory } from "./poi_category";

export class Poi {
    id?: string;
    name: string;
    description?: string;
    location?: string;
    lat: number;
    lon: number;
    public: boolean;
    category: string;
    author: string;
    attributes: Record<string, PoiAttributeValue>;
    marker?: M.Marker;
    created?: string;
    updated?: string;
    expand?: {
        category?: PoiCategory;
    };

    constructor(
        lat: number,
        lon: number,
        params: {
            name: string;
            category: string;
            id?: string;
            description?: string;
            location?: string;
            public?: boolean;
            author?: string;
            attributes?: Record<string, PoiAttributeValue>;
            created?: string;
            updated?: string;
            expand?: {
                category?: PoiCategory;
            };
        },
    ) {
        this.id = params.id;
        this.name = params.name;
        this.description = params.description ?? "";
        this.location = params.location ?? "";
        this.lat = lat;
        this.lon = lon;
        this.public = params.public ?? false;
        this.category = params.category;
        this.author = params.author ?? "000000000000000";
        this.attributes = params.attributes ?? {};
        this.created = params.created;
        this.updated = params.updated;
        this.expand = params.expand;
    }
}

export type PoiFilter = {
    q?: string;
    categoryIds?: string[];
    includePublic?: boolean;
    includeOwn?: boolean;
    authorId?: string;
};
