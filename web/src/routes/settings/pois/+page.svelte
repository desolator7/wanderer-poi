<script lang="ts">
    import Button from "$lib/components/base/button.svelte";
    import Select from "$lib/components/base/select.svelte";
    import TextField from "$lib/components/base/text_field.svelte";
    import Textarea from "$lib/components/base/textarea.svelte";
    import { PoiAttribute } from "$lib/models/poi_attribute";
    import { PoiCategory } from "$lib/models/poi_category";
    import {
        poi_attributes_create,
        poi_attributes_delete,
        poi_attributes_update,
    } from "$lib/stores/poi_attribute_store";
    import {
        poi_categories_create,
        poi_categories_delete,
        poi_categories_update,
    } from "$lib/stores/poi_category_store";
    import { show_toast } from "$lib/stores/toast_store.svelte";
    import { buildPoiAttributeKey } from "$lib/util/poi_util";
    import { _ } from "svelte-i18n";

    let { data } = $props();

    let categories = $state(data.categories);
    let attributeDefinitions = $state(data.attributeDefinitions);

    let categoryForm = $state(new PoiCategory("", { icon: "location-dot" }));
    let attributeForm = $state(
        new PoiAttribute("", "", "boolean", data.categories[0]?.id ?? ""),
    );
    let primaryAttributeInCategory = $derived(
        attributeDefinitions.find(
            (attribute) =>
                attribute.category === attributeForm.category &&
                attribute.primary &&
                attribute.id !== attributeForm.id,
        ),
    );

    async function saveCategory() {
        try {
            const savedCategory = categoryForm.id
                ? await poi_categories_update(categoryForm)
                : await poi_categories_create(categoryForm);
            const existingIndex = categories.findIndex(
                (category) => category.id === savedCategory.id,
            );
            if (existingIndex >= 0) {
                categories[existingIndex] = savedCategory;
                categories = [...categories];
            } else {
                categories = [...categories, savedCategory];
            }
            categoryForm = new PoiCategory("", { icon: "location-dot" });
        } catch (error) {
            console.error(error);
            show_toast({
                type: "error",
                icon: "close",
                text: $_("category-save-error"),
            });
        }
    }

    async function saveAttribute() {
        try {
            attributeForm.key ||= buildPoiAttributeKey(attributeForm.name);
            attributeForm.required = false;
            if (attributeForm.type !== "boolean") {
                attributeForm.primary = false;
            }
            if (attributeForm.value_storage === "private") {
                attributeForm.public_write_access = "all";
            }
            if (primaryAttributeInCategory && attributeForm.primary) {
                attributeForm.primary = false;
            }
            const savedAttribute = attributeForm.id
                ? await poi_attributes_update(attributeForm)
                : await poi_attributes_create(attributeForm);
            savedAttribute.expand = {
                category: categories.find(
                    (category) => category.id === savedAttribute.category,
                ),
            };
            const existingIndex = attributeDefinitions.findIndex(
                (attribute) => attribute.id === savedAttribute.id,
            );
            if (existingIndex >= 0) {
                attributeDefinitions[existingIndex] = savedAttribute;
                attributeDefinitions = [...attributeDefinitions];
            } else {
                attributeDefinitions = [...attributeDefinitions, savedAttribute];
            }
            if (savedAttribute.primary) {
                attributeDefinitions = attributeDefinitions.map((attribute) =>
                    attribute.id !== savedAttribute.id &&
                    attribute.category === savedAttribute.category
                        ? new PoiAttribute(
                              attribute.name,
                              attribute.key,
                              attribute.type,
                              attribute.category,
                              { ...attribute, primary: false },
                          )
                        : attribute,
                );
            }
            attributeForm = new PoiAttribute(
                "",
                "",
                "boolean",
                categories[0]?.id ?? "",
            );
        } catch (error) {
            console.error(error);
            show_toast({
                type: "error",
                icon: "close",
                text: $_("attribute-save-error"),
            });
        }
    }

    async function removeCategory(category: PoiCategory) {
        if (
            !window.confirm(
                $_("delete-category-confirm", {
                    values: { name: category.name },
                }),
            )
        ) {
            return;
        }
        await poi_categories_delete(category);
        categories = categories.filter((item) => item.id !== category.id);
        attributeDefinitions = attributeDefinitions.filter(
            (attribute) => attribute.category !== category.id,
        );
    }

    async function removeAttribute(attribute: PoiAttribute) {
        if (
            !window.confirm(
                $_("delete-attribute-confirm", {
                    values: { name: attribute.name },
                }),
            )
        ) {
            return;
        }
        await poi_attributes_delete(attribute);
        attributeDefinitions = attributeDefinitions.filter(
            (item) => item.id !== attribute.id,
        );
    }
</script>

