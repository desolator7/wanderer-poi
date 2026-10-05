import { error, isHttpError, json, type NumericRange, type RequestEvent } from "@sveltejs/kit";
import { ClientResponseError, type ListResult } from "pocketbase";
import { ZodError, type ZodSchema } from "zod";
import { RecordListOptionsSchema, RecordIdSchema, RecordOptionsSchema } from "$lib/models/api/base_schema";

export class APIError extends Error {
    status: number;
    message: string;
    detail: any;

    constructor(status: number, message: string, detail?: any) {
        super(typeof message === "string" ? message : String(message));
        this.status = status;
        this.message = message;
        this.detail = detail;
    }
}

function getErrorMessagePart(value: unknown, seen = new WeakSet<object>()): string | null {
    if (typeof value === "string") {
        return value.trim() || null;
    }

    if (value instanceof Error) {
        return value.message.trim() || null;
    }

    if (!value || typeof value !== "object") {
        return null;
    }

    if (seen.has(value)) {
        return null;
    }
    seen.add(value);

    const record = value as Record<string, unknown>;
    for (const key of ["status_message", "message", "error", "detail"]) {
        const message = getErrorMessagePart(record[key], seen);
        if (message) {
            return message;
        }
    }

    return null;
}

export function getAPIErrorDetailMessage(e: unknown): string | null {
    if (e instanceof APIError) {
        return getErrorMessagePart(e.detail) ?? getErrorMessagePart(e.message);
    }

    return getErrorMessagePart(e);
}


export enum Collection {
    users = "users",
    activitypub_activities = "activitypub_activities",
    activitypub_actors = "activitypub_actors",
    categories = "categories",
    comments = "comments",
    feed = "feed",
    follows = "follows",
    plugin_instances = "plugin_instances",
    list_share = "list_share",
    lists = "lists",
    notifications = "notifications",
    profile_feed = "profile_feed",
    settings = "settings",
    subcategories = "subcategories",
    user_category_preferences = "user_category_preferences",
    user_subcategory_preferences = "user_subcategory_preferences",
    summit_logs = "summit_logs",
    trail_like = "trail_like",
    trail_share = "trail_share",
    trail_link_share = "trail_link_share",
    trails = "trails",
    tags = "tags",
    waypoints = "waypoints",
    pois = "pois",
    poi_categories = "poi_categories",
    poi_attributes = "poi_attributes",
    trails_bounding_box = "trails_bounding_box",
    trails_filter = "trails_filter",
    users_anonymous = "users_anonymous",
    api_tokens = "api_tokens"

}

export async function list<T>(event: RequestEvent, collection: Collection) {
    const searchParams = Object.fromEntries(event.url.searchParams);
    const safeSearchParams = RecordListOptionsSchema.parse(searchParams);
    const { perPage, page, ...opts } = safeSearchParams;

    let r: ListResult<T>;
    if ((safeSearchParams.perPage ?? 0) < 0) {
        const activities: T[] = await event.locals.pb.collection(Collection[collection])
            .getFullList<T>({...opts})
        r = {
            items: activities,
            perPage: -1,
            page: 1,
            totalItems: activities.length,
            totalPages: 1
        }
    } else {
        r = await event.locals.pb.collection(Collection[collection])
            .getList<T>(page, perPage, opts)
    }
    return r
}

export async function show<T>(event: RequestEvent, collection: Collection) {
    const params = event.params
    const safeParams = RecordIdSchema.parse(params);

    const searchParams = Object.fromEntries(event.url.searchParams);
    const safeSearchParams = RecordOptionsSchema.parse(searchParams);

    const r = await event.locals.pb.collection(collection.toString())
        .getOne<T>(safeParams.id, safeSearchParams)

    return r
}

export async function create<T>(event: RequestEvent, schema: ZodSchema, collection: Collection) {
    const searchParams = Object.fromEntries(event.url.searchParams);
    const safeSearchParams = RecordOptionsSchema.parse(searchParams);

    const data = await event.request.json();
    const safeData = schema.parse(data);

    const r = await event.locals.pb.collection(Collection[collection]).create<T>(safeData, { ...safeSearchParams, requestKey: null })

    return r
}

