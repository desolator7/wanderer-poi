import { z, type ZodType } from "zod";
import type { Poi } from "../poi";

const PoiAttributeValueSchema = z.union([
    z.string(),
    z.boolean(),
    z.null(),
]);

export const PoiCreateSchema = z.object({
    id: z.string().length(15).optional(),
    name: z.string().min(1, "required"),
    description: z.string().optional(),
    location: z.string().optional(),
    lat: z.number({ coerce: true }).min(-90).max(90),
    lon: z.number({ coerce: true }).min(-180).max(180),
    public: z.boolean().optional().default(false),
    category: z.string().length(15),
    author: z.string().length(15),
    attributes: z.record(z.string(), PoiAttributeValueSchema).optional().default({}),
}) satisfies ZodType<Partial<Poi>>;

export const PoiUpdateSchema = z.object({
    name: z.string().min(1, "required").optional(),
    description: z.string().optional(),
    location: z.string().optional(),
    lat: z.number({ coerce: true }).min(-90).max(90).optional(),
    lon: z.number({ coerce: true }).min(-180).max(180).optional(),
    public: z.boolean().optional(),
    category: z.string().length(15).optional(),
    attributes: z.record(z.string(), PoiAttributeValueSchema).optional(),
}) satisfies ZodType<Partial<Poi>>;
