import React, { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, LayersControl, GeoJSON, Pane, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import useAxios from "../../utils/useAxios";

// >>> NOVOS IMPORTS (parcelamento)
import ParcelamentoPanel from "../parcelamento/ParcelamentoPanel";
import useParcelamentoApi from "../parcelamento/parcelamento";

// ---------- Tiles ----------
const token = import.meta.env.VITE_MAPBOX_TOKEN?.trim();
function TilesWithFallback() {
    const hasToken = !!token;
    return (
        <LayersControl position="topright">
            {hasToken && (
                <>
                    <LayersControl.BaseLayer checked name="Mapbox Híbrido">
                        <TileLayer
                            url={`https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/{z}/{x}/{y}{r}?access_token=${token}`}
                            tileSize={512}
                            zoomOffset={-1}
                            maxZoom={22}
                            attribution="&copy; Mapbox &copy; OpenStreetMap"
                            detectRetina
                        />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name="Mapbox Ruas">
                        <TileLayer
                            url={`https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}{r}?access_token=${token}`}
                            tileSize={512}
                            zoomOffset={-1}
                            maxZoom={22}
                            attribution="&copy; Mapbox &copy; OpenStreetMap"
                            detectRetina
                        />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name="Mapbox Satélite">
                        <TileLayer
                            url={`https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/{z}/{x}/{y}{r}?access_token=${token}`}
                            tileSize={512}
                            zoomOffset={-1}
                            maxZoom={22}
                            attribution="&copy; Mapbox &copy; OpenStreetMap"
                            detectRetina
                        />
                    </LayersControl.BaseLayer>
                </>
            )}
            <LayersControl.BaseLayer checked={!hasToken} name="Esri World Imagery">
                <TileLayer
                    url="https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    attribution="Tiles &copy; Esri"
                />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="OSM (Ruas)">
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
            </LayersControl.BaseLayer>
        </LayersControl>
    );
}

// ---------- Helpers FC/Bounds ----------
// (mesmos helpers que você já tinha)
const R = 6378137;
function lonLatToMercMeters([lon, lat]) {
    const x = (lon * Math.PI / 180) * R;
    const y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2)) * R;
    return [x, y];
}
function ringAreaMeters2(ring) {
    let area = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = lonLatToMercMeters(ring[i]);
        const [xj, yj] = lonLatToMercMeters(ring[j]);
        area += (xj * yi - xi * yj);
    }
    return Math.abs(area) / 2;
}
function polygonAreaMeters2(coords) {
    if (!coords || !coords.length) return 0;
    let area = 0;
    coords.forEach((ring, idx) => {
        const a = ringAreaMeters2(ring);
        area += (idx === 0 ? a : -a);
    });
    return Math.max(area, 0);
}
function multiPolygonAreaMeters2(mpolyCoords) {
    if (!mpolyCoords || !mpolyCoords.length) return 0;
    return mpolyCoords.reduce((sum, poly) => sum + polygonAreaMeters2(poly), 0);
}
function areaGeoJSONMeters2(geom) {
    if (!geom) return 0;
    if (geom.type === "Polygon") return polygonAreaMeters2(geom.coordinates);
    if (geom.type === "MultiPolygon") return multiPolygonAreaMeters2(geom.coordinates);
    return 0;
}
function fmtArea(m2) {
    if (!m2) return { m2: "0", ha: "0", label: "0 m²" };
    const ha = m2 / 10000;
    const m2s = m2.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
    const has = ha.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
    return { m2: m2s, ha: has, label: `${m2s} m² (${has} ha)` };
}
function toFC(x) {
    if (!x) return { type: "FeatureCollection", features: [] };
    if (x.type === "FeatureCollection") return x;
    if (x.type === "Feature") return { type: "FeatureCollection", features: [x] };
    return { type: "FeatureCollection", features: [] };
}
function isNonEmptyFC(fc) {
    return fc?.type === "FeatureCollection" && Array.isArray(fc.features) && fc.features.length > 0;
}
function computeBoundsFromFCs(listOfFCs = []) {
    const merged = { type: "FeatureCollection", features: [] };
    listOfFCs.forEach((fc) => {
        const f = toFC(fc);
        if (isNonEmptyFC(f)) merged.features.push(...f.features);
    });
    if (!merged.features.length) return null;
    const layer = L.geoJSON(merged);
    const b = layer.getBounds?.();
    try { layer.remove?.(); } catch { }
    return b && b.isValid() ? b : null;
}
function buildFCsForFit(geo) {
    if (!geo) return { fcAOI: null, all: null };
    const aoiGeom = geo?.aoi || geo?.aoi_snapshot || null;
    const fcAOI = aoiGeom ? toFC({ type: "Feature", geometry: aoiGeom, properties: {} }) : null;
    const fcs = [
        toFC(geo?.av), toFC(geo?.corte_av),
        toFC(geo?.ruas_eixo), toFC(geo?.ruas_mask),
        toFC(geo?.rios_centerline), toFC(geo?.rios_faixa),
        toFC(geo?.lt_centerline), toFC(geo?.lt_faixa),
        toFC(geo?.ferrovias_centerline), toFC(geo?.ferrovias_faixa),
    ];
    const all = { type: "FeatureCollection", features: [] };
    fcs.forEach((fc) => { if (fc?.features?.length) all.features.push(...fc.features); });
    return { fcAOI, all: isNonEmptyFC(all) ? all : null };
}

