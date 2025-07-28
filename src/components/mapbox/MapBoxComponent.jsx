import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import MapboxGeocoder from '@mapbox/mapbox-gl-geocoder';
import * as toGeoJSON from '@tmcw/togeojson';
import tokml from 'tokml';
import ControlsPanel from './ControlsPanel';
import * as turf from '@turf/turf';

import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import '@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css';



// mapboxgl.accessToken = 'pk.eyJ1IjoiZmxhdmlvYm9yZ2VzbnVuZXMiLCJhIjoiY21iN3hwajR2MGdnYTJqcTEzbDd2eGd6YyJ9.C_XAsxU0q4h4sEC-fDmc3A';
mapboxgl.accessToken = 'pk.eyJ1IjoibG90ZW5ldCIsImEiOiJjbWRmeHBjcDYwZ3c0MmpwdHBtMHYzdWJqIn0.pibAQlLdp4q6JabzzkZfUw';

const ESTADOS = {
    "Acre": "AC", "Alagoas": "AL", "Amapá": "AP", "Amazonas": "AM", "Bahia": "BA", "Ceará": "CE",
    "Distrito Federal": "DF", "Espírito Santo": "ES", "Goiás": "GO", "Maranhão": "MA", "Mato Grosso": "MT",
    "Mato Grosso do Sul": "MS", "Minas Gerais": "MG", "Pará": "PA", "Paraíba": "PB", "Paraná": "PR",
    "Pernambuco": "PE", "Piauí": "PI", "Rio de Janeiro": "RJ", "Rio Grande do Norte": "RN",
    "Rio Grande do Sul": "RS", "Rondônia": "RO", "Roraima": "RR", "Santa Catarina": "SC",
    "São Paulo": "SP", "Sergipe": "SE", "Tocantins": "TO"
};


