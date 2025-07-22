import { useRef, useEffect } from 'react';

export default function MapContainer({ initMap }) {
    const mapContainer = useRef(null);

    useEffect(() => {
        if (mapContainer.current && initMap) {
            initMap(mapContainer.current);
        }
    }, [initMap]);

    return <div ref={mapContainer} className="w-full h-[80%]" />;
}
