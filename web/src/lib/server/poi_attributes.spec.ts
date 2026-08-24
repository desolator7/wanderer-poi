import { describe, expect, it } from "vitest";
import type { Poi } from "$lib/models/poi";
import type { PoiAttribute } from "$lib/models/poi_attribute";
import { PoiCreateSchema, PoiUpdateSchema } from "$lib/models/api/poi_schema";
import {
    applyPrivateAttributesForUser,
    attributesForPersistence,
} from "./poi_attributes";

const definitions = [
    {
        key: "stamped",
        value_storage: "private",
    },
] as PoiAttribute[];

const poi = {
    id: "poi000000000001",
    attributes: { source: "OpenStreetMap" },
    private_attributes: {
        user00000000001: { stamped: true },
        user00000000002: { stamped: false },
    },
} as unknown as Poi;

describe("applyPrivateAttributesForUser", () => {
    it("removes all private attribute buckets from anonymous responses", () => {
        const result = applyPrivateAttributesForUser(poi, definitions, undefined);

        expect(result.attributes).toEqual({
            source: "OpenStreetMap",
            stamped: null,
        });
        expect(result).not.toHaveProperty("private_attributes");
    });

    it("projects only the current user's values and removes the raw field", () => {
        const result = applyPrivateAttributesForUser(
            poi,
            definitions,
            "user00000000001",
        );

        expect(result.attributes.stamped).toBe(true);
        expect(result).not.toHaveProperty("private_attributes");
    });
});

describe("attributesForPersistence", () => {
    it("sends private values through the normal attributes input", () => {
        expect(
            attributesForPersistence(
                { source: "OpenStreetMap" },
                { user00000000001: { stamped: true } },
                "user00000000001",
            ),
        ).toEqual({ source: "OpenStreetMap", stamped: true });
    });

    it("does not expose private values for anonymous writes", () => {
        expect(
            attributesForPersistence(
                { source: "OpenStreetMap" },
                { user00000000001: { stamped: true } },
                undefined,
            ),
        ).toEqual({ source: "OpenStreetMap" });
    });
});

describe("POI API schemas", () => {
    it("never accepts private_attributes as client-controlled data", () => {
        const privateAttributes = {
            user00000000001: { stamped: true },
        };
        const created = PoiCreateSchema.parse({
            name: "Test POI",
            lat: 51,
            lon: 10,
            category: "category0000001",
            author: "user00000000001",
            private_attributes: privateAttributes,
        });
        const updated = PoiUpdateSchema.parse({
            private_attributes: privateAttributes,
        });

        expect(created).not.toHaveProperty("private_attributes");
        expect(updated).not.toHaveProperty("private_attributes");
    });
});