// ---------- Estilos ----------
const styleAoi = { color: "#2c7be5", weight: 2, fillOpacity: 0.05, opacity: 1 };
const styleAV = { color: "#007a4d", fillColor: "#41d686", fillOpacity: 0.45, weight: 2 };
const styleCorte = { color: "#e11d48", fillColor: "#fca5a5", fillOpacity: 0.35, weight: 2, dashArray: "6 3" };
const styleRuaEixo = { color: "#333", weight: 3, opacity: 1 };
const styleRuaMask = { color: "#333", weight: 1, opacity: 0.7, fillOpacity: 0.25 };
const styleRiosCL = { color: "#2E86AB", weight: 2, opacity: 1 };
const styleRiosFx = { color: "#2E86AB", weight: 2, opacity: 1, fillOpacity: 0.25 };
const styleLTCL = { color: "#A84300", weight: 2, opacity: 1 };
const styleLTFx = { color: "#A84300", weight: 2, opacity: 1, fillOpacity: 0.25 };
const styleFerCL = { color: "#6D4C41", weight: 2, opacity: 1 };
const styleFerFx = { color: "#6D4C41", weight: 2, opacity: 1, fillOpacity: 0.25 };
const styleLoteavel = { color: "#FFB300", weight: 2, opacity: 1, fillColor: "#FFD54F", fillOpacity: 0.22 };

// >>> Estilos do PARCELAMENTO (prévia e oficial)
const styleViaPreview = { color: "#0ea5e9", weight: 3, opacity: 1 };         // ciano
const styleQuartPreview = { color: "#0ea5e9", weight: 2, fillOpacity: 0.10 };
const styleLotePreview = { color: "#0ea5e9", weight: 1, opacity: 0.9 };

const styleViaOficial = { color: "#7c3aed", weight: 3, opacity: 1 };         // roxo
const styleQuartOficial = { color: "#7c3aed", weight: 2, fillOpacity: 0.10 };
const styleLoteOficial = { color: "#7c3aed", weight: 1, opacity: 0.9 };

// ---------- Popups ----------
const onEachWithPopup = (getHtml) => (feature, layer) => {
    const html = getHtml?.(feature) || "";
    if (html) layer.bindPopup(html);
};
const ruaEixoPopup = (f) => (f?.properties?.width_m != null ? `<b>Rua</b><br/>largura: ${Number(f.properties.width_m).toFixed(2)} m` : "<b>Rua</b>");
const ruaMaskPopup = (f) => (f?.properties?.width_m != null ? `<b>Máscara de Rua</b><br/>largura: ${Number(f.properties.width_m).toFixed(2)} m` : "<b>Máscara de Rua</b>");
const margemPopup = (label) => (f) => (f?.properties?.margem_m != null ? `<b>${label}</b><br/>margem: ${Number(f.properties.margem_m).toFixed(2)} m` : `<b>${label}</b>`);


// habilita edição Geoman nas vias da PRÉVIA
function onEachViaPreview(feature, layer) {
    // marca para conseguirmos buscar depois
    try { layer.options._parcelTag = "vias"; } catch { }
    try { layer.options.pane = "pane-parcel-prev"; } catch { }
    // habilita edição (vértices, snap, etc.)
    try {
        if (layer.pm && typeof layer.pm.enable === "function") {
            layer.pm.enable({
                allowSelfIntersection: false,
                snappable: true,
                snapDistance: 20,
            });
        }
    } catch { }
}

