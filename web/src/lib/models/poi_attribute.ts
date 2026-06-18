import type { PoiCategory } from "./poi_category";

export type PoiAttributeType = "string" | "boolean" | "date";
export type PoiAttributeValueStorage = "public" | "private";
export type PoiAttributePublicWriteAccess = "all" | "admin";
export type PoiAttributeValue = string | boolean | null;

export class PoiAttribute {
    id?: string;
    name: string;
    key: string;
    type: PoiAttributeType;
    category: string;
    required: boolean;
    primary: boolean;
    author: string;
    value_storage: PoiAttributeValueStorage;
    public_write_access: PoiAttributePublicWriteAccess;
    created?: string;
    updated?: string;
    expand?: {
        category?: PoiCategory;
    };

    constructor(
        name: string,
        key: string,
        type: PoiAttributeType,
        category: string,
        params?: {
            id?: string;
            required?: boolean;
            primary?: boolean;
            author?: string;
            value_storage?: PoiAttributeValueStorage;
            public_write_access?: PoiAttributePublicWriteAccess;
            created?: string;
            updated?: string;
            expand?: {
                category?: PoiCategory;
            };
        },
    ) {
        this.id = params?.id;
        this.name = name;
        this.key = key;
        this.type = type;
        this.category = category;
        this.required = params?.required ?? false;
        this.primary = params?.primary ?? false;
        this.author = params?.author ?? "000000000000000";
        this.value_storage = params?.value_storage ?? "public";
        this.public_write_access = params?.public_write_access ?? "all";
        this.created = params?.created;
        this.updated = params?.updated;
        this.expand = params?.expand;
    }
}
