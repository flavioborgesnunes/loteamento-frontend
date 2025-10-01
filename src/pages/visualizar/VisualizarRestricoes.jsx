// src/pages/geoman/RestricoesViewer.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    MapContainer,
    TileLayer,
    LayersControl,
    GeoJSON,
    Pane,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import useAxios from "../../utils/useAxios";

// --------- Tiles (Mapbox se houver token; senão Esri/OSM) ----------
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
                    // ✅ corrigido: faltava uma "/" entre {y} e {x}
                    url="https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    attribution="Tiles &copy; Esri"
                />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="OSM (Ruas)">
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution="&copy; OpenStreetMap"
                />
            </LayersControl.BaseLayer>
        </LayersControl>
    );
}

// --------- Helpers de FC/Bounds/Zoom ----------
function toFC(x) {
    if (!x) return { type: "FeatureCollection", features: [] };
    if (x.type === "FeatureCollection") return x;
    if (x.type === "Feature") return { type: "FeatureCollection", features: [x] };
    return { type: "FeatureCollection", features: [] };
}

function isNonEmptyFC(fc) {
    return fc && fc.type === "FeatureCollection" && Array.isArray(fc.features) && fc.features.length > 0;
}

// junta tudo que o endpoint /restricoes/{id}/geo/ devolve pra fazer um fit robusto
function collectForFitFromGeo(data) {
    const merged = { type: "FeatureCollection", features: [] };
    const pushFC = (fcLike) => {
        const fc = toFC(fcLike);
        if (isNonEmptyFC(fc)) merged.features.push(...fc.features);
    };
    // aoi (ou aoi_snapshot)
    const aoiGeom = data?.aoi || data?.aoi_snapshot || null;
    const fcAOI = aoiGeom ? toFC({ type: "Feature", geometry: aoiGeom, properties: {} }) : null;

    // coleções principais
    pushFC(data?.av);
    pushFC(data?.corte_av);
    pushFC(data?.ruas);
    pushFC(data?.rua_mask);
    pushFC(data?.rios_faixa);
    pushFC(data?.lt_faixa);
    pushFC(data?.ferrovias_faixa);

    return { acc: merged, fcAOI };
}

function computeBoundsFromFCs(listOfFCs = []) {
    const merged = { type: "FeatureCollection", features: [] };
    listOfFCs.forEach(fc => { if (isNonEmptyFC(fc)) merged.features.push(...fc.features); });
    if (!merged.features.length) return null;
    const layer = L.geoJSON(merged);
    const b = layer.getBounds?.();
    try { layer.remove?.(); } catch { }
    return (b && b.isValid()) ? b : null;
}

function fitMapToCollections(map, listOfFCs) {
    if (!map) return;
    const b = computeBoundsFromFCs(listOfFCs);
    if (!b) return;
    try { map.invalidateSize(false); } catch { }
    try { map.fitBounds(b, { padding: [30, 30] }); } catch { }
    // reforços de layout
    requestAnimationFrame(() => {
        try { map.invalidateSize(false); } catch { }
        try { map.fitBounds(b, { padding: [30, 30] }); } catch { }
    });
    setTimeout(() => {
        try { map.invalidateSize(false); } catch { }
        try { map.fitBounds(b, { padding: [30, 30] }); } catch { }
    }, 120);
}

// --------- Estilos ----------
const styleAoi = { color: "#2c7be5", weight: 2, fillOpacity: 0.05, opacity: 1 };
const styleAV = { color: "#007a4d", fillColor: "#41d686", fillOpacity: 0.45, weight: 2 };
const styleCorte = { color: "#e11d48", fillColor: "#fca5a5", fillOpacity: 0.35, weight: 2, dashArray: "6 3" };
const styleRua = { color: "#333", weight: 3, opacity: 1 };
const styleRiosFx = { color: "#2E86AB", weight: 2, opacity: 1, fillOpacity: 0.25 };
const styleLTFx = { color: "#A84300", weight: 2, opacity: 1, fillOpacity: 0.25 };
const styleFerFx = { color: "#6D4C41", weight: 2, opacity: 1, fillOpacity: 0.25 };