// NÃO editamos quarteirões/lotes (só leitura na prévia)
function onEachNoEdit(feature, layer) {
    try { layer.options._parcelTag = "noedit"; } catch { }
    try {
        if (layer.pm && typeof layer.pm.disable === "function") {
            layer.pm.disable();
        }
    } catch { }
}


// ---------- Componente que faz o FIT (prioriza AOI) ----------
function FitToData({ geo, restricaoId }) {
    const map = useMap();
    const fittedRef = useRef(null);

    useEffect(() => {
        if (!map || !geo || !restricaoId) return;
        if (fittedRef.current === restricaoId) return;
        const { fcAOI, all } = buildFCsForFit(geo);
        let bounds = computeBoundsFromFCs(fcAOI ? [fcAOI] : []);
        if (!bounds) bounds = computeBoundsFromFCs(all ? [all] : []);
        if (bounds) {
            try { map.invalidateSize(false); } catch { }
            try { map.fitBounds(bounds, { padding: [30, 30], maxZoom: 19 }); } catch { }
            requestAnimationFrame(() => {
                try { map.invalidateSize(false); } catch { }
                try { map.fitBounds(bounds, { padding: [30, 30], maxZoom: 19 }); } catch { }
            });
            setTimeout(() => {
                try { map.invalidateSize(false); } catch { }
                try { map.fitBounds(bounds, { padding: [30, 30], maxZoom: 19 }); } catch { }
            }, 120);
            fittedRef.current = restricaoId;
        }
    }, [map, geo, restricaoId]);

    useEffect(() => {
        if (!map) return;
        const onResize = () => { try { map.invalidateSize(false); } catch { } };
        map.on("resize", onResize);
        return () => { map.off("resize", onResize); };
    }, [map]);

    return null;
}

function GeomanInit() {
    const map = useMap();
    useEffect(() => {
        if (!map?.pm) return; // Geoman ainda não monkey-patched
        // adiciona toolbar padrão à esquerda
        map.pm.addControls({
            position: "topleft",
            drawMarker: false,
            drawCircle: true,
            drawCircleMarker: false,
            drawText: false,
            drawPolyline: true,
            drawRectangle: false,
            drawPolygon: true,
            cutPolygon: true,
            editMode: true,
            dragMode: true,
            rotateMode: false,
            removalMode: true,
        });
        // opções globais
        try {
            map.pm.setGlobalOptions({
                allowSelfIntersection: false,
                snappable: true,
                snapDistance: 20,
            });
        } catch { }
    }, [map]);
    return null;
}


