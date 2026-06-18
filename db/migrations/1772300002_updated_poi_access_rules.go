package migrations

import (
	"encoding/json"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		updates := map[string]string{
			"poi_categories": `{
				"listRule": "author = @request.auth.id || pois_via_category.public ?= true",
				"viewRule": "author = @request.auth.id || pois_via_category.public ?= true",
				"createRule": "@request.auth.id != \"\" && @request.body.author = @request.auth.id"
			}`,
			"poi_attributes": `{
				"listRule": "author = @request.auth.id || category.pois_via_category.public ?= true",
				"viewRule": "author = @request.auth.id || category.pois_via_category.public ?= true",
				"createRule": "@request.auth.id != \"\" && @request.body.author = @request.auth.id"
			}`,
			"pois": `{
				"createRule": "@request.auth.id != \"\" && @request.body.author = @request.auth.id"
			}`,
		}

		for name, jsonData := range updates {
			collection, err := app.FindCollectionByNameOrId(name)
			if err != nil {
				return err
			}
			if err := json.Unmarshal([]byte(jsonData), &collection); err != nil {
				return err
			}
			if err := app.Save(collection); err != nil {
				return err
			}
		}

		return nil
	}, func(app core.App) error {
		updates := map[string]string{
			"poi_categories": `{
				"listRule": null,
				"viewRule": null,
				"createRule": "@request.auth.id != \"\""
			}`,
			"poi_attributes": `{
				"listRule": null,
				"viewRule": null,
				"createRule": "@request.auth.id != \"\""
			}`,
			"pois": `{
				"createRule": "@request.auth.id != \"\""
			}`,
		}

		for name, jsonData := range updates {
			collection, err := app.FindCollectionByNameOrId(name)
			if err != nil {
				return err
			}
			if err := json.Unmarshal([]byte(jsonData), &collection); err != nil {
				return err
			}
			if err := app.Save(collection); err != nil {
				return err
			}
		}

		return nil
	})
}