<div class="space-y-8">
    <div>
        <h2 class="text-2xl font-semibold">{$_("poi-configuration")}</h2>
        <p class="text-sm text-gray-500 mt-2">
            {$_("poi-configuration-description")}
        </p>
    </div>

    <section class="space-y-4">
        <h3 class="text-xl font-semibold">{$_("categories")}</h3>
        <div class="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-4">
            <TextField bind:value={categoryForm.name} label={$_("name")}></TextField>
            <TextField bind:value={categoryForm.icon} label={$_("icon")}></TextField>
            <Button primary={true} onclick={saveCategory}>{$_("save")}</Button>
        </div>
        <Textarea
            bind:value={categoryForm.description}
            label={$_("description")}
        ></Textarea>

        <div class="space-y-3">
            {#each categories as category}
                <div
                    class="rounded-xl border border-input-border p-4 flex items-start justify-between gap-4"
                >
                    <div>
                        <h4 class="font-semibold">
                            <i
                                class="fa fa-{category.icon ?? 'location-dot'} mr-2"
                            ></i>
                            {category.name}
                        </h4>
                        <p class="text-sm text-gray-500">
                            {category.description}
                        </p>
                    </div>
                    <div class="flex gap-2">
                        <button
                            class="btn-secondary"
                            onclick={() =>
                                (categoryForm = new PoiCategory(
                                    category.name,
                                    category,
                                ))}
                        >
                            {$_("edit")}
                        </button>
                        <button
                            class="btn-secondary text-red-500"
                            onclick={() => removeCategory(category)}
                        >
                            {$_("delete")}
                        </button>
                    </div>
                </div>
            {/each}
        </div>
    </section>

    <section class="space-y-4">
        <h3 class="text-xl font-semibold">{$_("attributes")}</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextField
                bind:value={attributeForm.name}
                label={$_("name")}
                onchange={() => {
                    if (!attributeForm.id && !attributeForm.key.length) {
                        attributeForm.key = buildPoiAttributeKey(
                            attributeForm.name,
                        );
                    }
                }}
            ></TextField>
            <Select
                bind:value={attributeForm.category}
                label={$_("category")}
                items={categories.map((category) => ({
                    text: category.name,
                    value: category.id,
                }))}
            ></Select>
            <Select
                bind:value={attributeForm.type}
                label={$_("type")}
                items={[
                    { text: $_("boolean"), value: "boolean" },
                    { text: $_("string"), value: "string" },
                    { text: $_("date"), value: "date" },
                ]}
            ></Select>
            <Select
                bind:value={attributeForm.value_storage}
                label={$_("value-storage")}
                items={[
                    { text: $_("public"), value: "public" },
                    { text: $_("private"), value: "private" },
                ]}
            ></Select>
            {#if attributeForm.value_storage === "public"}
                <Select
                    bind:value={attributeForm.public_write_access}
                    label={$_("public-write-access")}
                    items={[
                        { text: $_("all-users"), value: "all" },
                        { text: $_("admins-only"), value: "admin" },
                    ]}
                ></Select>
            {/if}
        </div>
        <div class="flex gap-4">
            {#if attributeForm.type === "boolean"}
                <label class="inline-flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={attributeForm.primary}
                        disabled={Boolean(primaryAttributeInCategory)}
                        onchange={(event) =>
                            (attributeForm.primary = (
                                event.currentTarget as HTMLInputElement
                            ).checked)}
                    />
                    {$_("color-marker")}
                </label>
            {/if}
            <Button primary={true} onclick={saveAttribute}>{$_("save")}</Button>
        </div>

        <div class="space-y-3">
            {#each attributeDefinitions as attribute}
                <div
                    class="rounded-xl border border-input-border p-4 flex items-start justify-between gap-4"
                >
                    <div>
                        <h4 class="font-semibold">{attribute.name}</h4>
                        <p class="text-sm text-gray-500">
                            {attribute.type === "boolean"
                                ? $_("boolean")
                                : attribute.type === "string"
                                  ? $_("string")
                                  : $_("date")} - {attribute.expand
                                ?.category?.name ??
                                categories.find(
                                    (category) =>
                                        category.id === attribute.category,
                                )?.name} - {attribute.value_storage === "private"
                                ? $_("private")
                                : attribute.public_write_access === "admin"
                                  ? $_("public-admin-only")
                                  : $_("public")}
                            {#if attribute.primary}
                                - {$_("color-marker")}
                            {/if}
                        </p>
                    </div>
                    <div class="flex gap-2">
                        <button
                            class="btn-secondary"
                            onclick={() =>
                                (attributeForm = new PoiAttribute(
                                    attribute.name,
                                    attribute.key,
                                    attribute.type,
                                    attribute.category,
                                    attribute,
                                ))}
                        >
                            {$_("edit")}
                        </button>
                        <button
                            class="btn-secondary text-red-500"
                            onclick={() => removeAttribute(attribute)}
                        >
                            {$_("delete")}
                        </button>
                    </div>
                </div>
            {/each}
        </div>
    </section>
</div>
