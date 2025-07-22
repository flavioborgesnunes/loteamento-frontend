import { useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import MapboxGeocoder from '@mapbox/mapbox-gl-geocoder';

mapboxgl.accessToken = 'SUA_KEY';

export function useMapbox({ setCurvasProntas, setLtPronto }) {
    const map = useRef(null);
    const draw = useRef(null);
    const geocoder = useRef(null);

    const initMap = (container) => {
        if (map.current) return;

        map.current = new mapboxgl.Map({
            container,
            style: 'mapbox://styles/mapbox/streets-v12',
            center: [-55, -14],
            zoom: 2
        });

        draw.current = new MapboxDraw({ controls: { polygon: true, trash: true } });
        geocoder.current = new MapboxGeocoder({ accessToken: mapboxgl.accessToken, mapboxgl });

        map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
        map.current.addControl(draw.current);
        map.current.addControl(geocoder.current, 'top-left');

        map.current.on('load', () => {
            // Adicionar camadas
        });
    };

    return { map, draw, geocoder, initMap };
}
