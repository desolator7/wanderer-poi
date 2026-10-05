import type { Trail } from "$lib/models/trail";
import type PocketBase from "pocketbase";
import { describe, expect, it, vi } from "vitest";
import { markTrailsCompletedByCurrentUser } from "./trail_completion";

describe("personal trail completion", () => {
    it("combines own manual completions and own logs while ignoring another owner's flag", async () => {
        const getFullList = vi.fn().mockResolvedValue([{ trail: "own-log" }, { trail: "both" }]);
        const pb = { collection: vi.fn(() => ({ getFullList })) } as unknown as PocketBase;
        const trails = [
            { id: "manual", author: "me", completed: true },
            { id: "foreign", author: "other", completed: true },
            { id: "own-log", author: "other", completed: false },
            { id: "both", author: "me", completed: true },
            { id: "planned", author: "me", completed: false },
        ] as Trail[];
        await markTrailsCompletedByCurrentUser(pb, "me", trails);
        expect(trails.map((trail) => trail.completed_by_current_user)).toEqual([true, false, true, true, false]);
        expect(getFullList.mock.calls[0][0].filter).toContain('author="me"');
    });

    it("clears personal state for anonymous requests without querying logs", async () => {
        const pb = { collection: vi.fn() } as unknown as PocketBase;
        const trails = [{ id: "route", author: "me", completed: true, completed_by_current_user: true }] as Trail[];
        await markTrailsCompletedByCurrentUser(pb, undefined, trails);
        expect(trails[0].completed_by_current_user).toBe(false);
        expect(pb.collection).not.toHaveBeenCalled();
    });
});
