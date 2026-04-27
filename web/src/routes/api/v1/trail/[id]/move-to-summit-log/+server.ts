import type { SummitLog } from "$lib/models/summit_log";
import type { Trail } from "$lib/models/trail";
import { handleError } from "$lib/util/api_util";
import { json, type RequestEvent } from "@sveltejs/kit";
import { z } from "zod";

const MoveToSummitLogSchema = z.object({
    targetTrail: z.string().min(1),
});

function escapeFilterValue(value: string) {
    return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

export async function POST(event: RequestEvent) {
    try {
        if (!event.locals.user?.actor) {
            return json({ message: "unauthorized" }, { status: 401 });
        }

        const sourceTrailId = event.params.id;
        const { targetTrail } = MoveToSummitLogSchema.parse(
            await event.request.json(),
        );

        if (!sourceTrailId || sourceTrailId === targetTrail) {
            return json(
                { message: "source_and_target_trail_must_differ" },
                { status: 400 },
            );
        }

        const sourceTrail = await event.locals.pb
            .collection("trails")
            .getOne<Trail & Record<string, any>>(sourceTrailId);
        const target = await event.locals.pb
            .collection("trails")
            .getOne<Trail>(targetTrail);

        if (
            sourceTrail.author !== event.locals.user.actor ||
            target.author !== event.locals.user.actor
        ) {
            return json({ message: "forbidden" }, { status: 403 });
        }

        const sourceLogs = await event.locals.pb
            .collection("summit_logs")
            .getFullList<SummitLog>({
                filter: `trail="${escapeFilterValue(sourceTrailId)}"`,
            });

        if (sourceLogs.length === 0) {
            const newSummitLog: Record<string, any> = {
                distance: sourceTrail.distance,
                elevation_gain: sourceTrail.elevation_gain,
                elevation_loss: sourceTrail.elevation_loss,
                duration: sourceTrail.duration,
                date: sourceTrail.date,
                author: event.locals.user.actor,
                trail: targetTrail,
            };
            if (sourceTrail.external_provider) {
                newSummitLog.external_provider = sourceTrail.external_provider;
            }
            if (sourceTrail.external_id) {
                newSummitLog.external_id = sourceTrail.external_id;
            }

            await event.locals.pb.collection("summit_logs").create(newSummitLog);
        } else {
            for (const log of sourceLogs) {
                await event.locals.pb.collection("summit_logs").update(log.id!, {
                    trail: targetTrail,
                });
            }
        }

        if (!target.completed) {
            await event.locals.pb.collection("trails").update(targetTrail, {
                completed: true,
            });
        }

        const remainingSourceLogs = await event.locals.pb
            .collection("summit_logs")
            .getList(1, 1, {
                filter: `trail="${escapeFilterValue(sourceTrailId)}"`,
            });

        if (remainingSourceLogs.totalItems === 0) {
            await event.locals.pb.collection("trails").delete(sourceTrailId);
        }

        const updatedTarget = await event.locals.pb
            .collection("trails")
            .getOne<Trail>(targetTrail, {
                expand: "category,waypoints_via_trail,summit_logs_via_trail,trail_share_via_trail,tags",
            });

        return json(updatedTarget);
    } catch (e: any) {
        return handleError(e);
    }
}
