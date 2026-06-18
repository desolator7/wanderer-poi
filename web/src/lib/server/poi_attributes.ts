import type { Poi } from "$lib/models/poi";
import type { PoiAttribute, PoiAttributeValue } from "$lib/models/poi_attribute";
import type PocketBase from "pocketbase";

export function canEditAttributeValue(attribute: PoiAttribute, userId: string | undefined, isAdmin: boolean) {
    if (attribute.value_storage === "private") {
        return Boolean(userId);
    }

    if (attribute.public_write_access === "admin") {
        return isAdmin;
    }

    return true;
}

export async function getPoiAttributeDefinitions(pb: PocketBase, categoryId: string) {
    try {
        return await pb.collection("poi_attributes").getFullList<PoiAttribute>({
            filter: `category=\"${categoryId}\"`,
            requestKey: null,
        });
    } catch (_) {
        return [];
    }
}

export function applyPrivateAttributesForUser(
    poi: Poi,
    definitions: PoiAttribute[],
    userId: string | undefined,
) {
    const attributes = { ...(poi.attributes ?? {}) };
    const privateAttributes = { ...(poi.private_attributes ?? {}) };

    for (const definition of definitions) {
        if (definition.value_storage !== "private") {
            continue;
        }

        const userValue = userId
            ? privateAttributes[userId]?.[definition.key]
            : undefined;
        attributes[definition.key] = (userValue ?? null) as PoiAttributeValue;
    }

    return {
        ...poi,
        attributes,
    };
}

export function splitAttributeUpdates(
    poi: Poi,
    definitions: PoiAttribute[],
    incomingAttributes: Record<string, PoiAttributeValue> | undefined,
    userId: string | undefined,
    isAdmin: boolean,
) {
    const nextPublic = { ...(poi.attributes ?? {}) };
    const nextPrivate = { ...(poi.private_attributes ?? {}) };

    if (!incomingAttributes) {
        return { attributes: nextPublic, private_attributes: nextPrivate };
    }

    if (!definitions.length) {
        return {
            attributes: { ...nextPublic, ...incomingAttributes },
            private_attributes: nextPrivate,
        };
    }

    for (const definition of definitions) {
        const hasIncoming = Object.prototype.hasOwnProperty.call(incomingAttributes, definition.key);
        if (!hasIncoming) {
            continue;
        }

        const nextValue = incomingAttributes[definition.key] ?? null;
        if (!canEditAttributeValue(definition, userId, isAdmin)) {
            continue;
        }

        if (definition.value_storage === "private") {
            if (!userId) {
                continue;
            }

            nextPrivate[userId] = {
                ...(nextPrivate[userId] ?? {}),
                [definition.key]: nextValue,
            };
            continue;
        }

        nextPublic[definition.key] = nextValue;
    }

    return { attributes: nextPublic, private_attributes: nextPrivate };
}