export default function MapBoxComponent() {
    const mapContainer = useRef(null);
    const map = useRef(null);
    const draw = useRef(null);
    const geocoder = useRef(null);

    const [style, setStyle] = useState('mapbox://styles/mapbox/streets-v12');

    const [curvasProntas, setCurvasProntas] = useState(false);
    const [curvasVisiveis, setCurvasVisiveis] = useState(false);

    const [ltPronto, setLtPronto] = useState(false);
    const [ltVisivel, setLtVisivel] = useState(false);

    const [federalPronto, setFederalPronto] = useState(false);
    const [federalVisivel, setFederalVisivel] = useState(false);

    const [riosPronto, setRiosPronto] = useState(false);
    const [riosVisivel, setRiosVisivel] = useState(false);

    const [limitesCidadesPronto, setLimitesCidadesPronto] = useState(false);
    const [limitesCidadesVisivel, setLimitesCidadesVisivel] = useState(false);

    const [estadoSelecionado, setEstadoSelecionado] = useState('');
    const [areasProntas, setAreasProntas] = useState({});
    const [areasVisiveis, setAreasVisiveis] = useState({});

    const [ufSelecionado, setUfSelecionado] = useState(null);
    const [cidadesFiltradas, setCidadesFiltradas] = useState([]);
    const [carregandoCidades, setCarregandoCidades] = useState(false);

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

        draw.current = new MapboxDraw({
            controls: { polygon: true, trash: true }
        });
        map.current.addControl(draw.current);

        geocoder.current = new MapboxGeocoder({ accessToken: mapboxgl.accessToken, mapboxgl });
        map.current.addControl(geocoder.current, 'top-left');
        map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

        map.current.on('load', setupMapExtras);
    }, []);

    useEffect(() => {
        if (!map.current) return;
        map.current.setStyle(style);
        map.current.once('style.load', setupMapExtras);
    }, [style]);

    // Carrega camada ao selecionar estado
    useEffect(() => {
        if (estadoSelecionado) {
            carregarAreasEstaduais(estadoSelecionado);
        }
    }, [estadoSelecionado]);

    const mudarEstiloMapa = (styleURL, ufSelecionado) => {
        if (!map.current) return;

        map.current.setStyle(styleURL);

        map.current.once('style.load', () => {
            // 🔁 Recarrega todas as camadas personalizadas
            setupMapExtras();

            // 🔁 Recarrega áreas estaduais do estado atual
            if (ufSelecionado) {
                carregarAreasEstaduais(ufSelecionado);
            }
        });
    };


    const setupMapExtras = () => {
        try {
            if (!map.current.getSource('terrain-data')) {
                map.current.addSource('terrain-data', {
                    type: 'vector',
                    url: 'mapbox://mapbox.mapbox-terrain-v2'
                });
            }

            if (!map.current.getLayer('contour')) {
                map.current.addLayer({
                    id: 'contour',
                    type: 'line',
                    source: 'terrain-data',
                    'source-layer': 'contour',
                    layout: { visibility: 'none' },
                    paint: { 'line-color': '#ff6600', 'line-width': 1.2 }
                });
            }

            if (!map.current.getLayer('contour-labels')) {
                map.current.addLayer({
                    id: 'contour-labels',
                    type: 'symbol',
                    source: 'terrain-data',
                    'source-layer': 'contour',
                    layout: {
                        visibility: 'none',
                        'symbol-placement': 'line',
                        'text-field': ['get', 'ele'],
                        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                        'text-size': 11
                    },
                    paint: {
                        'text-color': '#333',
                        'text-halo-color': '#fff',
                        'text-halo-width': 1
                    }
                });
            }

            setCurvasProntas(true);
        } catch (err) {
            console.error("Erro curvas:", err);
        }

        try {
            if (!map.current.getSource('lt_existente')) {
                map.current.addSource('lt_existente', {
                    type: 'vector',
                    url: 'mapbox://lotenet.7t4kpbhn'
                });
            }

            if (!map.current.getLayer('lt_existente')) {
                map.current.addLayer({
                    id: 'lt_existente',
                    type: 'line',
                    source: 'lt_existente',
                    'source-layer': 'lt_existente-5porum',
                    layout: { visibility: 'none' },
                    paint: {
                        'line-color': '#FF0000',
                        'line-width': 2
                    }
                });
            }

            setLtPronto(true);
        } catch (err) {
            console.error("Erro LT:", err);
        }

        try {
            if (!map.current.getSource('mapbox-streets')) {
                map.current.addSource('mapbox-streets', {
                    type: 'vector',
                    url: 'mapbox://mapbox.mapbox-streets-v8'
                });
            }

            if (!map.current.getLayer('rios-mapbox')) {
                map.current.addLayer({
                    id: 'rios-mapbox',
                    type: 'line',
                    source: 'mapbox-streets',
                    'source-layer': 'waterway',
                    filter: ['in', 'class', 'river', 'stream', 'canal', 'drain', 'ditch'],
                    layout: {
                        visibility: 'none'
                    },
                    paint: {
                        'line-color': '#0088ff',
                        'line-width': 2
                    }
                });
            }

            setRiosPronto(true);
        } catch (err) {
            console.error("Erro rios:", err);
        }

        try {
            if (!map.current.getSource('limites_federais')) {
                map.current.addSource('limites_federais', {
                    type: 'vector',
                    url: 'mapbox://lotenet.abbcxn9l'
                });
            }

            if (!map.current.getLayer('limites_federais')) {
                map.current.addLayer({
                    id: 'limites_federais',
                    type: 'line',
                    source: 'limites_federais',
                    'source-layer': 'limites_federais-3b28ea',
                    layout: { visibility: 'none' },
                    paint: {
                        'line-color': '#03300B',
                        'line-width': 2
                    },

                    minzoom: 0,
                    maxzoom: 24
                });
            }

            setFederalPronto(true);
        } catch (err) {
            console.error("Erro Limites Federais:", err);
        }
    };

    const carregarAreasEstaduais = async (uf) => {
        const id = `areas_estaduais_${uf.toLowerCase()}`;
        const url = `/dados/areas_${uf}.geojson`;

        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error("Arquivo não encontrado");

            const data = await res.json();

            if (!map.current.getSource(id)) {
                map.current.addSource(id, {
                    type: 'geojson',
                    data: data,
                });
            }

            if (!map.current.getLayer(id)) {
                map.current.addLayer({
                    id,
                    type: 'line',
                    source: id,
                    layout: { visibility: 'none' },
                    paint: { 'line-color': '#39ff14', 'line-width': 2 },
                });
            }

            setAreasProntas((prev) => ({ ...prev, [uf]: true }));
        } catch (err) {
            console.warn(`Camada de ${uf} não encontrada:`, err.message);
            setAreasProntas((prev) => ({ ...prev, [uf]: false }));
        }
    };

    const toggleCurvas = () => {
        const vis = map.current.getLayoutProperty('contour', 'visibility');
        const novo = vis === 'visible' ? 'none' : 'visible';
        map.current.setLayoutProperty('contour', 'visibility', novo);
        map.current.setLayoutProperty('contour-labels', 'visibility', novo);
        setCurvasVisiveis(novo === 'visible');
    };

    const toggleLT = () => {
        const vis = map.current.getLayoutProperty('lt_existente', 'visibility');
        const novo = vis === 'visible' ? 'none' : 'visible';
        map.current.setLayoutProperty('lt_existente', 'visibility', novo);
        setLtVisivel(novo === 'visible');
    };

    const toggleFederais = () => {
        const vis = map.current.getLayoutProperty('limites_federais', 'visibility');
        const novo = vis === 'visible' ? 'none' : 'visible';
        map.current.setLayoutProperty('limites_federais', 'visibility', novo);
        setFederalVisivel(novo === 'visible');
    };

    const toggleRios = () => {
        const visibility = map.current.getLayoutProperty('rios-mapbox', 'visibility');
        const novaVisibilidade = visibility === 'visible' ? 'none' : 'visible';
        map.current.setLayoutProperty('rios-mapbox', 'visibility', novaVisibilidade);
        setRiosVisivel(novaVisibilidade === 'visible');
    };


    const toggleLimites = () => {
        if (!map.current.getLayer("limites-cidades")) return;
        const vis = map.current.getLayoutProperty("limites-cidades", "visibility");
        const novo = vis === 'visible' ? 'none' : 'visible';
        map.current.setLayoutProperty("limites-cidades", "visibility", novo);
        setLimitesCidadesVisivel(novo === 'visible');
    };

    const toggleAreasEstaduais = (uf) => {
        const id = `areas_estaduais_${uf.toLowerCase()}`;
        const vis = map.current.getLayoutProperty(id, 'visibility');
        const novo = vis === 'visible' ? 'none' : 'visible';
        map.current.setLayoutProperty(id, 'visibility', novo);
        setAreasVisiveis((prev) => ({ ...prev, [uf]: novo === 'visible' }));
    };

    const filtrarPorUF = (uf) => {
        if (!map.current || !uf) return;

        const layerId = 'limites-cidades';
        const sourceLayerName = 'cidades';

        setUfSelecionado(uf);
        setCarregandoCidades(true);

        // 🔁 Carrega os nomes das cidades a partir do JSON leve
        fetch(`/dados/estados/${uf}.json`)
            .then(res => res.json())
            .then(data => {
                const nomes = data.map(c => c.NM_MUN?.trim()).filter(Boolean).sort();
                setCidadesFiltradas(nomes);
            })
            .catch((err) => {
                console.error("Erro ao carregar cidades:", err);
                setCidadesFiltradas([]);
            })
            .finally(() => setCarregandoCidades(false));

        // ✅ Renderiza tileset para visualização (sem depender dele para lista)
        if (!map.current.getSource(layerId)) {
            map.current.addSource(layerId, {
                type: 'vector',
                url: 'mapbox://lotenet.59fh1i4v'
            });

            map.current.addLayer({
                id: layerId,
                type: 'line',
                source: layerId,
                'source-layer': sourceLayerName,
                layout: { visibility: 'visible' },
                paint: {
                    'line-color': '#EEAD2D',
                    'line-width': 2
                },
                filter: ['==', ['get', 'SIGLA_UF'], uf]
            });
        } else {
            map.current.setFilter(layerId, ['==', ['get', 'SIGLA_UF'], uf]);
        }

        setLimitesCidadesPronto(true);
        setLimitesCidadesVisivel(true);
    };

    const onCidadeSelecionada = async (cidadeNome) => {
        if (!cidadeNome || !ufSelecionado || !map.current) return;

        const nomeCompleto = `${cidadeNome}, ${ufSelecionado}, Brasil`;
        const encoded = encodeURIComponent(nomeCompleto);

        try {
            const res = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${mapboxgl.accessToken}&limit=1&language=pt`
            );
            const data = await res.json();

            if (!data.features || data.features.length === 0) {
                console.warn("❌ Cidade não encontrada via geocoding:", nomeCompleto);
                return;
            }

            const [lng, lat] = data.features[0].center;

            map.current.flyTo({
                center: [lng, lat],
                zoom: 11
            });

        } catch (err) {
            console.error("Erro na geocodificação Mapbox:", err);
        }
    };

    const onKMLUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const parser = new DOMParser();
                const kmlDoc = parser.parseFromString(event.target.result, 'text/xml');
                const geojson = toGeoJSON.kml(kmlDoc);

                if (!geojson.features || geojson.features.length === 0) {
                    alert("Arquivo KML sem geometrias válidas.");
                    return;
                }

                // 🧠 Tratamento para MultiGeometry → GeometryCollection
                const explodedFeatures = geojson.features.flatMap(f => {
                    const baseProps = {
                        type: 'Feature',
                        properties: f.properties,
                    };
                    if (f.geometry.type === 'GeometryCollection') {
                        return f.geometry.geometries.map(g => ({
                            ...baseProps,
                            geometry: g
                        }));
                    } else {
                        return [f];
                    }
                });

                draw.current.deleteAll();
                draw.current.add({
                    type: 'FeatureCollection',
                    features: explodedFeatures
                });

                // 🗺️ Ajuste de visualização do mapa para as geometrias
                const allCoords = explodedFeatures.flatMap(f => {
                    const g = f.geometry;
                    return g.type === 'Point' ? [g.coordinates] :
                        g.type === 'LineString' ? g.coordinates :
                            g.type === 'Polygon' ? g.coordinates[0] :
                                g.type === 'MultiPolygon' ? g.coordinates.flat(2) : [];
                });

                if (allCoords.length) {
                    map.current.fitBounds(
                        allCoords.reduce(
                            (bounds, coord) => bounds.extend(coord),
                            new mapboxgl.LngLatBounds(allCoords[0], allCoords[0])
                        ),
                        { padding: 40 }
                    );
                }

            } catch (error) {
                console.error("Erro ao ler KML:", error);
                alert("Erro ao processar o arquivo KML.");
            }
        };

        reader.readAsText(file);
    };


    const onExportKML = () => {
        const geojson = draw.current.getAll();
        const kmlData = tokml(geojson);
        const blob = new Blob([kmlData], { type: 'application/vnd.google-earth.kml+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'desenho.kml';
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="relative w-[80%] h-full bg-transparent rounded-lg shadow overflow-hidden mt-10 mx-auto pb-50">
            <div ref={mapContainer} className="w-full h-[600px]" />

            <ControlsPanel
                className="h-full"
                mapStyles={mapStyles}
                setStyle={setStyle}
                curvasProntas={curvasProntas}
                curvasVisiveis={curvasVisiveis}
                toggleCurvas={toggleCurvas}
                ltPronto={ltPronto}
                ltVisivel={ltVisivel}
                toggleLT={toggleLT}
                federalPronto={federalPronto}
                federalVisivel={federalVisivel}
                riosPronto={riosPronto}
                riosVisivel={riosVisivel}
                toggleRios={toggleRios}
                toggleFederais={toggleFederais}
                limitesCidadesPronto={limitesCidadesPronto}
                limitesCidadesVisivel={limitesCidadesVisivel}
                toggleLimites={toggleLimites}
                estados={ESTADOS}
                ufSelecionado={ufSelecionado}
                setUfSelecionado={setUfSelecionado}
                filtrarPorUF={filtrarPorUF}
                onExportKML={onExportKML}
                onKMLUpload={onKMLUpload}
                cidadesFiltradas={cidadesFiltradas}
                onCidadeSelecionada={onCidadeSelecionada}
                carregandoCidades={carregandoCidades}
                estadoSelecionado={estadoSelecionado}
                setEstadoSelecionado={setEstadoSelecionado}
                areasProntas={areasProntas}
                areasVisiveis={areasVisiveis}
                toggleAreasEstaduais={toggleAreasEstaduais}
                mudarEstiloMapa={mudarEstiloMapa}
                map={map.current}
            />
        </div>
    );
}