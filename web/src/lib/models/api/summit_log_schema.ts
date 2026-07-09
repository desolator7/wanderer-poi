import { z, ZodType } from "zod";
import type { SummitLog } from "../summit_log";

const DateOnlySchema = z.string().date();
const PocketBaseDateTimePattern =
    /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

const SummitLogDateSchema = z.string().refine((value) => {
    if (DateOnlySchema.safeParse(value).success) {
        return true;
    }

    return (
        PocketBaseDateTimePattern.test(value) &&
        !Number.isNaN(Date.parse(value.replace(" ", "T")))
    );
}, "invalid-date");


const SummitLogCreateSchema = z.object({
    id: z.string().length(15).optional(),
    date: SummitLogDateSchema,
    text: z.string().optional(),
    gpx: z.string().optional(),
    distance: z.number().nonnegative().optional(),
    elevation_gain: z.number().nonnegative().optional(),
    elevation_loss: z.number().nonnegative().optional(),
    duration: z.number().nonnegative().optional(),
    author: z.string().length(15),
    trail: z.string().length(15).optional(),
    external_provider: z.preprocess(
        (value) => (value === "" ? undefined : value),
        z.enum(["strava", "komoot", "hammerhead"]).optional(),
    ),
    external_id: z.string().optional(),
    photos: z.array(z.string()).default([])
}) satisfies ZodType<Partial<SummitLog>>

const SummitLogUpdateSchema = z.object({
    date: SummitLogDateSchema.optional(),
    text: z.string().optional(),
    gpx: z.string().optional(),
    distance: z.number().nonnegative().optional(),
    elevation_gain: z.number().nonnegative().optional(),
    elevation_loss: z.number().nonnegative().optional(),
    duration: z.number().nonnegative().optional(),
    external_provider: z.enum(["strava", "komoot", "hammerhead"]).optional(),
    external_id: z.string().optional(),
    photos: z.array(z.string()).optional(),
    "photos-": z.string().optional(),
    "photos+": z.string().optional(),
}) satisfies ZodType<Partial<SummitLog>>

export { SummitLogCreateSchema, SummitLogUpdateSchema };
