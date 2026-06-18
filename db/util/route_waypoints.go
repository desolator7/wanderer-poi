package util

import (
	"fmt"
	"io"
	"math"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	"github.com/tkrajina/gpxgo/gpx"
)

const (
	importedRouteWaypointToleranceMeters = 8
	importedRouteWaypointMaxPoints       = 150
)

type routePoint struct {
	lat               float64
	lon               float64
	distanceFromStart float64
}

func CreateRouteWaypointsFromGPX(app core.App, gpxFile *filesystem.File, userID string, trailID string) error {
	if gpxFile == nil {
		return nil
	}

	segments, err := routePointSegmentsFromGPXFile(gpxFile)
	if err != nil {
		return err
	}

	points := routeWaypointControlPoints(segments)
	if len(points) < 2 {
		return nil
	}

	collection, err := app.FindCollectionByNameOrId("waypoints")
	if err != nil {
		return err
	}

	for i, point := range points {
		record := core.NewRecord(collection)
		record.Load(map[string]any{
			"name":                waypointCoordinateName(point.lat, point.lon),
			"lat":                 point.lat,
			"lon":                 point.lon,
			"icon":                waypointRouteIcon(i, len(points)),
			"author":              userID,
			"distance_from_start": point.distanceFromStart,
			"trail":               trailID,
		})
		if i > 0 {
			record.Set("connectionMode", "original-kml")
		}

		if err := app.Save(record); err != nil {
			return err
		}
	}

	return nil
}

func routePointSegmentsFromGPXFile(gpxFile *filesystem.File) ([][]routePoint, error) {
	reader, err := gpxFile.Reader.Open()
	if err != nil {
		return nil, err
	}
	defer reader.Close()

	content, err := io.ReadAll(reader)
	if err != nil {
		return nil, err
	}

	gpxData, err := gpx.ParseBytes(content)
	if err != nil {
		return nil, err
	}

	var segments [][]routePoint
	for _, track := range gpxData.Tracks {
		for _, segment := range track.Segments {
			if points := routePointsFromGPXPoints(segment.Points); len(points) > 0 {
				segments = append(segments, points)
			}
		}
	}
	for _, route := range gpxData.Routes {
		if points := routePointsFromGPXPoints(route.Points); len(points) > 0 {
			segments = append(segments, points)
		}
	}

	return segments, nil
}

func routePointsFromGPXPoints(gpxPoints []gpx.GPXPoint) []routePoint {
	points := make([]routePoint, 0, len(gpxPoints))
	var distanceFromStart float64
	for i, point := range gpxPoints {
		current := routePoint{
			lat: point.Latitude,
			lon: point.Longitude,
		}
		if i > 0 {
			previous := points[len(points)-1]
			distanceFromStart += haversineDistance(previous.lat, previous.lon, current.lat, current.lon)
		}
		current.distanceFromStart = distanceFromStart
		points = append(points, current)
	}

	return points
}

func routeWaypointControlPoints(segments [][]routePoint) []routePoint {
	var controlPoints []routePoint
	var distanceOffset float64
	for _, segment := range segments {
		if len(segment) < 2 {
			continue
		}

		points := simplifyRoutePoints(segment, importedRouteWaypointToleranceMeters, importedRouteWaypointMaxPoints)
		if len(points) < 2 {
			continue
		}

		for i, point := range points {
			if len(controlPoints) > 0 && i == 0 {
				last := controlPoints[len(controlPoints)-1]
				if last.lat == point.lat && last.lon == point.lon {
					continue
				}
			}
			point.distanceFromStart += distanceOffset
			controlPoints = append(controlPoints, point)
		}

		distanceOffset = controlPoints[len(controlPoints)-1].distanceFromStart
	}

	return controlPoints
}

