<script lang="ts">
    import { goto } from "$app/navigation";
    import { page } from "$app/state";
    import type { Trail } from "$lib/models/trail";
    import { _ } from "svelte-i18n";

    interface Props {
        trail: Trail;
        compact?: boolean;
        fullWidth?: boolean;
        extraClasses?: string;
    }

    let {
        trail,
        compact = false,
        fullWidth = false,
        extraClasses = "",
    }: Props = $props();

    function openMapEdit(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();

        if (!trail.id) {
            return;
        }

        const searchParams = new URLSearchParams();
        const shareToken = page.url.searchParams.get("share");
        if (shareToken) {
            searchParams.set("share", shareToken);
        }

        goto(
            `/trail/edit/${trail.id}${searchParams.size ? `?${searchParams.toString()}` : ""}`,
        );
    }
</script>

<button
    type="button"
    class={`btn-secondary flex items-center justify-center gap-2 ${compact ? "px-3 py-2 text-sm" : "px-4 py-2"} ${fullWidth ? "w-full" : ""} ${extraClasses}`}
    disabled={!trail.id}
    aria-label={`${$_("map")} / ${$_("edit")}`}
    title={`${$_("map")} / ${$_("edit")}`}
    onclick={openMapEdit}
>
    <i class="fa fa-map-location-dot"></i>
    <span>{$_("map")} / {$_("edit")}</span>
</button>
