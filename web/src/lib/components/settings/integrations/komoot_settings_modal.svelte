<script lang="ts">
    import Modal from "$lib/components/base/modal.svelte";
    import Select, {
        type SelectItem,
    } from "$lib/components/base/select.svelte";
    import TextField from "$lib/components/base/text_field.svelte";
    import Textarea from "$lib/components/base/textarea.svelte";
    import Toggle from "$lib/components/base/toggle.svelte";
    import { KomootSchema } from "$lib/models/api/integration_schema";
    import type {
        Integration,
        KomootIntegration,
    } from "$lib/models/integration";
    import { validator } from "@felte/validator-zod";
    import { createForm } from "felte";
    import { _ } from "svelte-i18n";

    interface Props {
        integration?: Integration;
        onsave?: (komootIntegration: KomootIntegration) => void;
    }

    let { integration, onsave }: Props = $props();

    let modal: Modal;

    const privacySelectItems: SelectItem[] = [
        {
            text: $_("keep-original"),
            value: "original",
        },
        { text: $_("apply-user-settings"), value: "settings" },
    ];

    export function openModal() {
        errors.set({});
        modal.openModal();
    }

    const getInitialFormValues = () => ({
        email: integration?.komoot?.email ?? "",
        password: integration?.komoot?.password ?? "",
        completed: integration?.komoot?.completed ?? true,
        planned: integration?.komoot?.planned ?? true,
        excludedTrailIds: integration?.komoot?.excludedTrailIds ?? [],
        excludedTrailIdsText: (integration?.komoot?.excludedTrailIds ?? []).join("\n"),
        active: integration?.komoot?.active ?? false,
        privacy: integration?.komoot?.privacy ?? "original",
    });

    const {
        form,
        errors,
        data: d,
    } = createForm({
        initialValues: getInitialFormValues(),
        extend: validator({
            schema: KomootSchema,
        }),
        onSubmit: async (form) => {
            form.active = integration?.komoot?.active ?? form.active;
            form.excludedTrailIds = (($d as any).excludedTrailIdsText ?? "")
                .split(/[\n,]+/)
                .map((id) => id.trim())
                .filter((id, index, all) => id.length > 0 && all.indexOf(id) === index);
            onsave?.(form);
            modal.closeModal();
        },
    });
</script>

<Modal
    id="komoot-settings-modal"
    size="md:max-w-lg"
    title={"komoot " + $_("settings")}
    bind:this={modal}
>
    {#snippet content()}
        <form id="komoot-settings-form" class="space-y-2" use:form>
            <TextField
                label={$_("email")}
                placeholder="user@example.com"
                name="email"
                error={$errors.email}
            ></TextField>
            <TextField
                label={$_("password")}
                placeholder={integration?.komoot ? `(${$_("unchanged")})` : ""}
                name="password"
                type="password"
                error={$errors.password}
            ></TextField>
            <div class="flex flex-wrap gap-x-4">
                <Toggle
                    name="planned"
                    label={$_("planned-tours", { values: { n: 2 } })}
                ></Toggle>
                <Toggle
                    name="completed"
                    label={$_("completed-tours", { values: { n: 2 } })}
                ></Toggle>
            </div>
            <Textarea
                name="excludedTrailIdsText"
                label="Excluded external IDs"
                rows={4}
                placeholder="One ID per line (or comma-separated)"
            ></Textarea>
            <p class="text-xs text-gray-500 max-w-lg">
                Trails deleted from this provider are added here automatically and won't be imported again.
            </p>

            <Select
                label={$_("privacy")}
                items={privacySelectItems}
                name="privacy"
            ></Select>
            <p class="text-xs text-gray-500 max-w-lg">
                {#if $d.privacy == "original"}
                    {$_("integration-privacy-hint-original")}
                {:else}
                    {$_("integration-privacy-hint-user")}
                {/if}
            </p>
        </form>
    {/snippet}
    {#snippet footer()}
        <div class="flex items-center gap-4">
            <button class="btn-secondary" onclick={() => modal.closeModal()}
                >{$_("cancel")}</button
            >
            <button
                class="btn-primary"
                form="komoot-settings-form"
                type="submit"
                name="save">{$_("save")}</button
            >
        </div>
    {/snippet}</Modal
>
