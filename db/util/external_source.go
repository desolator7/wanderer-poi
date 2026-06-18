package util

import (
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

func ExternalSourceExists(app core.App, provider string, externalID string) (bool, error) {
	checks := []struct {
		collection string
		provider   string
	}{
		{collection: "trail_external_reference", provider: "provider"},
		{collection: "summit_logs", provider: "external_provider"},
	}

	for _, check := range checks {
		exists, err := externalSourceExistsInCollection(app, check.collection, check.provider, provider, externalID)
		if err != nil || exists {
			return exists, err
		}
	}

	return false, nil
}

func externalSourceExistsInCollection(app core.App, collection string, providerField string, provider string, externalID string) (bool, error) {
	records, err := app.FindRecordsByFilter(
		collection,
		providerField+" = {:provider} && external_id = {:id}",
		"",
		1,
		0,
		dbx.Params{"provider": provider, "id": externalID},
	)
	if err != nil {
		return false, err
	}

	return len(records) > 0, nil
}
