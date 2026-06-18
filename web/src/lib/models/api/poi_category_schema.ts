import { icons } from "$lib/util/icon_util";
import { z, type ZodType } from "zod";
import type { PoiCategory } from "../poi_category";

export const PoiCategoryCreateSchema = z.object({
    id: z.string().length(15).optional(),
    name: z.string().min(1, "required"),
    description: z.string().optional(),
    icon: z.enum(icons).optional(),
    author: z.string().length(15),
}) satisfies ZodType<Partial<PoiCategory>>;

export const PoiCategoryUpdateSchema = z.object({
    name: z.string().min(1, "required").optional(),
    description: z.string().optional(),
    icon: z.enum(icons).optional(),
}) satisfies ZodType<Partial<PoiCategory>>;
