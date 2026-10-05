import type { Category } from "$lib/models/category";
import type { Subcategory } from "$lib/models/subcategory";
import { describe, expect, it } from "vitest";
import { routeProfileForCategory, supportsHikingDifficulty } from "./route_profile";

const category = (name: string): Category => ({ id: name, name });
const subcategory = (parent: string, name: string): Subcategory => ({ id: `${parent}-${name}`, name, category: parent });

describe("routing with upstream categories", () => {
    it("keeps all activity categories while supplying only supported routing profiles", () => {
        const categories = ["Hiking", "Walking", "Running", "Climbing", "Skiing", "Canoeing", "Biking", "Other"].map(category);
        expect(categories.map((item) => routeProfileForCategory(item))).toEqual([
            "pedestrian", "pedestrian", null, null, null, null, "bicycle", null,
        ]);
        expect(categories.map((item) => item.name)).toEqual(["Hiking", "Walking", "Running", "Climbing", "Skiing", "Canoeing", "Biking", "Other"]);
    });

    it("uses bicycle subcategories without mistaking running subcategories for cycling", () => {
        expect(routeProfileForCategory(category("Biking"), subcategory("Biking", "MTB"))).toBe("mountainbike");
        expect(routeProfileForCategory(category("Biking"), subcategory("Biking", "E-Bike"))).toBe("ebike");
        expect(routeProfileForCategory(category("Running"), subcategory("Running", "Road"))).toBeNull();
        expect(routeProfileForCategory(category("Biking"), subcategory("Running", "MTB"))).toBe("bicycle");
    });

    it("limits SAC assessments to hiking and leaves custom activities without guessed profiles", () => {
        expect(supportsHikingDifficulty(category("Hiking"))).toBe(true);
        expect(supportsHikingDifficulty(category("Walking"))).toBe(false);
        expect(supportsHikingDifficulty(category("Biking"))).toBe(false);
        expect(routeProfileForCategory(category("Schwimmen"))).toBeNull();
        expect(routeProfileForCategory()).toBeNull();
    });
});
