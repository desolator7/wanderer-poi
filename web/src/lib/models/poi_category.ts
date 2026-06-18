import type { icons } from "$lib/util/icon_util";

export class PoiCategory {
    id?: string;
    name: string;
    description?: string;
    icon?: typeof icons[number];
    author: string;
    created?: string;
    updated?: string;

    constructor(
        name: string,
        params?: {
            id?: string;
            description?: string;
            icon?: typeof icons[number];
            author?: string;
            created?: string;
            updated?: string;
        },
    ) {
        this.id = params?.id;
        this.name = name;
        this.description = params?.description ?? "";
        this.icon = params?.icon ?? "location-dot";
        this.author = params?.author ?? "000000000000000";
        this.created = params?.created;
        this.updated = params?.updated;
    }
}
