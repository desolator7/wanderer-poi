package util

import (
	"database/sql"
	"encoding/json"
	"errors"
	"slices"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

func ImportExclusionIDs(value any) []string {
	data, err := json.Marshal(value)
	if err != nil {
		return nil
	}
	var ids []string
	if json.Unmarshal(data, &ids) != nil {
		return nil
	}
	result := make([]string, 0, len(ids))
	for _, id := range ids {
		if id = strings.TrimSpace(id); id != "" && !slices.Contains(result, id) {
			result = append(result, id)
		}
	}
	return result
}

func FindImportedSummitLogForUser(app core.App, userID, provider, externalID string) (*core.Record, error) {
	if userID == "" || provider == "" || externalID == "" {
		return nil, nil
	}
	record, err := app.FindFirstRecordByFilter(
		"summit_logs",
		"author.user={:user} && external_provider={:provider} && external_id={:id}",
		dbx.Params{"user": userID, "provider": provider, "id": externalID},
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return record, err
}

func ImportedActivityNeedsSummitLog(app core.App, userID, provider, externalID string) (bool, error) {
	log, err := FindImportedSummitLogForUser(app, userID, provider, externalID)
	if err != nil || log != nil {
		return false, err
	}
	trail, err := FindTrailByExternalReferenceForUser(app, userID, provider, externalID)
	if err != nil || trail == nil {
		return false, err
	}
	// Completed imported trails with an owner's log already represent the activity.
	if trail.GetBool("completed") {
		logs, err := app.FindRecordsByFilter("summit_logs", "trail={:trail} && author.user={:user}", "", 1, 0, dbx.Params{"trail": trail.Id, "user": userID})
		if err != nil {
			return false, err
		}
		if len(logs) > 0 {
			return false, nil
		}
	}
	return true, nil
}

// PreserveTrailImportExclusions runs before deletion removes external references.
func PreserveTrailImportExclusions(app core.App, trail *core.Record) error {
	refs, err := app.FindRecordsByFilter("trail_external_reference", "trail={:trail}", "", -1, 0, dbx.Params{"trail": trail.Id})
	if err != nil {
		return err
	}
	for _, ref := range refs {
		pluginID := ref.GetString("plugin_id")
		if pluginID == "" {
			pluginID = ref.GetString("provider")
		}
		externalID := ref.GetString("external_id")
		if pluginID == "" || externalID == "" || ref.GetString("user") == "" {
			continue
		}
		instances, err := app.FindRecordsByFilter("plugin_instances", "user={:user} && plugin_id={:plugin}", "", -1, 0, dbx.Params{"user": ref.GetString("user"), "plugin": pluginID})
		if err != nil {
			return err
		}
		for _, instance := range instances {
			config := map[string]any{}
			if err := instance.UnmarshalJSONField("config", &config); err != nil {
				return err
			}
			if config == nil {
				config = map[string]any{}
			}
			host, _ := config["host"].(map[string]any)
			if host == nil {
				host = map[string]any{}
			}
			exclusions := ImportExclusionIDs(host["excludedTrailIds"])
			if slices.Contains(exclusions, externalID) {
				continue
			}
			host["excludedTrailIds"] = append(exclusions, externalID)
			config["host"] = host
			instance.Set("config", config)
			if err := app.Save(instance); err != nil {
				return err
			}
		}
	}
	return nil
}
