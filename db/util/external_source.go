package util

import (
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

func ExternalSourceExists(app core.App, provider string, externalID string) (bool, error) {
	for _, collection := range []string{"trails", "summit_logs"} {
		exists, err := externalSourceExistsInCollection(app, collection, provider, externalID)
		if err != nil || exists {
			return exists, err
		}
	}

	return false, nil
}

func externalSourceExistsInCollection(app core.App, collection string, provider string, externalID string) (bool, error) {
	records, err := app.FindRecordsByFilter(
		collection,
		"external_provider = {:provider} && external_id = {:id}",
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
