import { describe, expect, it } from "vitest";
import type { Poi } from "$lib/models/poi";
import type { PoiAttribute } from "$lib/models/poi_attribute";
import { PoiCreateSchema, PoiUpdateSchema } from "$lib/models/api/poi_schema";
import {
    applyPrivateAttributesForUser,
    attributesForPersistence,
    getPoiAttributeDefinitions,
    splitAttributeUpdates,
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
        const result = applyPrivateAttributesForUser(poi, definitions, "user00000000001");

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

describe("getPoiAttributeDefinitions", () => {
    it("propagates backend errors instead of allowing unvalidated writes", async () => {
        const failure = new Error("definition lookup failed");
        const pb = {
            collection: () => ({
                getFullList: () => Promise.reject(failure),
            }),
        } as never;

        await expect(getPoiAttributeDefinitions(pb, "category0000001")).rejects.toBe(failure);
    });
});

describe("splitAttributeUpdates", () => {
    it("ignores undeclared input when a category has no definitions", () => {
        const result = splitAttributeUpdates(poi, [], { rogue: "value" }, "user00000000001", false);

        expect(result.attributes).toEqual({ source: "OpenStreetMap" });
    });

    it("keeps removed private definitions out of persistence input", () => {
        const result = splitAttributeUpdates(poi, [], undefined, "user00000000001", false);

        expect(
            attributesForPersistence(
                result.attributes,
                result.private_attributes,
                "user00000000001",
            ),
        ).toEqual({ source: "OpenStreetMap" });
    });

    it("drops old values and admin input when the category changes", () => {
        const categoryDefinitions = [
            {
                key: "editable",
                category: "category0000002",
                type: "string",
                value_storage: "public",
                public_write_access: "all",
            },
            {
                key: "protected",
                category: "category0000002",
                type: "string",
                value_storage: "public",
                public_write_access: "admin",
            },
            {
                key: "visited",
                category: "category0000002",
                type: "boolean",
                value_storage: "private",
                public_write_access: "all",
            },
        ] as PoiAttribute[];
        const existing = {
            ...poi,
            attributes: {
                data_source: "OpenStreetMap",
                old_value: "remove me",
                protected: "old",
            },
            private_attributes: {
                user00000000001: { old_private: true },
            },
        } as Poi;

        const result = splitAttributeUpdates(
            existing,
            categoryDefinitions,
            {
                editable: "new",
                protected: "forged",
                visited: true,
            },
            "user00000000001",
            false,
            true,
        );

        expect(result.attributes).toEqual({
            data_source: "OpenStreetMap",
            editable: "new",
        });
        expect(result.private_attributes.user00000000001).toEqual({
            visited: true,
        });
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
