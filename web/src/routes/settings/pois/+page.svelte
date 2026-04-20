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

    let { data } = $props();

    let categories = $state(data.categories);
    let attributeDefinitions = $state(data.attributeDefinitions);

    let categoryForm = $state(new PoiCategory("", { icon: "location-dot" }));
    let attributeForm = $state(
        new PoiAttribute("", "", "boolean", data.categories[0]?.id ?? ""),
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
                text: "Category could not be saved",
            });
        }
    }

    async function saveAttribute() {
        try {
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
                text: "Attribute could not be saved",
            });
        }
    }

    async function removeCategory(category: PoiCategory) {
        if (!window.confirm(`Delete category "${category.name}"?`)) {
            return;
        }
        await poi_categories_delete(category);
        categories = categories.filter((item) => item.id !== category.id);
        attributeDefinitions = attributeDefinitions.filter(
            (attribute) => attribute.category !== category.id,
        );
    }

    async function removeAttribute(attribute: PoiAttribute) {
        if (!window.confirm(`Delete attribute "${attribute.name}"?`)) {
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
        <h2 class="text-2xl font-semibold">POI Configuration</h2>
        <p class="text-sm text-gray-500 mt-2">
            Manage categories and attribute definitions for POIs.
        </p>
    </div>

    <section class="space-y-4">
        <h3 class="text-xl font-semibold">Categories</h3>
        <div class="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-4">
            <TextField bind:value={categoryForm.name} label="Name"></TextField>
            <TextField bind:value={categoryForm.icon} label="Icon"></TextField>
            <Button primary={true} onclick={saveCategory}>Save</Button>
        </div>
        <Textarea
            bind:value={categoryForm.description}
            label="Description"
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
                            Edit
                        </button>
                        <button
                            class="btn-secondary text-red-500"
                            onclick={() => removeCategory(category)}
                        >
                            Delete
                        </button>
                    </div>
                </div>
            {/each}
        </div>
    </section>

    <section class="space-y-4">
        <h3 class="text-xl font-semibold">Attributes</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TextField
                bind:value={attributeForm.name}
                label="Name"
                onchange={() => {
                    if (!attributeForm.id && !attributeForm.key.length) {
                        attributeForm.key = buildPoiAttributeKey(
                            attributeForm.name,
                        );
                    }
                }}
            ></TextField>
            <TextField bind:value={attributeForm.key} label="Key"></TextField>
            <Select
                bind:value={attributeForm.category}
                label="Category"
                items={categories.map((category) => ({
                    text: category.name,
                    value: category.id,
                }))}
            ></Select>
            <Select
                bind:value={attributeForm.type}
                label="Type"
                items={[
                    { text: "Boolean", value: "boolean" },
                    { text: "String", value: "string" },
                    { text: "Date", value: "date" },
                ]}
            ></Select>
        </div>
        <div class="flex gap-4">
            <label class="inline-flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={attributeForm.required}
                    onchange={(event) =>
                        (attributeForm.required = (
                            event.currentTarget as HTMLInputElement
                        ).checked)}
                />
                Required
            </label>
            <Button primary={true} onclick={saveAttribute}>Save</Button>
        </div>

        <div class="space-y-3">
            {#each attributeDefinitions as attribute}
                <div
                    class="rounded-xl border border-input-border p-4 flex items-start justify-between gap-4"
                >
                    <div>
                        <h4 class="font-semibold">{attribute.name}</h4>
                        <p class="text-sm text-gray-500">
                            {attribute.key} - {attribute.type} - {attribute.expand
                                ?.category?.name ??
                                categories.find(
                                    (category) =>
                                        category.id === attribute.category,
                                )?.name}
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
                            Edit
                        </button>
                        <button
                            class="btn-secondary text-red-500"
                            onclick={() => removeAttribute(attribute)}
                        >
                            Delete
                        </button>
                    </div>
                </div>
            {/each}
        </div>
    </section>
</div>
