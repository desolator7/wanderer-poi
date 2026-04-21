import { browser } from "$app/environment";
import { DOMParser as XMLDOMParser } from "@xmldom/xmldom";
import type { Feature, FeatureCollection, Position } from "geojson";
import JSZip from "jszip";
import { kml } from "$lib/vendor/toGeoJSON/toGeoJSON";
import { Poi, type PoiFilter } from "$lib/models/poi";
import type { PoiAttribute, PoiAttributeValue } from "$lib/models/poi_attribute";
import { normalizePoiIcon } from "./icon_util";

export const primaryPoiColor = "#16A34A";

function sanitizeAttributeKey(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

export function buildPoiAttributeKey(name: string) {
    return sanitizeAttributeKey(name);
}

function normalizeDateValue(value: unknown) {
    if (!value) {
        return null;
    }
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
    }
    const parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }
    return parsed.toISOString().slice(0, 10);
}

function normalizeBooleanValue(value: unknown) {
    if (typeof value === "boolean") {
        return value;
    }
    const normalized = String(value).trim().toLowerCase();
    if (["true", "1", "yes", "ja", "y", "x"].includes(normalized)) {
        return true;
    }
    if (["false", "0", "no", "nein", "n", ""].includes(normalized)) {
        return false;
    }
    return null;
}

export function coercePoiAttributeValue(
    definition: Pick<PoiAttribute, "type">,
    value: unknown,
): PoiAttributeValue {
    if (value === undefined || value === null || value === "") {
        return null;
    }
    if (definition.type === "boolean") {
        return normalizeBooleanValue(value);
    }
    if (definition.type === "date") {
        return normalizeDateValue(value);
    }
    return String(value);
}

export function normalizePoiColor(value: unknown) {
    if (typeof value !== "string") {
        return undefined;
    }

    const trimmed = value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
        return trimmed.toUpperCase();
    }

    if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
        return `#${trimmed.toUpperCase()}`;
    }

    return undefined;
}

export function getPoiDisplayColor(
    poi: Pick<Poi, "attributes" | "color">,
    definitions: PoiAttribute[] = [],
) {
    const primaryDefinition = definitions.find(
        (definition) => definition.type === "boolean" && definition.primary,
    );

    if (
        primaryDefinition &&
        poi.attributes?.[primaryDefinition.key] === true
    ) {
        return primaryPoiColor;
    }

    return normalizePoiColor(poi.color);
}

export function coercePoiAttributes(
    rawAttributes: Record<string, unknown> | undefined,
    definitions: PoiAttribute[],
) {
    const result: Record<string, PoiAttributeValue> = {};

    for (const definition of definitions) {
        const directValue = rawAttributes?.[definition.key];
        const fallbackValue =
            directValue ??
            rawAttributes?.[definition.name] ??
            rawAttributes?.[sanitizeAttributeKey(definition.name)];

        result[definition.key] = coercePoiAttributeValue(definition, fallbackValue);
    }

    return result;
}


export function canEditPoiAttributeValue(
    definition: Pick<PoiAttribute, "value_storage" | "public_write_access">,
    options?: {
        currentUserId?: string;
        isAdmin?: boolean;
    },
) {
    if (definition.value_storage === "private") {
        return Boolean(options?.currentUserId);
    }

    if (definition.public_write_access === "admin") {
        return Boolean(options?.isAdmin);
    }

    return true;
}
export function getPoiAttributeDefinitionsForCategory(
    definitions: PoiAttribute[],
    categoryId?: string,
) {
    return definitions.filter((definition) => definition.category === categoryId);
}

function getPointCoordinates(feature: Feature): Position[] {
    if (!feature.geometry) {
        return [];
    }
    if (feature.geometry.type === "Point") {
        return [feature.geometry.coordinates];
    }
    if (feature.geometry.type === "MultiPoint") {
        return feature.geometry.coordinates;
    }
    return [];
}

export function parsePoisFromGeoJSON(
    geojson: Feature | FeatureCollection,
    options: {
        category: string;
        isPublic: boolean;
        author: string;
        icon?: string;
        attributeDefinitions?: PoiAttribute[];
    },
) {
    const features =
        geojson.type === "FeatureCollection" ? geojson.features : [geojson];
    const pois: Poi[] = [];

    for (const feature of features) {
        const coordinates = getPointCoordinates(feature);
        for (const [index, coordinate] of coordinates.entries()) {
            const properties = feature.properties ?? {};
            const rawName = String(
                properties.name ?? properties.title ?? "POI",
            ).trim();
            const name =
                coordinates.length > 1 ? `${rawName} ${index + 1}` : rawName;
            const description = String(
                properties.description ?? properties.desc ?? "",
            );
            const color = normalizePoiColor(
                properties["icon-color"] ??
                    properties["marker-color"] ??
                    properties.color,
            );

            pois.push(
                new Poi(coordinate[1], coordinate[0], {
                    name,
                    description,
                    icon: normalizePoiIcon(options.icon),
                    color,
                    public: options.isPublic,
                    author: options.author,
                    category: options.category,
                    attributes: coercePoiAttributes(
                        properties as Record<string, unknown>,
                        options.attributeDefinitions ?? [],
                    ),
                }),
            );
        }
    }

    return pois;
}

export async function parsePoisFromKmlFile(
    file: Blob,
    options: {
        category: string;
        isPublic: boolean;
        author: string;
        icon?: string;
        attributeDefinitions?: PoiAttribute[];
    },
) {
    const fileBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(fileBuffer);
    const isKmz =
        bytes[0] === 0x50 &&
        bytes[1] === 0x4b &&
        bytes[2] === 0x03 &&
        bytes[3] === 0x04;

    let kmlData = await file.text();

    if (isKmz) {
        const zip = new JSZip();
        const zipContents = await zip.loadAsync(fileBuffer);
        kmlData = (await zipContents.file("doc.kml")?.async("string")) ?? "";
    }

    const parser = browser ? new DOMParser() : new XMLDOMParser();
    const nodes = parser.parseFromString(kmlData, "text/xml");
    const geojson = kml(nodes) as Feature | FeatureCollection;

    return parsePoisFromGeoJSON(geojson, options);
}

function escapeFilterValue(value: string) {
    return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

export function buildPoiFilter(
    filter: PoiFilter | undefined,
    currentUserId?: string,
) {
    if (!filter) {
        return "";
    }

    const clauses: string[] = [];

    if (filter.q?.trim()) {
        const q = escapeFilterValue(filter.q.trim());
        clauses.push(
            `(name~"${q}" || description~"${q}" || location~"${q}")`,
        );
    }

    if (filter.categoryIds?.length) {
        clauses.push(
            `(${filter.categoryIds.map((id) => `category="${escapeFilterValue(id)}"`).join(" || ")})`,
        );
    }

    if (filter.authorId) {
        clauses.push(`author="${escapeFilterValue(filter.authorId)}"`);
    }

    if (filter.includeOwn === false && filter.includePublic === false) {
        clauses.push(`id=""`);
    } else if (currentUserId) {
        if (filter.includeOwn === true && filter.includePublic === false) {
            clauses.push(`author="${escapeFilterValue(currentUserId)}"`);
        } else if (filter.includeOwn === false && filter.includePublic === true) {
            clauses.push(`public=true && author!="${escapeFilterValue(currentUserId)}"`);
        }
    } else if (filter.includePublic === false) {
        clauses.push(`id=""`);
    } else {
        clauses.push(`public=true`);
    }

    return clauses.join(" && ");
}
