package hooks

import (
	"pocketbase/util"

	"github.com/pocketbase/pocketbase/core"
)

func PreserveTrailImportExclusionsHandler() func(*core.RecordEvent) error {
	return func(e *core.RecordEvent) error {
		if err := util.PreserveTrailImportExclusions(e.App, e.Record); err != nil {
			return err
		}
		return e.Next()
	}
}