export async function update<T>(event: RequestEvent, schema: ZodSchema, collection: Collection) {
    const params = event.params
    const safeParams = RecordIdSchema.parse(params);

    const searchParams = Object.fromEntries(event.url.searchParams);
    const safeSearchParams = RecordOptionsSchema.parse(searchParams);

    const data = await event.request.json();
    const safeData = schema.parse(data);

    const r = await event.locals.pb.collection(Collection[collection]).update<T>(safeParams.id, safeData, safeSearchParams)

    return r
}

export async function uploadCreate<T>(event: RequestEvent, collection: Collection) {
    const searchParams = Object.fromEntries(event.url.searchParams);
    const safeSearchParams = RecordOptionsSchema.parse(searchParams);

    const data = await event.request.formData();


    const r = await event.locals.pb.collection(Collection[collection]).create<T>(data, safeSearchParams)

    return r
}

export async function uploadUpdate<T>(event: RequestEvent, collection: Collection, data?: FormData) {
    const params = event.params
    const safeParams = RecordIdSchema.parse(params);

    const searchParams = Object.fromEntries(event.url.searchParams);
    const safeSearchParams = RecordOptionsSchema.parse(searchParams);

    data ??= await event.request.formData();

    // The path is authoritative. An id in the body is optional but must
    // agree with it, so a client cannot address one record and update another.
    const bodyId = data.get('id');
    if (bodyId !== null && bodyId !== safeParams.id) {
        throw new ClientResponseError({
            status: 400,
            response: { message: "id_mismatch", expected: safeParams.id },
        });
    }

    const r = await event.locals.pb.collection(Collection[collection]).update<T>(safeParams.id, data, safeSearchParams)

    return r
}

/**
 * Rejects a multipart body that carries none of the collection's file fields.
 *
 * PocketBase silently drops multipart parts whose name does not match a
 * collection field, which would turn a misnamed part into a 200 no-op.
 * Accepts the field itself as well as PocketBase's "+"/"-" modifiers.
 */
export function assertFileField(data: FormData, fileFields: readonly string[]) {
    const hasFileField = [...data.keys()].some((key) =>
        fileFields.some((field) => key === field || key === `${field}+` || key === `${field}-`)
    );
    if (!hasFileField) {
        throw new ClientResponseError({
            status: 400,
            response: { message: "missing_file", expected: fileFields },
        });
    }
}

export async function upload<T>(event: RequestEvent, collection: Collection, fileFields: readonly string[]) {
    const params = event.params
    const safeParams = RecordIdSchema.parse(params);

    const data = await event.request.formData();

    assertFileField(data, fileFields);

    const r = await event.locals.pb.collection(Collection[collection]).update<T>(safeParams.id, data)

    return r
}

export async function remove(event: RequestEvent, collection: Collection) {
    const params = event.params
    const safeParams = RecordIdSchema.parse(params);

    const r = await event.locals.pb.collection(Collection[collection]).delete(safeParams.id)

    return { 'acknowledged': r }
}

export function handleError(e: any) {
    if (isHttpError(e)) {
        throw e;
    } else if (e instanceof ZodError) {
        return json({ message: "invalid_params", detail: e.issues }, { status: 400 })
    } else if (e instanceof ClientResponseError && e.status > 0) {
        const detail = e.response?.data ?? e.originalError?.data ?? null;
        return json({ ...e.response, message: e.message, detail }, { status: e.status })
    } else if (e instanceof SyntaxError) {
        return json({ message: "invalid_json" }, { status: 400 })
    } else if (e instanceof Error) {
        return json({ message: e.message }, { status: 500 })
    } else {
        const message = typeof e?.message === "string"
            ? e.message
            : typeof e === "string"
                ? e
                : "internal_server_error";
        return json({ message, detail: e }, { status: 500 })
    }
}
