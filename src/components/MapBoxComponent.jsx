import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import MapboxGeocoder from '@mapbox/mapbox-gl-geocoder';
import * as toGeoJSON from '@tmcw/togeojson';
import tokml from 'tokml';

import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import '@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css';

mapboxgl.accessToken = 'pk.eyJ1IjoiZmxhdmlvYm9yZ2VzbnVuZXMiLCJhIjoiY21iN3hwajR2MGdnYTJqcTEzbDd2eGd6YyJ9.C_XAsxU0q4h4sEC-fDmc3A';

export default function MapComponent({ className = '' }) {
    const mapContainer = useRef(null);
    const map = useRef(null);
    const draw = useRef(new MapboxDraw({
        displayControlsDefault: false,
        controls: {
            polygon: true,
            line_string: true,
            point: true,
            trash: true
        }
    }));

    const geocoderControl = useRef(null);
    const navControl = useRef(null);
    const scaleControl = useRef(null);
    const geoControl = useRef(null);

    const [style, setStyle] = useState('mapbox://styles/mapbox/streets-v12');

    const mapStyles = {
        Streets: 'mapbox://styles/mapbox/streets-v12',
        Satellite: 'mapbox://styles/mapbox/satellite-v9',
        Hybrid: 'mapbox://styles/mapbox/satellite-streets-v12'
    };

    useEffect(() => {
        if (map.current) return;

        map.current = new mapboxgl.Map({
            container: mapContainer.current,
            style,
            center: [-55, -14],
            zoom: 2
        });

        map.current.on('load', setupMapExtras);

        map.current.on('draw.create', () => console.log('Desenho criado'));
        map.current.on('draw.update', () => console.log('Desenho atualizado'));
    }, []);

    useEffect(() => {
        if (!map.current) return;
        map.current.setStyle(style);
        map.current.once('style.load', setupMapExtras);
    }, [style]);

    const setupMapExtras = () => {
        try { if (navControl.current) map.current.removeControl(navControl.current); } catch { }
        try { if (scaleControl.current) map.current.removeControl(scaleControl.current); } catch { }
        try { if (geoControl.current) map.current.removeControl(geoControl.current); } catch { }
        try { if (geocoderControl.current) map.current.removeControl(geocoderControl.current); } catch { }
        try { map.current.removeControl(draw.current); } catch { }
        try { if (map.current.getLayer('3d-buildings')) map.current.removeLayer('3d-buildings'); } catch { }

        navControl.current = new mapboxgl.NavigationControl();
        map.current.addControl(navControl.current, 'top-right');

        scaleControl.current = new mapboxgl.ScaleControl({ maxWidth: 100, unit: 'metric' });
        map.current.addControl(scaleControl.current, 'top-right');

        geoControl.current = new mapboxgl.GeolocateControl({
            positionOptions: { enableHighAccuracy: true },
            trackUserLocation: true,
            showAccuracyCircle: true,
            showUserHeading: true
        });
        map.current.addControl(geoControl.current, 'top-right');

        geocoderControl.current = new MapboxGeocoder({
            accessToken: mapboxgl.accessToken,
            mapboxgl
        });
        map.current.addControl(geocoderControl.current, 'top-left');

        map.current.addControl(draw.current);

        if (style.includes('streets')) {
            map.current.addLayer({
                id: '3d-buildings',
                source: 'composite',
                'source-layer': 'building',
                filter: ['==', 'extrude', 'true'],
                type: 'fill-extrusion',
                minzoom: 15,
                paint: {
                    'fill-extrusion-color': '#aaa',
                    'fill-extrusion-height': ['get', 'height'],
                    'fill-extrusion-base': ['get', 'min_height'],
                    'fill-extrusion-opacity': 0.6
                }
            });
        }
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (event) {
            const kmlText = event.target.result;
            const parser = new DOMParser();
            const kml = parser.parseFromString(kmlText, 'text/xml');
            const geojson = toGeoJSON.kml(kml);

            if (map.current.getSource('kml-source')) {
                if (map.current.getLayer('kml-layer')) map.current.removeLayer('kml-layer');
                map.current.removeSource('kml-source');
            }

            map.current.addSource('kml-source', { type: 'geojson', data: geojson });
            map.current.addLayer({
                id: 'kml-layer',
                type: 'line',
                source: 'kml-source',
                paint: { 'line-color': '#ff0000', 'line-width': 3 }
            });

            const extractCoords = (feature) => {
                const geom = feature.geometry;
                if (geom.type === 'Point') return [geom.coordinates];
                if (geom.type === 'LineString') return geom.coordinates;
                if (geom.type === 'Polygon') return geom.coordinates.flat();
                if (geom.type === 'MultiPolygon') return geom.coordinates.flat(2);
                return [];
            };

            const allCoords = geojson.features.flatMap(extractCoords);
            if (allCoords.length) {
                map.current.fitBounds(
                    allCoords.reduce(
                        (bounds, coord) => bounds.extend(coord),
                        new mapboxgl.LngLatBounds(allCoords[0], allCoords[0])
                    )
                );
            }
        };

        reader.readAsText(file);
    };

    const handleExportGeoJSON = () => {
        const geojson = draw.current.getAll();
        const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'desenho.geojson';
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleExportKML = () => {
        const geojson = draw.current.getAll();
        const kml = tokml(geojson);
        const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'desenho.kml';
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className={`relative w-full h-[700px] bg-gray-200 rounded-lg shadow overflow-hidden ${className}`}>
            <div className="absolute bottom-20 left-4 z-10 flex flex-col space-y-2">
                {Object.entries(mapStyles).map(([name, url]) => (
                    <button
                        key={name}
                        onClick={() => setStyle(url)}
                        className="bg-white px-3 py-1 rounded shadow hover:bg-gray-200"
                    >
                        {name}
                    </button>
                ))}

                <label className="bg-linear-to-r from-padrao-100 to-padrao-900 px-3 py-1  text-center text-white rounded shadow hover:bg-gray-200 cursor-pointer">
                    Abrir KML
                    <input type="file" accept=".kml" onChange={handleFileUpload} className="hidden" />
                </label>

                <button onClick={handleExportGeoJSON} className="bg-white px-3 py-1 rounded shadow hover:bg-gray-200">
                    Exportar GeoJSON
                </button>
                <button onClick={handleExportKML} className="bg-white px-3 py-1 rounded shadow hover:bg-gray-200">
                    Exportar KML
                </button>
            </div>

            <div ref={mapContainer} className="w-full h-full" />
        </div>
    );
}