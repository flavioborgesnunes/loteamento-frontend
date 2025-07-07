import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import MapboxGeocoder from '@mapbox/mapbox-gl-geocoder';
import * as toGeoJSON from '@tmcw/togeojson';
import tokml from 'tokml';
import api from '../utils/axios'

import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import '@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css';

mapboxgl.accessToken = 'pk.eyJ1IjoiZmxhdmlvYm9yZ2VzbnVuZXMiLCJhIjoiY21iN3hwajR2MGdnYTJqcTEzbDd2eGd6YyJ9.C_XAsxU0q4h4sEC-fDmc3A';

export default function MapComponent({ className = '', setCarregandoRestricoes, setErroRestricao }) {
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

    const [ltPronto, setLtPronto] = useState(false);
    const [curvasProntas, setCurvasProntas] = useState(false);
    const [ltVisivel, setLtVisivel] = useState(false);
    const [curvasVisiveis, setCurvasVisiveis] = useState(false);



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

        const checkReady = () => {
            if (map.current.isStyleLoaded() && map.current.getStyle().layers.length > 0) {
                setupMapExtras();
            } else {
                setTimeout(checkReady, 100);
            }
        };

        map.current.once('style.load', checkReady);
    }, [style]);





    const setupMapExtras = () => {
        // Reset dos indicadores de carregamento
        setLtPronto(false);
        setCurvasProntas(false);
        setLtVisivel(false);
        setCurvasVisiveis(false);

        // Remove controles anteriores
        try { if (navControl.current) map.current.removeControl(navControl.current); } catch { }
        try { if (scaleControl.current) map.current.removeControl(scaleControl.current); } catch { }
        try { if (geoControl.current) map.current.removeControl(geoControl.current); } catch { }
        try { if (geocoderControl.current) map.current.removeControl(geocoderControl.current); } catch { }

        try {
            if (map.current._controls.includes(draw.current)) {
                map.current.removeControl(draw.current);
            }
        } catch { }

        // Controles
        navControl.current = new mapboxgl.NavigationControl();
        scaleControl.current = new mapboxgl.ScaleControl({ maxWidth: 100, unit: 'metric' });
        geoControl.current = new mapboxgl.GeolocateControl({
            positionOptions: { enableHighAccuracy: true },
            trackUserLocation: true,
            showAccuracyCircle: true,
            showUserHeading: true
        });
        geocoderControl.current = new MapboxGeocoder({ accessToken: mapboxgl.accessToken, mapboxgl });

        map.current.addControl(navControl.current, 'top-right');
        map.current.addControl(scaleControl.current, 'top-right');
        map.current.addControl(geoControl.current, 'top-right');
        map.current.addControl(geocoderControl.current, 'top-left');

        // Redesenha Draw
        draw.current = new MapboxDraw({
            displayControlsDefault: false,
            controls: {
                polygon: true,
                line_string: true,
                point: true,
                trash: true
            }
        });
        map.current.addControl(draw.current);

        // 🔁 Remove e recria curvas de nível
        try {
            if (map.current.getLayer("contour-labels")) map.current.removeLayer("contour-labels");
            if (map.current.getLayer("contour")) map.current.removeLayer("contour");
            if (map.current.getSource("terrain-data")) map.current.removeSource("terrain-data");

            map.current.addSource('terrain-data', {
                type: 'vector',
                url: 'mapbox://mapbox.mapbox-terrain-v2'
            });

            const labelLayerId = map.current.getStyle().layers.find(
                l => l.type === 'symbol' && l.layout?.['text-field']
            )?.id;

            map.current.addLayer({
                id: 'contour',
                type: 'line',
                source: 'terrain-data',
                'source-layer': 'contour',
                layout: { visibility: 'none' },
                paint: {
                    'line-color': '#ff6600',
                    'line-width': 1.2
                }
            }, labelLayerId);

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
            }, labelLayerId);

            setCurvasProntas(true);
        } catch (err) {
            console.error("Erro ao carregar curvas de nível:", err);
            setCurvasProntas(false);
        }

        // 🔁 Remove e recria camada lt_existente
        try {
            if (map.current.getLayer("lt_existente")) map.current.removeLayer("lt_existente");
            if (map.current.getSource("lt_existente")) map.current.removeSource("lt_existente");

            map.current.addSource("lt_existente", {
                type: "geojson",
                data: "/dados/lt_existente.geojson",
            });

            map.current.addLayer({
                id: "lt_existente",
                type: "line",
                source: "lt_existente",
                layout: { visibility: 'none' },
                paint: {
                    "line-color": "#FF0000",
                    "line-width": 2,
                },
            });

            setLtPronto(true);
        } catch (err) {
            console.error("Erro ao carregar camada lt_existente:", err);
            setLtPronto(false);
        }
        // === Evento de busca via geocoder ===
        geocoderControl.current.on('result', async (e) => {
            let cidade = '';
            if (e.result.place_name) {
                const partes = e.result.place_name.split(',').map(p => p.trim());
                cidade = partes[0] || '';
            }

            if (!cidade) {
                setErroRestricao("Cidade não reconhecida.");
                return;
            }

            setCarregandoRestricoes(true);
            setErroRestricao("");

            try {
                const { data } = await api.post('/autofill/', { cidade });

                document.getElementById('cidade').value = data.cidade || '';
                document.getElementById('estado').value = data.estado || '';
                document.getElementById('codigo_ibge').value = data.codigo_ibge || '';

                document.getElementById('campo-area-minima').value = data['campo-area-minima'] || '';
                document.getElementById('campo-largura-calcada').value = data['campo-largura-calcada'] || '';
                document.getElementById('recuo_frontal').value = data['recuo_frontal'] || '';
                document.getElementById('recuo_lateral').value = data['recuo_lateral'] || '';
                document.getElementById('campo-app').value = 'Verificar pela Lei 12.651/2012';

                const container = document.getElementById("resposta-ia");
                container.innerHTML = "";
                if (data.resposta_ia && Array.isArray(data.resposta_ia)) {
                    data.resposta_ia.forEach(([pergunta, resposta]) => {
                        const bloco = document.createElement("div");
                        bloco.className = "mb-4 p-2 bg-white border-l-6 border-padrao-900 rounded shadow";
                        bloco.innerHTML = `<strong>${pergunta}</strong><br/><span>${resposta}</span>`;
                        container.appendChild(bloco);
                    });
                } else {
                    container.innerHTML = "<p class='text-gray-500 italic'>Nenhuma resposta gerada pela IA.</p>";
                }

            } catch (err) {
                console.error("Erro ao buscar IA:", err);
                setErroRestricao("Erro ao buscar dados da IA.");
            } finally {
                setCarregandoRestricoes(false);
            }
        });
    };

    const enviarKMLParaBackend = (nome, geojson) => {
        console.log("Função enviarKMLParaBackend ainda não implementada:", nome);
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();

        reader.onload = async (event) => {
            setCarregandoRestricoes(true);
            setErroRestricao("");

            try {
                // 1. Parse KML
                const parser = new DOMParser();
                const kmlDoc = parser.parseFromString(event.target.result, 'text/xml');
                const geojson = toGeoJSON.kml(kmlDoc);

                if (!geojson.features || geojson.features.length === 0) {
                    throw new Error("Arquivo KML sem geometrias válidas.");
                }

                // 2. Exibir geometrias no Draw para edição
                draw.current.deleteAll();
                draw.current.add(geojson);

                // 3. Zoom automático
                const allCoords = geojson.features.flatMap(f => {
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
                        )
                    );
                }

                // 4. Calcular centroide
                const [lngSum, latSum] = allCoords.reduce(([lng, lat], [x, y]) => [lng + x, lat + y], [0, 0]);
                const centroide = [lngSum / allCoords.length, latSum / allCoords.length];

                // 5. Reverse geocoding com Mapbox
                const geocodeResp = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${centroide[0]},${centroide[1]}.json?access_token=${mapboxgl.accessToken}`);
                const geocodeData = await geocodeResp.json();

                const cidade = geocodeData.features.find(f => f.place_type.includes('place'))?.text || '';
                const estado = geocodeData.features.find(f => f.place_type.includes('region'))?.text || '';

                if (!cidade) throw new Error("Não foi possível determinar a cidade a partir do KML.");

                document.getElementById('cidade').value = cidade;
                if (estado) document.getElementById('estado').value = estado;

                // 6. Buscar código IBGE
                const ibgeResp = await fetch("https://servicodados.ibge.gov.br/api/v1/localidades/municipios");
                const municipios = await ibgeResp.json();
                const unidecode = str => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                const municipio = municipios.find(m => unidecode(m.nome) === unidecode(cidade));
                if (municipio) {
                    document.getElementById('codigo_ibge').value = municipio.id;
                }

                // 7. Chamada para backend (/autofill/)
                const { data } = await api.post('/autofill/', { cidade });

                // 8. Preencher campos da IA
                document.getElementById('campo-area-minima').value = data['campo-area-minima'] || '';
                document.getElementById('campo-largura-calcada').value = data['campo-largura-calcada'] || '';
                document.getElementById('recuo_frontal').value = data['recuo_frontal'] || '';
                document.getElementById('recuo_lateral').value = data['recuo_lateral'] || '';
                document.getElementById('campo-app').value = 'Verificar pela Lei 12.651/2012';

                // 9. Exibir respostas da IA
                const container = document.getElementById("resposta-ia");
                container.innerHTML = "";
                if (data.resposta_ia && Array.isArray(data.resposta_ia)) {
                    data.resposta_ia.forEach(([pergunta, resposta]) => {
                        const bloco = document.createElement("div");
                        bloco.className = "mb-4 p-2 bg-white border-l-6 border-padrao-900 rounded shadow";
                        bloco.innerHTML = `<strong>${pergunta}</strong><br/><span>${resposta}</span>`;
                        container.appendChild(bloco);
                    });
                }

                // 10. (Opcional) Enviar para backend
                enviarKMLParaBackend(file.name, geojson);

            } catch (err) {
                console.error("Erro no processamento do KML:", err);
                setErroRestricao("Erro ao processar o arquivo: " + err.message);
            } finally {
                setCarregandoRestricoes(false);
                console.log("🔚 Finalizado o carregamento.");
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
        <div className={`relative w-[80%] h-[700px] bg-gray-200 rounded-lg shadow overflow-hidden ${className}`}>
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

                <label className="bg-gradient-to-r from-padrao-100 to-padrao-900 px-3 py-1 text-center text-white rounded shadow hover:bg-gray-200 cursor-pointer">
                    Abrir KML
                    <input type="file" accept=".kml" onChange={handleFileUpload} className="hidden" />
                </label>

                <button onClick={handleExportGeoJSON} className="bg-white px-3 py-1 rounded shadow hover:bg-gray-200">
                    Exportar GeoJSON
                </button>
                <button onClick={handleExportKML} className="bg-white px-3 py-1 rounded shadow hover:bg-gray-200">
                    Exportar KML
                </button>
                <button
                    onClick={() => {
                        if (!curvasProntas || !map.current.getLayer('contour') || !map.current.getLayer('contour-labels')) {
                            console.warn("Curvas de nível ainda não carregadas.");
                            return;
                        }
                        const atual = map.current.getLayoutProperty('contour', 'visibility');
                        const novo = atual === 'visible' ? 'none' : 'visible';
                        map.current.setLayoutProperty('contour', 'visibility', novo);
                        map.current.setLayoutProperty('contour-labels', 'visibility', novo);
                        setCurvasVisiveis(novo === 'visible');
                    }}
                    className="bg-white px-3 py-1 rounded shadow hover:bg-gray-200"
                >
                    {curvasVisiveis ? "Ocultar Curvas de Nível" : "Mostrar Curvas de Nível"}
                </button>


                <button
                    onClick={() => {
                        if (!ltPronto || !map.current.getLayer('lt_existente')) {
                            console.warn("Camada lt_existente ainda não carregada.");
                            return;
                        }
                        const atual = map.current.getLayoutProperty('lt_existente', 'visibility');
                        const novo = atual === 'visible' ? 'none' : 'visible';
                        map.current.setLayoutProperty('lt_existente', 'visibility', novo);
                        setLtVisivel(novo === 'visible');
                    }}
                    className="bg-white px-3 py-1 rounded shadow hover:bg-gray-200"
                >
                    {ltVisivel ? "Ocultar Linhas de Transmissão" : "Mostrar Linhas de Transmissão"}
                </button>


            </div>

            <div ref={mapContainer} className="w-full h-full" />
        </div>
    );
}
