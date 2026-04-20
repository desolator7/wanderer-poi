import { z, type ZodType } from "zod";
import type { Poi } from "../poi";
import { normalizePoiIcon } from "$lib/util/icon_util";
import { normalizePoiColor } from "$lib/util/poi_util";

const PoiAttributeValueSchema = z.union([
    z.string(),
    z.boolean(),
    z.null(),
]);

const PoiIconSchema = z
    .string()
    .max(64)
    .regex(/^[a-z0-9-]+$/)
    .transform((value) => normalizePoiIcon(value))
    .optional();
const PoiColorSchema = z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .transform((value) => normalizePoiColor(value))
    .optional();

export const PoiCreateSchema = z.object({
    id: z.string().length(15).optional(),
    name: z.string().min(1, "required"),
    description: z.string().optional(),
    location: z.string().optional(),
    lat: z.number({ coerce: true }).min(-90).max(90),
    lon: z.number({ coerce: true }).min(-180).max(180),
    icon: PoiIconSchema,
    color: PoiColorSchema,
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
    icon: PoiIconSchema,
    color: PoiColorSchema,
    public: z.boolean().optional(),
    category: z.string().length(15).optional(),
    attributes: z.record(z.string(), PoiAttributeValueSchema).optional(),
}) satisfies ZodType<Partial<Poi>>;
