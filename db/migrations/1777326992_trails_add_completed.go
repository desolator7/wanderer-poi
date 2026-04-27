package migrations

import (
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("e864strfxo14pm4")
		if err != nil {
			return err
		}

		if err := collection.Fields.AddMarshaledJSONAt(5, []byte(`{
			"hidden": false,
			"id": "8m1r4cpl",
			"name": "completed",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "bool"
		}`)); err != nil {
			return err
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		trails, err := app.FindAllRecords("trails")
		if err != nil {
			return err
		}

		for _, trail := range trails {
			logCount, err := app.CountRecords("summit_logs", dbx.NewExp("trail={:id}", dbx.Params{"id": trail.Id}))
			if err != nil {
				return err
			}

			trail.Set("completed", logCount > 0)
			if err := app.UnsafeWithoutHooks().Save(trail); err != nil {
				return err
			}
		}

		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("e864strfxo14pm4")
		if err != nil {
			return err
		}

		collection.Fields.RemoveById("8m1r4cpl")

		return app.Save(collection)
	})
}
