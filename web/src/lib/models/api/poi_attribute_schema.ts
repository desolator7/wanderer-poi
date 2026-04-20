import { z, type ZodType } from "zod";
import type { PoiAttribute } from "../poi_attribute";

export const PoiAttributeCreateSchema = z.object({
    id: z.string().length(15).optional(),
    name: z.string().min(1, "required"),
    key: z.string().min(1, "required").regex(/^[a-z0-9_]+$/, "invalid-key"),
    type: z.enum(["string", "boolean", "date"]),
    category: z.string().length(15),
    required: z.boolean().optional().default(false),
    author: z.string().length(15),
}) satisfies ZodType<Partial<PoiAttribute>>;

export const PoiAttributeUpdateSchema = z.object({
    name: z.string().min(1, "required").optional(),
    key: z.string().min(1, "required").regex(/^[a-z0-9_]+$/, "invalid-key").optional(),
    type: z.enum(["string", "boolean", "date"]).optional(),
    category: z.string().length(15).optional(),
    required: z.boolean().optional(),
}) satisfies ZodType<Partial<PoiAttribute>>;
