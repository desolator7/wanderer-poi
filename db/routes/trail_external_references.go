package routes

import (
	"net/http"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

// TrailExternalReferences exposes only source identifiers belonging to the
// authenticated user's own trail. The reference collection stays private.
func TrailExternalReferences(e *core.RequestEvent) error {
	if e.Auth == nil {
		return apis.NewUnauthorizedError("authentication required", nil)
	}
	trail, err := e.App.FindRecordById("trails", e.Request.PathValue("id"))
	if err != nil {
		return apis.NewNotFoundError("trail not found", nil)
	}
	actor, err := e.App.FindRecordById("activitypub_actors", trail.GetString("author"))
	if err != nil || actor.GetString("user") != e.Auth.Id {
		return apis.NewNotFoundError("trail not found", nil)
	}
	refs, err := e.App.FindRecordsByFilter("trail_external_reference", "trail = {:trail} && user = {:user}", "", 0, 0, dbx.Params{"trail": trail.Id, "user": e.Auth.Id})
	if err != nil {
		return err
	}
	items := make([]map[string]string, 0, len(refs))
	for _, ref := range refs {
		items = append(items, map[string]string{"provider": ref.GetString("provider"), "external_id": ref.GetString("external_id")})
	}
	return e.JSON(http.StatusOK, items)
}