// --------- Componente principal ----------
export default function RestricoesViewer() {
    const axiosAuth = useAxios();
    const mapRef = useRef(null);

    // selects
    const [projetos, setProjetos] = useState([]);
    const [projetoSel, setProjetoSel] = useState("");
    const [versoes, setVersoes] = useState([]);
    const [restricaoSel, setRestricaoSel] = useState("");

    // dados carregados
    const [geo, setGeo] = useState(null);

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

    // ao mudar projeto: limpa e lista versões
    useEffect(() => {
        setVersoes([]);
        setRestricaoSel("");
        setGeo(null);
        if (!projetoSel) return;
        (async () => {
            try {
                const { data } = await axiosAuth.get(`/projetos/${projetoSel}/restricoes/list/`);
                setVersoes(data || []);
            } catch (e) {
                console.error("[listar versões] erro:", e?.message || e);
                alert("Erro ao listar versões.");
            }
        })();
    }, [projetoSel]);

    // FIT prioritário na AOI; fallback nas demais coleções
    // FIT prioritário na AOI; fallback nas demais coleções (sem loop)
    const fittedForIdRef = useRef(null);
    useEffect(() => {
        setGeo(null);
        fittedForIdRef.current = null;
        if (!restricaoSel) return;

        const ac = new AbortController();
        (async () => {
            try {
                const { data } = await axiosAuth.get(`/restricoes/${restricaoSel}/geo/`, { signal: ac.signal });
                setGeo(data);

                const map = mapRef.current;
                if (!map) return;
                if (fittedForIdRef.current === restricaoSel) return; // já deu fit nessa versão

                // junta tudo que o endpoint devolve (igual lógica do abrirProjeto)
                const merged = { type: "FeatureCollection", features: [] };
                const pushFC = (fcLike) => {
                    const fc = toFC(fcLike);
                    if (fc?.features?.length) merged.features.push(...fc.features);
                };

                // aoi (ou aoi_snapshot)
                const aoiGeom = data?.aoi || data?.aoi_snapshot || null;
                const fcAOI = aoiGeom
                    ? toFC({ type: "Feature", geometry: aoiGeom, properties: {} })
                    : null;

                // coleções
                pushFC(data?.av);
                pushFC(data?.corte_av);
                pushFC(data?.ruas);
                pushFC(data?.rua_mask);
                pushFC(data?.rios_faixa);
                pushFC(data?.lt_faixa);
                pushFC(data?.ferrovias_faixa);

                // 1) se tiver AOI, prioriza fit só nela
                if (fcAOI && fcAOI.features.length) {
                    fitMapToCollections(map, [fcAOI]);
                    fittedForIdRef.current = restricaoSel;
                    return;
                }

                // 2) fallback: fit em tudo que coletamos
                if (merged.features.length) {
                    fitMapToCollections(map, [merged]);
                    fittedForIdRef.current = restricaoSel;
                    return;
                }

                // 3) fallback final: centro padrão
                map.setView([-14, -55], 4);
                fittedForIdRef.current = restricaoSel;

            } catch (e) {
                if (e?.name === "CanceledError" || e?.message === "canceled") return;
                console.error("[abrir versão] erro:", e?.message || e);
                alert("Não foi possível abrir a versão.");
            }
        })();
        return () => ac.abort();
    }, [restricaoSel]);


    // AOI (para render, caso venha no payload)
    const aoiFC = useMemo(() => {
        const g = geo?.aoi || geo?.aoi_snapshot;
        return g ? toFC({ type: "Feature", geometry: g, properties: {} }) : null;
    }, [geo]);

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

            {/* MAPA */}
            <div style={{ height: "100vh", width: "100%" }}>
                <MapContainer
                    center={[-14, -55]}
                    zoom={4}
                    style={{ height: "100%", width: "100%" }}
                    whenCreated={(m) => {
                        mapRef.current = m;
                        setTimeout(() => {
                            try { m.invalidateSize(false); } catch { }
                        }, 0);
                    }}
                >
                    <TilesWithFallback />

                    {/* Panes com ordem de desenho */}
                    <Pane name="pane-aoi" style={{ zIndex: 520 }} />
                    <Pane name="pane-av" style={{ zIndex: 580 }} />
                    <Pane name="pane-corte" style={{ zIndex: 585 }} />
                    <Pane name="pane-ruas" style={{ zIndex: 590 }} />
                    <Pane name="pane-rios" style={{ zIndex: 595 }} />
                    <Pane name="pane-lt" style={{ zIndex: 596 }} />
                    <Pane name="pane-ferrovias" style={{ zIndex: 597 }} />

                    {aoiFC && <GeoJSON pane="pane-aoi" data={aoiFC} style={() => styleAoi} />}

                    {geo?.av && (
                        <GeoJSON pane="pane-av" data={toFC(geo.av)} style={() => styleAV} />
                    )}

                    {geo?.corte_av && (
                        <GeoJSON pane="pane-corte" data={toFC(geo.corte_av)} style={() => styleCorte} />
                    )}

                    {geo?.ruas && (
                        <GeoJSON pane="pane-ruas" data={toFC(geo.ruas)} style={() => styleRua} />
                    )}

                    {/* Se você quiser ver as FAIXAS/MÁSCARAS (polígonos) que salvamos */}
                    {geo?.rua_mask && (
                        <GeoJSON pane="pane-ruas" data={toFC(geo.rua_mask)} style={() => ({ ...styleRua, weight: 1, opacity: 0.7, fillOpacity: 0.25 })} />
                    )}
                    {geo?.rios_faixa && (
                        <GeoJSON pane="pane-rios" data={toFC(geo.rios_faixa)} style={() => styleRiosFx} />
                    )}
                    {geo?.lt_faixa && (
                        <GeoJSON pane="pane-lt" data={toFC(geo.lt_faixa)} style={() => styleLTFx} />
                    )}
                    {geo?.ferrovias_faixa && (
                        <GeoJSON pane="pane-ferrovias" data={toFC(geo.ferrovias_faixa)} style={() => styleFerFx} />
                    )}
                </MapContainer>
            </div>
        </div>
    );
}