// ---------- Página ----------
export default function RestricoesViewer() {
    const axiosAuth = useAxios();
    const { getOrCreatePlanoForProject, getVersaoGeojson } = useParcelamentoApi();

    const mapRef = useRef(null);

    const [projetos, setProjetos] = useState([]);
    const [projetoSel, setProjetoSel] = useState("");
    const [versoes, setVersoes] = useState([]);
    const [restricaoSel, setRestricaoSel] = useState("");

    const [geo, setGeo] = useState(null);

    // >>> estados do parcelamento
    const [planoId, setPlanoId] = useState(null);
    const [parcelPrev, setParcelPrev] = useState({ vias: null, quarteiroes: null, lotes: null });
    const [parcelOficial, setParcelOficial] = useState({ vias: null, quarteiroes: null, lotes: null });

    // FC da loteável (normaliza em FC)
    const loteavelFC = useMemo(() => {
        const fc = geo?.area_loteavel;
        if (!fc) return { type: "FeatureCollection", features: [] };
        return fc.type === "FeatureCollection" ? fc : { type: "FeatureCollection", features: [] };
    }, [geo]);

    // geometria simples da AOI (Polygon/MultiPolygon)
    const aoiGeom = useMemo(() => (geo?.aoi || geo?.aoi_snapshot || null), [geo]);

    // área AOI e loteável
    const aoiAreaM2 = useMemo(() => areaGeoJSONMeters2(aoiGeom), [aoiGeom]);
    const loteavelAreaM2 = useMemo(() => {
        const feats = loteavelFC?.features || [];
        if (!feats.length) return 0;
        return feats.reduce((acc, f) => {
            const propA = Number(f?.properties?.area_m2);
            const a = Number.isFinite(propA) && propA > 0 ? propA : areaGeoJSONMeters2(f?.geometry);
            return acc + (Number.isFinite(a) ? a : 0);
        }, 0);
    }, [loteavelFC]);

    const aoiFmt = useMemo(() => fmtArea(aoiAreaM2), [aoiAreaM2]);
    const lotFmt = useMemo(() => fmtArea(loteavelAreaM2), [loteavelAreaM2]);
    const pctLoteavel = useMemo(() => {
        if (!aoiAreaM2) return "0,00%";
        const p = (loteavelAreaM2 / aoiAreaM2) * 100;
        return p.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
    }, [aoiAreaM2, loteavelAreaM2]);

    const [showLoteavel, setShowLoteavel] = useState(true);
    const [previewKey, setPreviewKey] = useState(0);

    // carregar projetos
    useEffect(() => {
        (async () => {
            try {
                const { data } = await axiosAuth.get("projetos/");
                setProjetos(data || []);
            } catch (e) {
                console.error("[fetch projetos] erro:", e?.message || e);
                alert("Erro ao carregar projetos (faça login).");
            }
        })();
    }, []);

    // ao mudar projeto: carrega restrições e cria/pega Plano de Parcelamento
    useEffect(() => {
        setVersoes([]);
        setRestricaoSel("");
        setGeo(null);
        setPlanoId(null);
        setParcelPrev({ vias: null, quarteiroes: null, lotes: null });
        setParcelOficial({ vias: null, quarteiroes: null, lotes: null });
        if (!projetoSel) return;
        (async () => {
            try {
                const { data } = await axiosAuth.get(`/projetos/${projetoSel}/restricoes/list/`);
                setVersoes(data || []);
            } catch (e) {
                console.error("[listar versões] erro:", e?.message || e);
                alert("Erro ao listar versões.");
            }
            try {
                const plano = await getOrCreatePlanoForProject(projetoSel);
                setPlanoId(plano?.id || null);
            } catch (e) {
                console.error("[parcelamento] plano erro:", e?.message || e);
            }
        })();
    }, [projetoSel]);

    // abrir versão de restrições
    useEffect(() => {
        setGeo(null);
        if (!restricaoSel) return;
        const ac = new AbortController();
        (async () => {
            try {
                const { data } = await axiosAuth.get(`/restricoes/${restricaoSel}/geo/`, { signal: ac.signal });
                setGeo(data);
            } catch (e) {
                if (e?.name === "CanceledError" || e?.message === "canceled") return;
                console.error("[abrir versão] erro:", e?.message || e);
                alert("Não foi possível abrir a versão.");
            }
        })();
        return () => ac.abort();
    }, [restricaoSel]);

    // AOI para render
    const aoiFC = useMemo(() => {
        const g = geo?.aoi || geo?.aoi_snapshot;
        return g ? toFC({ type: "Feature", geometry: g, properties: {} }) : null;
    }, [geo]);

    // --- handlers vindos do painel ---
    const handlePreviewParcel = (preview) => {
        // preview: { vias, quarteiroes, lotes, metrics }
        setParcelPrev({
            vias: preview?.vias || null,
            quarteiroes: preview?.quarteiroes || null,
            lotes: preview?.lotes || null,
        });
        setPreviewKey((k) => k + 1);
    };

    const handleMaterializeParcel = async (versaoId) => {
        // buscar geojson oficial da versão de parcelamento (vias/quarteirões/lotes) — se quiser
        try {
            const gj = await getVersaoGeojson(versaoId);
            setParcelOficial({
                vias: gj?.vias || null,
                quarteiroes: gj?.quarteiroes || null,
                lotes: gj?.lotes || null,
            });
            // limpa prévia após materializar
            setParcelPrev({ vias: null, quarteiroes: null, lotes: null });
        } catch (e) {
            console.error("[parcelamento] getVersaoGeojson erro:", e?.message || e);
        }
    };

    return (
        <div className="w-full h-full relative">
            {/* Painel de seleção */}
            <div className="absolute z-[1000] top-2 left-1/2 -translate-x-1/2 bg-white/80 backdrop-blur rounded-xl shadow p-3 flex flex-wrap gap-2 items-center">
                <select
                    className="border p-2 rounded min-w-[260px]"
                    value={projetoSel || ""}
                    onChange={(e) => setProjetoSel(Number(e.target.value) || "")}
                >
                    <option value="">Selecione um projeto…</option>
                    {projetos.map((p) => (
                        <option key={p.id} value={p.id}>
                            {p.name || `Projeto #${p.id}`}
                        </option>
                    ))}
                </select>

                <select
                    className="border p-2 rounded min-w-[260px]"
                    value={restricaoSel || ""}
                    onChange={(e) => setRestricaoSel(Number(e.target.value) || "")}
                    disabled={!versoes.length}
                >
                    <option value="">{versoes.length ? "Selecione uma versão…" : "Sem versões"}</option>
                    {versoes.map((v) => (
                        <option key={v.id} value={v.id}>
                            v{v.version} {v.label ? `— ${v.label}` : ""} {v.is_active ? "(ativa)" : ""}
                        </option>
                    ))}
                </select>
            </div>

            {/* QUADRO DE ÁREAS */}
            <div className="absolute z-[1000] top-40 left-2 bg-white/35 backdrop-blur rounded-xl shadow p-3 min-w-[260px]">
                <div className="font-semibold mb-2">Resumo de Áreas</div>
                <div className="text-sm flex flex-col gap-1">
                    <div className="flex justify-between">
                        <span>AOI:</span>
                        <span className="font-medium">{aoiFmt.label}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Área loteável:</span>
                        <span className="font-medium">{lotFmt.label}</span>
                    </div>
                    <div className="h-px my-2 bg-gray-200" />
                    <div className="flex justify-between">
                        <span>% loteável na AOI:</span>
                        <span className="font-medium">{pctLoteavel}</span>
                    </div>
                    <label htmlFor="toggle-loteavel" className="mt-3 flex items-center gap-2 cursor-pointer select-none">
                        <input
                            id="toggle-loteavel"
                            type="checkbox"
                            checked={!!showLoteavel}
                            onChange={(e) => setShowLoteavel(e.target.checked)}
                        />
                        Mostrar área loteável
                    </label>
                </div>
            </div>

            {/* PAINEL DE PARCELAMENTO (lateral direita) */}
            <div className="absolute z-[1000] top-2 right-2 bg-white/90 backdrop-blur rounded-xl shadow p-3 w-[360px]">
                <h3 className="font-semibold mb-2">Parcelamento</h3>
                <ParcelamentoPanel
                    map={mapRef.current}
                    planoId={planoId}
                    alFeature={loteavelFC?.features?.[0] || (aoiGeom && { type: "Feature", geometry: aoiGeom, properties: {} })}
                    onPreview={handlePreviewParcel}
                    onMaterialize={handleMaterializeParcel}
                />

            </div>

            {/* MAPA */}
            <div style={{ height: "100vh", width: "100%" }}>
                <MapContainer
                    center={[-14, -55]}
                    zoom={4}
                    style={{ height: "100%", width: "100%" }}
                    whenCreated={(m) => {
                        mapRef.current = m;
                        setTimeout(() => { try { m.invalidateSize(false); } catch { } }, 0);
                    }}
                >
                    <TilesWithFallback />

                    {/* Panes */}
                    <Pane name="pane-aoi" style={{ zIndex: 520 }} />
                    <Pane name="pane-loteavel" style={{ zIndex: 597 }} />
                    <Pane name="pane-av" style={{ zIndex: 580 }} />
                    <Pane name="pane-corte" style={{ zIndex: 585 }} />
                    <Pane name="pane-ruas" style={{ zIndex: 590 }} />
                    <Pane name="pane-rios" style={{ zIndex: 595 }} />
                    <Pane name="pane-lt" style={{ zIndex: 596 }} />
                    <Pane name="pane-ferrovias" style={{ zIndex: 597 }} />
                    {/* Novos panes para parcelamento */}
                    <Pane name="pane-parcel-prev" style={{ zIndex: 610 }} />
                    <Pane name="pane-parcel-oficial" style={{ zIndex: 611 }} />

                    {/* AOI */}
                    {aoiFC && <GeoJSON pane="pane-aoi" data={aoiFC} style={() => styleAoi} />}

                    {/* AV / Cortes */}
                    {geo?.av && <GeoJSON pane="pane-av" data={toFC(geo.av)} style={() => styleAV} />}
                    {geo?.corte_av && <GeoJSON pane="pane-corte" data={toFC(geo.corte_av)} style={() => styleCorte} />}

                    {/* Ruas */}
                    {geo?.ruas_eixo && (
                        <GeoJSON pane="pane-ruas" data={toFC(geo.ruas_eixo)} style={() => styleRuaEixo} onEachFeature={onEachWithPopup(ruaEixoPopup)} />
                    )}
                    {geo?.ruas_mask && (
                        <GeoJSON pane="pane-ruas" data={toFC(geo.ruas_mask)} style={() => styleRuaMask} onEachFeature={onEachWithPopup(ruaMaskPopup)} />
                    )}

                    {/* Rios */}
                    {geo?.rios_centerline && (
                        <GeoJSON pane="pane-rios" data={toFC(geo.rios_centerline)} style={() => styleRiosCL} onEachFeature={onEachWithPopup(margemPopup("Rio (centerline)"))} />
                    )}
                    {geo?.rios_faixa && (
                        <GeoJSON pane="pane-rios" data={toFC(geo.rios_faixa)} style={() => styleRiosFx} onEachFeature={onEachWithPopup(margemPopup("Rio (faixa)"))} />
                    )}

                    {/* LT */}
                    {geo?.lt_centerline && (
                        <GeoJSON pane="pane-lt" data={toFC(geo.lt_centerline)} style={() => styleLTCL} onEachFeature={onEachWithPopup(margemPopup("LT (centerline)"))} />
                    )}
                    {geo?.lt_faixa && (
                        <GeoJSON pane="pane-lt" data={toFC(geo.lt_faixa)} style={() => styleLTFx} onEachFeature={onEachWithPopup(margemPopup("LT (faixa)"))} />
                    )}

                    {/* Ferrovias */}
                    {geo?.ferrovias_centerline && (
                        <GeoJSON pane="pane-ferrovias" data={toFC(geo.ferrovias_centerline)} style={() => styleFerCL} onEachFeature={onEachWithPopup(margemPopup("Ferrovia (centerline)"))} />
                    )}
                    {geo?.ferrovias_faixa && (
                        <GeoJSON pane="pane-ferrovias" data={toFC(geo.ferrovias_faixa)} style={() => styleFerFx} onEachFeature={onEachWithPopup(margemPopup("Ferrovia (faixa)"))} />
                    )}

                    {/* Área loteável */}
                    {showLoteavel && loteavelFC?.features?.length > 0 && (
                        <GeoJSON pane="pane-loteavel" data={loteavelFC} style={() => styleLoteavel} />
                    )}

                    {/* ===== PARCELAMENTO: PRÉVIA (com edição e refresh) ===== */}
                    {parcelPrev.vias && (
                        <GeoJSON
                            key={`vias-${previewKey}`}
                            pane="pane-parcel-prev"
                            data={toFC(parcelPrev.vias)}
                            style={() => styleViaPreview}
                            onEachFeature={onEachViaPreview}   // << habilita edição Geoman
                        />
                    )}
                    {parcelPrev.quarteiroes && (
                        <GeoJSON
                            key={`quart-${previewKey}`}
                            pane="pane-parcel-prev"
                            data={toFC(parcelPrev.quarteiroes)}
                            style={() => styleQuartPreview}
                            onEachFeature={onEachNoEdit}       // << só visual
                        />
                    )}
                    {parcelPrev.lotes && (
                        <GeoJSON
                            key={`lotes-${previewKey}`}
                            pane="pane-parcel-prev"
                            data={toFC(parcelPrev.lotes)}
                            style={() => styleLotePreview}
                            onEachFeature={onEachNoEdit}       // << só visual
                        />
                    )}


                    {/* ===== PARCELAMENTO: OFICIAL (materializado) ===== */}
                    {parcelOficial.vias && <GeoJSON pane="pane-parcel-oficial" data={toFC(parcelOficial.vias)} style={() => styleViaOficial} />}
                    {parcelOficial.quarteiroes && <GeoJSON pane="pane-parcel-oficial" data={toFC(parcelOficial.quarteiroes)} style={() => styleQuartOficial} />}
                    {parcelOficial.lotes && <GeoJSON pane="pane-parcel-oficial" data={toFC(parcelOficial.lotes)} style={() => styleLoteOficial} />}


                    <GeomanInit />
                    {/* FIT */}
                    <FitToData geo={geo} restricaoId={restricaoSel} />
                </MapContainer>
            </div>
        </div>
    );
}
