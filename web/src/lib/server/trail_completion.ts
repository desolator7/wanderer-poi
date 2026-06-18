import type { Trail } from "$lib/models/trail";
import type PocketBase from "pocketbase";

type TrailWithUserCompletion = Trail & {
    completed_by_current_user?: boolean;
};

type SummitLogTrailRef = {
    trail: string;
};

function escapeFilterValue(value: string) {
    return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

export async function markTrailsCompletedByCurrentUser<T extends TrailWithUserCompletion>(
    pb: PocketBase,
    actorId: string | undefined,
    trails: T[],
) {
    for (const trail of trails) {
        trail.completed_by_current_user = false;
    }

    if (!actorId || trails.length === 0) {
        return trails;
    }

    const trailIds = Array.from(
        new Set(
            trails
                .map((trail) => trail.id)
                .filter((id): id is string => Boolean(id)),
        ),
    );

    if (trailIds.length === 0) {
        return trails;
    }

    const completedTrailIds = new Set<string>();
    const chunkSize = 50;
    for (let i = 0; i < trailIds.length; i += chunkSize) {
        const chunk = trailIds.slice(i, i + chunkSize);
        const trailFilter = chunk
            .map((id) => `trail="${escapeFilterValue(id)}"`)
            .join(" || ");
        const logs = await pb.collection("summit_logs").getFullList<SummitLogTrailRef>({
            filter: `author="${escapeFilterValue(actorId)}" && (${trailFilter})`,
            requestKey: null,
        });

        for (const log of logs) {
            completedTrailIds.add(log.trail);
        }
    }

    for (const trail of trails) {
        trail.completed_by_current_user = Boolean(
            trail.id && completedTrailIds.has(trail.id),
        );
    }

    return trails;
}