func simplifyRoutePoints(points []routePoint, toleranceMeters float64, maxPoints int) []routePoint {
	if len(points) <= 2 {
		return append([]routePoint{}, points...)
	}

	if maxPoints < 2 {
		maxPoints = 2
	}
	if toleranceMeters < 0.5 {
		toleranceMeters = 0.5
	}

	simplified := simplifyRoutePointsWithRDP(points, toleranceMeters)
	for len(simplified) > maxPoints && toleranceMeters < 250 {
		toleranceMeters *= 1.6
		simplified = simplifyRoutePointsWithRDP(points, toleranceMeters)
	}

	if len(simplified) <= maxPoints {
		return simplified
	}

	sampled := make([]routePoint, 0, maxPoints)
	step := float64(len(simplified)-1) / float64(maxPoints-1)
	for i := 0; i < maxPoints; i++ {
		sampled = append(sampled, simplified[int(math.Round(float64(i)*step))])
	}

	deduplicated := make([]routePoint, 0, len(sampled))
	for _, point := range sampled {
		if len(deduplicated) == 0 {
			deduplicated = append(deduplicated, point)
			continue
		}
		previous := deduplicated[len(deduplicated)-1]
		if previous.lat != point.lat || previous.lon != point.lon {
			deduplicated = append(deduplicated, point)
		}
	}
	if len(deduplicated) == 1 {
		deduplicated = append(deduplicated, points[len(points)-1])
	}

	return deduplicated
}

func simplifyRoutePointsWithRDP(points []routePoint, toleranceMeters float64) []routePoint {
	if len(points) <= 2 {
		return append([]routePoint{}, points...)
	}

	toleranceSquared := toleranceMeters * toleranceMeters
	keep := make([]bool, len(points))
	keep[0] = true
	keep[len(points)-1] = true

	type segmentRange struct {
		start int
		end   int
	}
	stack := []segmentRange{{start: 0, end: len(points) - 1}}

	for len(stack) > 0 {
		current := stack[len(stack)-1]
		stack = stack[:len(stack)-1]

		bestIndex := -1
		var maxDistanceSquared float64
		for i := current.start + 1; i < current.end; i++ {
			distanceSquared := squaredDistanceToSegment(points[i], points[current.start], points[current.end])
			if distanceSquared > maxDistanceSquared {
				maxDistanceSquared = distanceSquared
				bestIndex = i
			}
		}

		if bestIndex != -1 && maxDistanceSquared > toleranceSquared {
			keep[bestIndex] = true
			stack = append(stack, segmentRange{start: current.start, end: bestIndex})
			stack = append(stack, segmentRange{start: bestIndex, end: current.end})
		}
	}

	simplified := make([]routePoint, 0, len(points))
	for i, point := range points {
		if keep[i] {
			simplified = append(simplified, point)
		}
	}

	return simplified
}

func squaredDistanceToSegment(point routePoint, from routePoint, to routePoint) float64 {
	originLat := (point.lat + from.lat + to.lat) / 3
	p := pointToMeters(point, originLat)
	a := pointToMeters(from, originLat)
	b := pointToMeters(to, originLat)

	abX := b.x - a.x
	abY := b.y - a.y
	abLengthSquared := abX*abX + abY*abY
	if abLengthSquared == 0 {
		dx := p.x - a.x
		dy := p.y - a.y
		return dx*dx + dy*dy
	}

	apX := p.x - a.x
	apY := p.y - a.y
	t := math.Max(0, math.Min(1, (apX*abX+apY*abY)/abLengthSquared))
	projectionX := a.x + t*abX
	projectionY := a.y + t*abY
	dx := p.x - projectionX
	dy := p.y - projectionY

	return dx*dx + dy*dy
}

type meterPoint struct {
	x float64
	y float64
}

func pointToMeters(point routePoint, originLat float64) meterPoint {
	const metersPerDegreeLat = 111_320
	metersPerDegreeLon := metersPerDegreeLat * math.Cos(originLat*math.Pi/180)

	return meterPoint{
		x: point.lon * metersPerDegreeLon,
		y: point.lat * metersPerDegreeLat,
	}
}

func haversineDistance(lat1 float64, lon1 float64, lat2 float64, lon2 float64) float64 {
	const earthRadiusMeters = 6_371_000
	dLat := (lat2 - lat1) * math.Pi / 180
	dLon := (lon2 - lon1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return earthRadiusMeters * c
}

func waypointCoordinateName(lat float64, lon float64) string {
	return fmt.Sprintf("%.5f, %.5f", lat, lon)
}

func waypointRouteIcon(index int, total int) string {
	if index == 0 {
		return "play"
	}
	if index == total-1 {
		return "flag-checkered"
	}
	return "circle"
}
