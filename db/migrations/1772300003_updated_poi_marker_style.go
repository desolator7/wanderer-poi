package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pois")
		if err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSONAt(7, []byte(`{
			"autogeneratePattern": "",
			"hidden": false,
			"id": "p0ipoi_icon002",
			"max": 64,
			"min": 0,
			"name": "icon",
			"pattern": "^[a-z0-9-]+$",
			"presentable": false,
			"primaryKey": false,
			"required": false,
			"system": false,
			"type": "text"
		}`)); err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSONAt(8, []byte(`{
			"autogeneratePattern": "",
			"hidden": false,
			"id": "p0ipoi_color02",
			"max": 7,
			"min": 0,
			"name": "color",
			"pattern": "^#[0-9A-Fa-f]{6}$",
			"presentable": false,
			"primaryKey": false,
			"required": false,
			"system": false,
			"type": "text"
		}`)); err != nil {
			return err
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("pois")
		if err != nil {
			return err
		}

		collection.Fields.RemoveById("p0ipoi_icon002")
		collection.Fields.RemoveById("p0ipoi_color02")

		return app.Save(collection)
	})
}
