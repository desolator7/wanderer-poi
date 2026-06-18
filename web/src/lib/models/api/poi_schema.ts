import { z, type ZodType } from "zod";
import type { Poi } from "../poi";
import { normalizePoiColor } from "$lib/util/poi_util";

const PoiAttributeValueSchema = z.union([
    z.string(),
    z.boolean(),
    z.null(),
]);
const PoiPrivateAttributesSchema = z.record(
    z.string(),
    z.record(z.string(), PoiAttributeValueSchema),
);

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
    color: PoiColorSchema,
    public: z.boolean().optional().default(false),
    category: z.string().length(15),
    author: z.string().length(15),
    attributes: z.record(z.string(), PoiAttributeValueSchema).optional().default({}),
    private_attributes: PoiPrivateAttributesSchema.optional().default({}),
}) satisfies ZodType<Partial<Poi>>;

export const PoiUpdateSchema = z.object({
    name: z.string().min(1, "required").optional(),
    description: z.string().optional(),
    location: z.string().optional(),
    lat: z.number({ coerce: true }).min(-90).max(90).optional(),
    lon: z.number({ coerce: true }).min(-180).max(180).optional(),
    color: PoiColorSchema,
    public: z.boolean().optional(),
    category: z.string().length(15).optional(),
    attributes: z.record(z.string(), PoiAttributeValueSchema).optional(),
    private_attributes: PoiPrivateAttributesSchema.optional(),
}) satisfies ZodType<Partial<Poi>>;
